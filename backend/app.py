# app.py

import os
import time
import win32gui
import ctypes
import win32con
import win32api
import win32process
import logging
import datetime
import pythoncom
import re
import queue
import json
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

import win32com.client
from win32com.client import gencache
from logging.handlers import TimedRotatingFileHandler

_user32 = ctypes.WinDLL("user32", use_last_error=True)

# === Logging ===
os.makedirs("logs", exist_ok=True)
logger = logging.getLogger("backend")
logger.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

file_handler = TimedRotatingFileHandler("logs/backend.log", when="midnight", interval=1, backupCount=7, encoding="utf-8")
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# === FastAPI + CORS ===
app = FastAPI(title="EAi Email Assistant Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"→ {request.method} {request.url.path}")
    start = time.time()
    response = await call_next(request)
    elapsed = (time.time() - start) * 1000
    logger.info(f"← {request.method} {request.url.path} completed in {elapsed:.2f}ms with status {response.status_code}")
    return response

@app.on_event("startup")
def on_startup():
    logger.info("Starting backend service")
    try:
        pythoncom.CoInitialize()
        gencache.is_readonly = False
        gencache.Rebuild()
        logger.info("Outlook COM cache rebuilt successfully.")
    except Exception as e:
        logger.warning(f"Could not rebuild Outlook COM cache: {e}")
    finally:
        pythoncom.CoUninitialize()

@app.on_event("shutdown")
def on_shutdown():
    logger.info("Shutting down backend service")


# === Runtime Config (timing only) ===
BACKEND_CONFIG = {
    "fetch_interval_minutes": 5,
    "lookback_hours":         3,
    "start":                  None,  # ISO strings or None
    "end":                    None,
}

# === Dynamic User Config (identity & VIP list) ===
USER_CONFIG = {
    "outlook_email":  None,
    "full_name":      None,
    "aliases":        [],
    "vip_group_name": None,
    "vip_emails":     [],
    "vip_names":      []
}

# === Pydantic Models ===
class EmailItem(BaseModel):
    message_id:      str
    conversation_id: str
    sender:          str
    subject:         str
    preview:         str
    received:        str
    importance:      int
    reason:          str

class ConfigItem(BaseModel):
    fetch_interval_minutes: int
    lookback_hours:         int
    start:                  Optional[datetime.datetime]
    end:                    Optional[datetime.datetime]

class UserConfigItem(BaseModel):
    outlook_email:  str
    full_name:      str
    aliases:        Optional[List[str]] = []
    vip_group_name: str
    vip_emails:     List[str]

# === SSE queue ===
fetch_queue: queue.Queue[str] = queue.Queue()

# === Helpers ===
def extract_last_email(body: str) -> str:
    parts = re.split(
        r"""(
            ^[ \t]*On\s+\d{1,2}\s+\w+\s+\d{4},\s*at\s*\d{1,2}:\d{2},\s*.+?\s+wrote:
          | ^[ \t]*On\s+.+\s+wrote:
          | ^[ \t]*-----Original Message-----
          | ^[ \t]*(?:From|De|Von|Da|От|发件人|寄件者|差出人|보낸\s+사람)\s*:.+
        )""",
        body,
        flags=re.IGNORECASE | re.MULTILINE | re.VERBOSE
    )
    return parts[0].strip()

def normalize_sender(name: str, smtp: str) -> str:
    if name.startswith("/o="):
        seg = name.split("/cn=")[-1]
        if "-" in seg:
            fn_ln = seg.split("-",1)[1]
            if "." in fn_ln:
                f,l = fn_ln.split(".",1)
                return f.capitalize() + " " + l.capitalize()
        return smtp or name
    return name or smtp

def rate_and_reason(m: dict) -> tuple[int,str]:
    outlook    = USER_CONFIG["outlook_email"].lower()
    full_name  = (USER_CONFIG["full_name"] or "").lower()
    aliases    = [a.lower() for a in USER_CONFIG["aliases"]]
    vip_emails = USER_CONFIG["vip_emails"]
    vip_names  = USER_CONFIG["vip_names"]
    vip_name   = USER_CONFIG["vip_group_name"]

    sender_smtp = m["sender_smtp"].lower()
    sender_name = m["sender"].lower()
    last_body   = m["last_body"]

    is_vip  = sender_smtp in vip_emails or sender_name in vip_names
    sole_to = (len(m["to_smtp"]) == 1 and m["to_smtp"][0] == outlook)
    mention = False
    if full_name and full_name in last_body:
        mention = True
    for alias in aliases:
        if alias and alias in last_body:
            mention = True
            break

    if is_vip and sole_to:
        return 5, f"From {vip_name} + Direct To You"
    if mention and is_vip:
        return 5, f"From {vip_name} + Mentioned You"
    if is_vip:
        return 4, f"From {vip_name}"
    if mention:
        return 4, "Mentioned You"
    if sole_to:
        return 3, "Direct To You"
    if (
        not is_vip
        and outlook in m["to_smtp"]
        and 2 <= len(m["to_smtp"]) <= 3
    ):
        return 2, "Small Group"
    if (
        not is_vip
        and outlook in m["rec_smtp"]
        and any(addr in vip_emails for addr in m["to_smtp"])
    ):
        return 2, f"{vip_name} Recipients"
    return 0, ""

def fetch_dicts(preset: bool,
                start: Optional[datetime.datetime]=None,
                end:   Optional[datetime.datetime]=None) -> list[dict]:
    pythoncom.CoInitialize()
    out = []
    try:
        ns    = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        inbox = ns.GetDefaultFolder(6)

        if not preset:
            fmt = "%m/%d/%Y %I:%M %p"
            flt = (
                f"[UnRead]=True "
                f"AND [ReceivedTime]>='{start.strftime(fmt)}' "
                f"AND [ReceivedTime]<='{end.strftime(fmt)}'"
            )
        else:
            cutoff = datetime.datetime.now() - datetime.timedelta(hours=BACKEND_CONFIG["lookback_hours"])
            flt    = f"[UnRead]=True AND [ReceivedTime]>='{cutoff.strftime('%m/%d/%Y %I:%M %p')}'"

        try:
            items = inbox.Items.Restrict(flt)
        except Exception:
            items = []

        outlook   = USER_CONFIG["outlook_email"].lower()
        full_name = (USER_CONFIG["full_name"] or "").lower()
        aliases   = [a.lower() for a in USER_CONFIG["aliases"]]

        for msg in items:
            try:
                if msg.Class != 43:
                    continue
            except AttributeError:
                continue

            rec_smtp, rec_names, to_smtp = [], [], []
            for r in msg.Recipients:
                try:
                    ex   = r.AddressEntry.GetExchangeUser()
                    addr = (ex.PrimarySmtpAddress or r.Address).lower()
                except:
                    addr = r.Address.lower()
                rec_smtp.append(addr)
                rec_names.append(r.Name.lower())
                if r.Type == 1:
                    to_smtp.append(addr)

            if (
                outlook not in rec_smtp
                and full_name not in rec_names
                and not any(alias in rec_names for alias in aliases)
            ):
                continue

            try:
                exch = msg.Sender.AddressEntry.GetExchangeUser()
                raw_smtp = (exch.PrimarySmtpAddress or msg.SenderEmailAddress).lower()
            except:
                raw_smtp = (msg.SenderEmailAddress or "").lower()
            raw_name  = (msg.Sender.Name or "").strip()

            body      = msg.Body or ""
            last_body = extract_last_email(body)
            snippet   = last_body[:200].replace("\r", " ").replace("\n", " ")
            received  = msg.ReceivedTime.isoformat()
            conv_id   = msg.ConversationID

            out.append({
                "message_id":      msg.EntryID,
                "conversation_id": conv_id,
                "sender":          normalize_sender(raw_name, raw_smtp),
                "sender_smtp":     raw_smtp,
                "subject":         msg.Subject or "",
                "preview":         snippet,
                "received":        received,
                "rec_smtp":        rec_smtp,
                "to_smtp":         to_smtp,
                "last_body":       last_body.lower(),
            })
    finally:
        pythoncom.CoUninitialize()

    logger.info(f"Fetched {len(out)} emails{' in custom range' if not preset else ''}.")
    return out

def fetch_and_track():
    start  = BACKEND_CONFIG.get("start")
    end    = BACKEND_CONFIG.get("end")
    preset = not (start and end)
    if not preset:
        start_dt = datetime.datetime.fromisoformat(start)
        end_dt   = datetime.datetime.fromisoformat(end)
        _ = fetch_dicts(False, start_dt, end_dt)
    else:
        _ = fetch_dicts(True)
    fetch_queue.put(datetime.datetime.utcnow().isoformat())

scheduler = None
try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.schedulers.base import SchedulerAlreadyRunningError
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        fetch_and_track,
        trigger="interval",
        minutes=BACKEND_CONFIG["fetch_interval_minutes"],
        id="fetch_job",
        replace_existing=True
    )
    scheduler.start()
    logger.info("Scheduler started")
except Exception as e:
    logger.warning(f"Scheduler error: {e}")

# === API Endpoints ===

@app.get("/config", response_model=ConfigItem)
def get_config():
    return ConfigItem(**BACKEND_CONFIG)

@app.post("/config", response_model=ConfigItem)
def set_config(cfg: ConfigItem):
    if not (1 <= cfg.fetch_interval_minutes <= 1440 and 1 <= cfg.lookback_hours <= 720):
        raise HTTPException(400, "Values out of range")
    if (cfg.start is None) ^ (cfg.end is None):
        raise HTTPException(400, "Must provide both start and end for custom range")
    if cfg.start and cfg.end:
        if cfg.end <= cfg.start:
            raise HTTPException(400, "End must be after start")
        if cfg.end - cfg.start > datetime.timedelta(days=31):
            raise HTTPException(400, "Range cannot exceed 31 days")
    BACKEND_CONFIG.update({
        "fetch_interval_minutes": cfg.fetch_interval_minutes,
        "lookback_hours":         cfg.lookback_hours,
        "start":                  cfg.start.isoformat() if cfg.start else None,
        "end":                    cfg.end.isoformat()   if cfg.end   else None,
    })
    if scheduler:
        scheduler.reschedule_job("fetch_job", trigger="interval", minutes=cfg.fetch_interval_minutes)
        logger.info(f"Rescheduled fetch every {cfg.fetch_interval_minutes} minutes")
    return ConfigItem(**BACKEND_CONFIG)

@app.post("/user-config", response_model=UserConfigItem)
def set_user_config(cfg: UserConfigItem):
    missing = [f for f in ("outlook_email", "full_name", "vip_group_name", "vip_emails") if not getattr(cfg, f)]
    if missing:
        raise HTTPException(400, f"Missing user configuration: {', '.join(missing)}")

    parsed_emails: List[str] = []
    parsed_names: List[str]  = []
    for entry in cfg.vip_emails:
        m = re.match(r'^(.*?)<([^>]+)>$', entry)
        if m:
            name_part  = m.group(1).strip()
            email_part = m.group(2).strip()
        else:
            name_part  = None
            email_part = entry.strip()
        parsed_emails.append(email_part.lower())
        if name_part:
            parsed_names.append(name_part.lower())

    USER_CONFIG.update({
        "outlook_email":  cfg.outlook_email.lower(),
        "full_name":      cfg.full_name.lower(),
        "aliases":        [a.lower() for a in (cfg.aliases or [])],
        "vip_group_name": cfg.vip_group_name,
        "vip_emails":     parsed_emails,
        "vip_names":      parsed_names
    })
    logger.info(f"User config set: {cfg.outlook_email}, VIP group {cfg.vip_group_name}")
    return cfg

@app.post("/fetch-now")
def fetch_now():
    fetch_and_track()
    logger.info("Manual fetch triggered")
    return {"ok": True}

@app.get("/events")
async def events():
    async def event_generator():
        while True:
            ts = await run_in_threadpool(fetch_queue.get)
            yield f"event: fetched\ndata: {json.dumps({'timestamp': ts})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/emails", response_model=List[EmailItem])
def get_emails(
    start: Optional[datetime.datetime] = Query(None),
    end:   Optional[datetime.datetime] = Query(None),
):
    required = ("outlook_email", "full_name", "vip_group_name", "vip_emails")
    missing = [k for k in required if USER_CONFIG.get(k) is None or USER_CONFIG.get(k) == []]
    if missing:
        raise HTTPException(400, f"Missing user configuration: {', '.join(missing)}")
    if (start is None) ^ (end is None):
        raise HTTPException(400, "Must provide both start and end or neither")
    if start and end:
        if end <= start:
            raise HTTPException(400, "End must be after start")
        if end - start > datetime.timedelta(days=31):
            raise HTTPException(400, "Range cannot exceed 31 days")
        msgs = fetch_dicts(False, start, end)
    else:
        msgs = fetch_dicts(True)

    out = []
    for m in msgs:
        imp, reason = rate_and_reason(m)
        if imp < 2:
            continue
        email_item = EmailItem(
            message_id      = m["message_id"],
            conversation_id = m["conversation_id"],
            sender          = m["sender"],
            subject         = m["subject"],
            preview         = m["preview"],
            received        = m["received"],
            importance      = imp,
            reason          = reason
        )
        out.append(email_item)
    logger.info(f"Returning {len(out)} filtered emails")
    return out

@app.post("/emails/{mid}/dismiss")
def dismiss(mid: str):
    pythoncom.CoInitialize()
    try:
        ns   = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        mail = ns.GetItemFromID(mid)
        mail.UnRead = False
        mail.Save()
        logger.info(f"Dismissed email {mid}")
    except Exception as e:
        logger.error(f"COM mark-as-read failed: {e}")
    finally:
        pythoncom.CoUninitialize()
    return {"ok": True}

@app.post("/emails/{mid}/dismiss-conversation")
def dismiss_conversation(mid: str):
    pythoncom.CoInitialize()
    try:
        ns   = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        mail = ns.GetItemFromID(mid)
        conv = mail.GetConversation()
        table = conv.GetTable()
        count = 0
        while not table.EndOfTable:
            row = table.GetNextRow()
            try:
                entry_id = row.Item("EntryID")
                item     = ns.GetItemFromID(entry_id)
                item.UnRead = False
                item.Save()
                count += 1
            except:
                continue
        logger.info(f"Dismissed conversation of email {mid}, total {count} messages")
    except Exception as e:
        logger.error(f"Error dismissing conversation: {e}")
    finally:
        pythoncom.CoUninitialize()
    return {"ok": True}

@app.post("/open/{mid}")
def open_mid(mid: str):
    try:
        pythoncom.CoInitialize()
        ns        = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        mail      = ns.GetItemFromID(mid)
        inspector = mail.GetInspector()
        inspector.Display()
        logger.info(f"Opened email {mid} in Outlook")
    except Exception as e:
        logger.error(f"COM open failed: {e}")
        raise HTTPException(500, f"COM open failed: {e}")
    finally:
        pythoncom.CoUninitialize()

    try:
        time.sleep(0.1)
        hwnd = win32gui.GetForegroundWindow()
        win32gui.ShowWindow(hwnd, win32con.SW_SHOWNORMAL)

        fg_hwnd     = win32gui.GetForegroundWindow()
        fg_thread   = win32process.GetWindowThreadProcessId(fg_hwnd)[0]
        this_thread = win32api.GetCurrentThreadId()

        if not _user32.AttachThreadInput(fg_thread, this_thread, True):
            err = ctypes.get_last_error()
            logger.warning(f"AttachThreadInput failed with error {err}")
        win32gui.SetForegroundWindow(hwnd)
        _user32.AttachThreadInput(fg_thread, this_thread, False)
    except Exception as focus_e:
        logger.warning(f"Focus‐hack failed; window may not be front: {focus_e}")

    return {"ok": True}

@app.get("/health/local")
def health_local():
    logger.info("Health check: local OK")
    return {"ok": True}

@app.get("/health/outlook")
def health_outlook():
    try:
        pythoncom.CoInitialize()
        win32com.client.GetActiveObject("Outlook.Application")
        logger.info("Health check: outlook OK")
        return {"ok": True}
    except:
        logger.error("Health check: outlook unavailable")
        raise HTTPException(503, "Outlook unavailable")
    finally:
        pythoncom.CoUninitialize()
