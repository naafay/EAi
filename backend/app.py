# app.py

import logging
import datetime
import sqlite3
import pythoncom
import re
import win32com.client
import queue
import json
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.base import SchedulerAlreadyRunningError
from starlette.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

# === Configuration ===
EMAIL_ADDRESS    = "abdul.nafay@aviatnet.com"
EMAIL_ALIAS_NAME = "Abdul Nafay"
DB_PATH          = "emails.db"

ELT_EMAILS = {
    "enrico.leonardi@aviatnet.com",
    "pete.smith@aviatnet.com",
    "michael.connaway@aviatnet.com",
    "gary.croke@aviatnet.com",
    "erin.boase@aviatnet.com",
    "spencer.stoakley@aviatnet.com",
}
ELT_NAMES = {
    "Enrico Leonardi",
    "Pete Smith",
    "Michael Connaway",
    "Gary Croke",
    "Erin Boase",
    "Spencer Stoakley",
}

# === Runtime Config ===
BACKEND_CONFIG = {
    "fetch_interval_minutes": 5,
    "lookback_hours":         3,
    "start":                  None,  # Optional[datetime]
    "end":                    None,
}

# === Logging ===
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# === FastAPI + CORS ===
app = FastAPI(title="EAi Email Assistant Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Database ===
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
c    = conn.cursor()
c.execute("""
CREATE TABLE IF NOT EXISTS tracked_emails(
  message_id TEXT PRIMARY KEY,
  dismissed_at DATETIME NULL
)
""")
conn.commit()

# === Pydantic Models ===
class EmailItem(BaseModel):
    message_id: str
    sender:      str
    subject:     str
    preview:     str
    received:    str
    importance:  int
    reason:      str

class ConfigItem(BaseModel):
    fetch_interval_minutes: int
    lookback_hours:         int
    start:                  Optional[datetime.datetime] = None
    end:                    Optional[datetime.datetime] = None

# === SSE queue ===
fetch_queue: queue.Queue[str] = queue.Queue()

# === Helpers ===
def extract_last_email(body: str) -> str:
    parts = re.split(
        r"""(
            ^[ \t]*On\s+\d{1,2}\s+\w+\s+\d{4},\s*at\s*\d{1,2}:\d{2},\s*.+?\s+wrote:
          | ^[ \t]*On\s+.+\s+wrote:
          | ^[ \t]*-----Original Message-----
          | ^[ \t]*From:.+
          | ^[ \t]*De\s*:.+
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
                return f.capitalize()+" "+l.capitalize()
        return smtp or name
    return name or smtp

def rate_and_reason(m: dict) -> tuple[int,str]:
    is_elt   = (m["sender_smtp"] in ELT_EMAILS or m["sender"] in ELT_NAMES)
    sole_to  = (len(m["to_smtp"]) == 1 and m["to_smtp"][0] == EMAIL_ADDRESS.lower())
    mention  = ("abdul" in m["last_body"] or "nafay" in m["last_body"])

    if is_elt and sole_to:
        return 5, "ELT + Sole-To"
    if mention and is_elt:
        return 5, "ELT + Mention"
    if is_elt:
        return 4, "ELT Sender"
    if mention:
        return 4, "Mention Only"
    if sole_to:
        return 3, "Sole-To Only"
    if (
        not is_elt
        and EMAIL_ADDRESS.lower() in m["to_smtp"]
        and 2 <= len(m["to_smtp"]) <= 3
    ):
        return 2, "Small To Group"
    if (
        not is_elt
        and EMAIL_ADDRESS.lower() in m["rec_smtp"]
        and any(addr in ELT_EMAILS for addr in m["to_smtp"])
    ):
        return 2, "ELT Recipients"
    return 0, ""

def fetch_dicts(preset: bool,
                start: Optional[datetime.datetime]=None,
                end:   Optional[datetime.datetime]=None) -> list[dict]:
    """Unified fetch: either preset lookback or explicit range."""
    pythoncom.CoInitialize()
    out = []
    try:
        ns    = win32com.client.gencache.EnsureDispatch("Outlook.Application").GetNamespace("MAPI")
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
        except:
            items = []

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
                EMAIL_ADDRESS.lower() not in rec_smtp
                and EMAIL_ALIAS_NAME.lower() not in " ".join(rec_names)
            ):
                continue

            body      = msg.Body or ""
            last_body = extract_last_email(body)
            snippet   = last_body[:200].replace("\r"," ").replace("\n"," ")
            raw_name  = (msg.Sender.Name or "").strip()
            raw_smtp  = (msg.SenderEmailAddress or "").lower()
            sender    = normalize_sender(raw_name, raw_smtp)
            received  = msg.ReceivedTime.isoformat()
            out.append({
                "message_id": msg.EntryID,
                "sender":      sender,
                "sender_smtp": raw_smtp,
                "subject":     msg.Subject or "",
                "preview":     snippet,
                "received":    received,
                "rec_smtp":    rec_smtp,
                "to_smtp":     to_smtp,
                "last_body":   last_body.lower(),
            })
    finally:
        pythoncom.CoUninitialize()

    logging.info(f"Fetched {len(out)} emails{' in custom range' if not preset else ''}.")
    return out

def fetch_and_track():
    # called by scheduler: uses config persistence
    start = BACKEND_CONFIG.get("start")
    end   = BACKEND_CONFIG.get("end")
    preset = not (start and end)
    if not preset:
        start_dt = datetime.datetime.fromisoformat(start)
        end_dt   = datetime.datetime.fromisoformat(end)
        items = fetch_dicts(False, start_dt, end_dt)
    else:
        items = fetch_dicts(True)
    for m in items:
        c.execute(
            "INSERT OR IGNORE INTO tracked_emails(message_id, dismissed_at) VALUES (?, NULL)",
            (m["message_id"],)
        )
    conn.commit()
    fetch_queue.put(datetime.datetime.utcnow().isoformat())

# === Scheduler ===
scheduler = BackgroundScheduler()
scheduler.add_job(
    fetch_and_track,
    trigger="interval",
    minutes=BACKEND_CONFIG["fetch_interval_minutes"],
    id="fetch_job",
    replace_existing=True
)
try:
    scheduler.start()
except SchedulerAlreadyRunningError:
    pass

# === API Endpoints ===

@app.get("/config", response_model=ConfigItem)
def get_config():
    return ConfigItem(**BACKEND_CONFIG)  # includes optional start/end

@app.post("/config", response_model=ConfigItem)
def set_config(cfg: ConfigItem):
    # validate presets
    if not (1 <= cfg.fetch_interval_minutes <= 1440 and 1 <= cfg.lookback_hours <= 720):
        raise HTTPException(400, "Values out of range")
    # if custom range provided, validate
    if (cfg.start is None) ^ (cfg.end is None):
        raise HTTPException(400, "Must provide both start and end for custom range")
    if cfg.start and cfg.end:
        if cfg.end <= cfg.start:
            raise HTTPException(400, "End must be after start")
        if cfg.end - cfg.start > datetime.timedelta(days=31):
            raise HTTPException(400, "Range cannot exceed 31 days")
    # update
    BACKEND_CONFIG.update({
        "fetch_interval_minutes": cfg.fetch_interval_minutes,
        "lookback_hours":         cfg.lookback_hours,
        "start":                  cfg.start.isoformat() if cfg.start else None,
        "end":                    cfg.end.isoformat()   if cfg.end   else None,
    })
    scheduler.reschedule_job("fetch_job",
                             trigger="interval",
                             minutes=cfg.fetch_interval_minutes)
    return ConfigItem(**BACKEND_CONFIG)

@app.post("/fetch-now")
def fetch_now():
    fetch_and_track()
    return {"ok": True}

@app.get("/events")
async def events():
    async def event_generator():
        while True:
            ts = await run_in_threadpool(fetch_queue.get)
            yield f"event: fetched\ndata: {json.dumps({'timestamp': ts})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/emails", response_model=list[EmailItem])
def get_emails(
    start: Optional[datetime.datetime] = Query(None),
    end:   Optional[datetime.datetime] = Query(None),
):
    # either both or neither
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
        row = c.execute(
            "SELECT dismissed_at FROM tracked_emails WHERE message_id=?",
            (m["message_id"],)
        ).fetchone()
        if row and row[0] is not None:
            continue
        out.append(EmailItem(
            message_id=m["message_id"],
            sender     =m["sender"],
            subject    =m["subject"],
            preview    =m["preview"],
            received   =m["received"],
            importance =imp,
            reason     =reason
        ))
    return out

@app.post("/emails/{mid}/dismiss")
def dismiss(mid: str):
    now = datetime.datetime.now().isoformat()
    c.execute(
        "INSERT OR REPLACE INTO tracked_emails(message_id, dismissed_at) VALUES (?, ?)",
        (mid, now)
    )
    conn.commit()
    pythoncom.CoInitialize()
    try:
        ns   = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        mail = ns.GetItemFromID(mid)
        mail.UnRead = False
        mail.Save()
    except Exception as e:
        logging.error(f"COM mark-as-read failed: {e}")
    finally:
        pythoncom.CoUninitialize()
    return {"ok": True}

@app.post("/open/{mid}")
def open_mid(mid: str):
    pythoncom.CoInitialize()
    try:
        ns   = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        mail = ns.GetItemFromID(mid)
        mail.Display()
    except Exception as e:
        logging.error(f"COM open failed: {e}")
        raise HTTPException(500, f"COM open failed: {e}")
    finally:
        pythoncom.CoUninitialize()
    return {"ok": True}
