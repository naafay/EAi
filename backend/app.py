import logging
import datetime
import sqlite3
import pythoncom
import re
import win32com.client
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.base import SchedulerAlreadyRunningError

# === Configuration ===
EMAIL_ADDRESS    = "abdul.nafay@aviatnet.com"
EMAIL_ALIAS_NAME = "Abdul Nafay"
DB_PATH          = "emails.db"
FETCH_INTERVAL   = 5  # minutes

# Executive Leadership Team SMTPs (lowercase)
ELT_EMAILS = {
    "enrico.leonardi@aviatnet.com",
    "pete.smith@aviatnet.com",
    "michael.connaway@aviatnet.com",
    "gary.croke@aviatnet.com",
    "erin.boase@aviatnet.com",
    "spencer.stoakley@aviatnet.com",
}

# Executive Leadership Team display-name aliases (capitalized)
ELT_NAMES = {
    "Enrico Leonardi",
    "Pete Smith",
    "Michael Connaway",
    "Gary Croke",
    "Erin Boase",
    "Spencer Stoakley",
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

# === Pydantic Model ===
class EmailItem(BaseModel):
    message_id: str
    sender:      str
    subject:     str
    preview:     str
    received:    str
    importance:  int

# === Helpers ===
def extract_last_email(body: str) -> str:
    # Split on common “new‐message” markers in English and French
    parts = re.split(
        r"(\r?\nOn .+ wrote:|-----Original Message-----|\r?\nFrom:.+|\r?\nDe\s*:.+)",
        body,
        flags=re.IGNORECASE
    )
    return parts[0].strip()

def normalize_sender(name: str, smtp: str) -> str:
    if name.startswith("/o="):
        seg = name.split("/cn=")[-1]
        if "-" in seg:
            fn_ln = seg.split("-",1)[1]
            if "." in fn_ln:
                f, l = fn_ln.split(".",1)
                return f.capitalize() + " " + l.capitalize()
        return smtp or name
    return name or smtp

def fetch_outlook_dicts() -> list[dict]:
    logging.info("Fetching Outlook emails…")
    pythoncom.CoInitialize()
    try:
        ns = win32com.client.gencache.EnsureDispatch("Outlook.Application")\
                                    .GetNamespace("MAPI")
    except Exception as e:
        logging.error(f"COM init failed: {e}")
        pythoncom.CoUninitialize()
        return []

    inbox = ns.GetDefaultFolder(6)  # Inbox
    cutoff = datetime.datetime.now() - datetime.timedelta(hours=3)
    flt    = f"[UnRead]=True AND [ReceivedTime]>='{cutoff.strftime('%m/%d/%Y %I:%M %p')}'"
    try:
        items = inbox.Items.Restrict(flt)
    except Exception:
        items = []

    out = []
    for msg in items:
        try:
            rec_smtp  = []
            rec_names = []
            to_smtp   = []
            for r in msg.Recipients:
                try:
                    ex   = r.AddressEntry.GetExchangeUser()
                    addr = (ex.PrimarySmtpAddress or r.Address).lower()
                except:
                    addr = r.Address.lower()
                rec_smtp.append(addr)
                rec_names.append(r.Name.lower())
                if r.Type == 1:  # 1 == To
                    to_smtp.append(addr)

            # must be addressed to you in To or CC
            if (EMAIL_ADDRESS.lower() not in rec_smtp
               and EMAIL_ALIAS_NAME.lower() not in " ".join(rec_names)):
                continue

            full_body = msg.Body or ""
            last_body = extract_last_email(full_body)
            snippet   = last_body[:200].replace("\r"," ").replace("\n"," ")

            raw_name    = (msg.Sender.Name or "").strip()
            raw_smtp    = (msg.SenderEmailAddress or "").lower()
            sender_name = normalize_sender(raw_name, raw_smtp)

            received = msg.ReceivedTime.isoformat()
            entry_id = msg.EntryID

            out.append({
                "message_id": entry_id,
                "sender":      sender_name,
                "sender_smtp": raw_smtp,
                "subject":     msg.Subject or "",
                "preview":     snippet,
                "received":    received,
                "rec_smtp":    rec_smtp,
                "to_smtp":     to_smtp,
                "last_body":   last_body.lower(),
            })
        except Exception as e:
            logging.error(f"Process error: {e}")
    pythoncom.CoUninitialize()
    logging.info(f"Fetched {len(out)} emails.")
    return out

def rate_with_logic(m: dict) -> int:
    is_elt   = (m["sender_smtp"] in ELT_EMAILS or m["sender"] in ELT_NAMES)
    sole_to  = (len(m["to_smtp"]) == 1 and m["to_smtp"][0] == EMAIL_ADDRESS.lower())
    mention  = ("abdul" in m["last_body"] or "nafay" in m["last_body"])

    # apply OR logic in priority order
    if is_elt and sole_to:
        return 5
    if mention and is_elt:
        return 5
    if is_elt:
        return 4
    if mention:
        return 4
    if sole_to:
        return 3
    return 0

# === Scheduler for tracking ===
scheduler = BackgroundScheduler()
scheduler.add_job(
    lambda: [
        c.execute(
            "INSERT OR IGNORE INTO tracked_emails(message_id, dismissed_at) VALUES (?, NULL)",
            (m["message_id"],)
        ) for m in fetch_outlook_dicts()
    ],
    'interval',
    minutes=FETCH_INTERVAL
)
try:
    scheduler.start()
except SchedulerAlreadyRunningError:
    pass

# === API Endpoints ===
@app.get("/emails", response_model=list[EmailItem])
def get_emails():
    msgs = fetch_outlook_dicts()
    out  = []
    for m in msgs:
        imp = rate_with_logic(m)
        if imp < 3:
            continue

        # skip if dismissed
        row = c.execute(
            "SELECT dismissed_at FROM tracked_emails WHERE message_id=?",
            (m["message_id"],)
        ).fetchone()
        if row and row[0] is not None:
            continue

        out.append(EmailItem(
            message_id=m["message_id"],
            sender=m["sender"],
            subject=m["subject"],
            preview=m["preview"],
            received=m["received"],
            importance=imp
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
import logging
import datetime
import sqlite3
import pythoncom
import re
import win32com.client
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.base import SchedulerAlreadyRunningError

# === Configuration ===
EMAIL_ADDRESS    = "abdul.nafay@aviatnet.com"
EMAIL_ALIAS_NAME = "Abdul Nafay"
DB_PATH          = "emails.db"
FETCH_INTERVAL   = 5  # minutes

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

# === Pydantic Model ===
class EmailItem(BaseModel):
    message_id: str
    sender:      str
    subject:     str
    preview:     str
    received:    str
    importance:  int
    reason:      str

# === Helpers ===
def extract_last_email(body: str) -> str:
    parts = re.split(
        r"(\r?\nOn .+ wrote:|-----Original Message-----|\r?\nFrom:.+)",
        body, flags=re.IGNORECASE
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
    sole_to  = (len(m["to_smtp"]) == 1
                and m["to_smtp"][0] == EMAIL_ADDRESS.lower())
    mention  = ("abdul" in m["last_body"] or "nafay" in m["last_body"])

    # top-down priority
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
    return 0, ""

def fetch_outlook_dicts() -> list[dict]:
    logging.info("Fetching Outlook emails…")
    pythoncom.CoInitialize()
    try:
        ns = win32com.client.gencache.EnsureDispatch("Outlook.Application")\
                                    .GetNamespace("MAPI")
    except Exception as e:
        logging.error(f"COM init failed: {e}")
        pythoncom.CoUninitialize()
        return []

    inbox = ns.GetDefaultFolder(6)
    cutoff = datetime.datetime.now() - datetime.timedelta(hours=3)
    flt = f"[UnRead]=True AND [ReceivedTime]>='{cutoff.strftime('%m/%d/%Y %I:%M %p')}'"
    try:
        items = inbox.Items.Restrict(flt)
    except Exception:
        items = []

    out = []
    for msg in items:
        try:
            rec_smtp, rec_names, to_smtp = [], [], []
            for r in msg.Recipients:
                try:
                    ex   = r.AddressEntry.GetExchangeUser()
                    addr = (ex.PrimarySmtpAddress or r.Address).lower()
                except:
                    addr = r.Address.lower()
                rec_smtp.append(addr)
                rec_names.append(r.Name.lower())
                if r.Type == 1: to_smtp.append(addr)

            if (EMAIL_ADDRESS.lower() not in rec_smtp
               and EMAIL_ALIAS_NAME.lower() not in " ".join(rec_names)):
                continue

            body     = msg.Body or ""
            last     = extract_last_email(body)
            preview  = last[:200].replace("\r"," ").replace("\n"," ")
            raw_name = (msg.Sender.Name or "").strip()
            raw_smtp = (msg.SenderEmailAddress or "").lower()
            sender   = normalize_sender(raw_name, raw_smtp)
            received = msg.ReceivedTime.isoformat()
            entry_id = msg.EntryID

            out.append({
                "message_id": entry_id,
                "sender":      sender,
                "sender_smtp": raw_smtp,
                "subject":     msg.Subject or "",
                "preview":     preview,
                "received":    received,
                "rec_smtp":    rec_smtp,
                "to_smtp":     to_smtp,
                "last_body":   last.lower(),
            })
        except Exception as e:
            logging.error(f"Process error: {e}")
    pythoncom.CoUninitialize()
    logging.info(f"Fetched {len(out)} emails.")
    return out

# === Scheduler ===
scheduler = BackgroundScheduler()
scheduler.add_job(
    lambda: [
        c.execute(
            "INSERT OR IGNORE INTO tracked_emails(message_id, dismissed_at) VALUES (?, NULL)",
            (m["message_id"],)
        ) for m in fetch_outlook_dicts()
    ],
    'interval',
    minutes=FETCH_INTERVAL
)
try:
    scheduler.start()
except SchedulerAlreadyRunningError:
    pass

# === API Endpoints ===
@app.get("/emails", response_model=list[EmailItem])
def get_emails():
    msgs = fetch_outlook_dicts()
    out = []
    for m in msgs:
        imp, reason = rate_and_reason(m)
        if imp < 3:
            continue

        row = c.execute(
            "SELECT dismissed_at FROM tracked_emails WHERE message_id=?", 
            (m["message_id"],)
        ).fetchone()
        if row and row[0] is not None:
            continue

        out.append(EmailItem(
            message_id = m["message_id"],
            sender      = m["sender"],
            subject     = m["subject"],
            preview     = m["preview"],
            received    = m["received"],
            importance  = imp,
            reason      = reason
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
