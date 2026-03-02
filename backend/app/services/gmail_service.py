# app/services/gmail_service.py
#
# Gmail fetching using the Gmail REST API with OAuth2.
#
# Prerequisites (one-time setup):
#   1. Set GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in .env
#      (copy the values from your client_secret_*.json file)
#   2. Start the server: uvicorn app.main:app --reload
#   3. Open http://localhost:8000/api/auth/gmail/authorize in your browser
#   4. Approve access → copy GMAIL_REFRESH_TOKEN from the result page into .env
#   5. Done — the token doesn't expire unless you revoke it.

import base64
import logging
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.services.invoice_processor import process_document
from app.db.crud import (
    get_gmail_token,
    get_projects,
    get_vendor_map,
    insert_invoice,
    seed_categories,
)

load_dotenv()

log = logging.getLogger(__name__)

GMAIL_SCOPES   = ["https://www.googleapis.com/auth/gmail.modify"]
SUPPORTED_MIME = {"application/pdf", "image/jpeg", "image/png"}
SUPPORTED_EXT  = {".pdf", ".jpg", ".jpeg", ".png"}

ATTACHMENTS_DIR = Path(__file__).resolve().parents[2] / "attachments"
ATTACHMENTS_DIR.mkdir(exist_ok=True)


# ── Auth ──────────────────────────────────────────────────────────────────────

def _get_credentials(user_id: str) -> Credentials:
    """
    Build OAuth2 credentials for a specific user from the database.
    Automatically refreshes the access token if expired.
    """
    client_id     = os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise ValueError(
            "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env."
        )

    refresh_token = get_gmail_token(user_id)
    if not refresh_token:
        raise ValueError(
            f"No Gmail token found for user {user_id}. "
            "The user must connect their Gmail account first via Settings."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=GMAIL_SCOPES,
    )
    creds.refresh(Request())
    return creds


def _get_gmail_service(user_id: str):
    return build("gmail", "v1", credentials=_get_credentials(user_id))


# ── Email parsing helpers ─────────────────────────────────────────────────────

def _decode_header_value(value: str) -> str:
    from email.header import decode_header as _dh
    decoded, enc = _dh(value)[0]
    if isinstance(decoded, bytes):
        return decoded.decode(enc or "utf-8", errors="replace")
    return decoded or ""


def _get_subject(headers: list[dict]) -> str:
    for h in headers:
        if h["name"].lower() == "subject":
            return _decode_header_value(h["value"])
    return ""


def _get_body_text(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    mime_type = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime_type == "text/plain" and body_data:
        return base64.urlsafe_b64decode(body_data).decode("utf-8", errors="replace")

    for part in payload.get("parts", []):
        text = _get_body_text(part)
        if text:
            return text

    return ""


def _save_bytes(filename: str, data: bytes) -> Path | None:
    """Write attachment bytes to disk. Returns saved Path or None."""
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXT:
        return None

    file_path = ATTACHMENTS_DIR / filename
    if file_path.exists():
        stem      = Path(filename).stem
        ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename  = f"{stem}_{ts}{ext}"
        file_path = ATTACHMENTS_DIR / filename

    file_path.write_bytes(data)
    return file_path


def _get_attachments(
    service, msg_id: str, payload: dict
) -> list[tuple[str, bytes]]:
    """
    Walk the Gmail message payload and download all supported attachments.
    Returns list of (filename, bytes).
    """
    results = []

    def _walk(part):
        mime_type   = part.get("mimeType", "")
        filename    = part.get("filename", "")
        body        = part.get("body", {})
        attach_id   = body.get("attachmentId")
        inline_data = body.get("data")

        is_attachment = bool(filename) and mime_type in SUPPORTED_MIME

        if is_attachment:
            if attach_id:
                raw_attachment = (
                    service.users()
                    .messages()
                    .attachments()
                    .get(userId="me", messageId=msg_id, id=attach_id)
                    .execute()
                )
                data = base64.urlsafe_b64decode(raw_attachment["data"])
            elif inline_data:
                data = base64.urlsafe_b64decode(inline_data)
            else:
                return

            results.append((filename, data))

        for sub in part.get("parts", []):
            _walk(sub)

    _walk(payload)
    return results


# ── Core processing ───────────────────────────────────────────────────────────

def _process_message(
    service,
    msg_id: str,
    project_names: list[str],
    vendor_map: dict[str, str],
    active_projects: list[dict],
    user_id: str,
) -> tuple[int, int, list[dict]]:
    """
    Fetch and process one Gmail message.
    Returns (attachments_saved, invoices_detected, inserted_rows).
    """
    msg = (
        service.users()
        .messages()
        .get(userId="me", id=msg_id, format="full")
        .execute()
    )
    payload = msg.get("payload", {})
    subject = _get_subject(payload.get("headers", []))
    body    = _get_body_text(payload)

    log.info("Processing email: %s", subject or "(no subject)")

    attachments = _get_attachments(service, msg_id, payload)
    found       = 0
    detected    = 0
    inserted: list[dict] = []

    for filename, data in attachments:
        file_path = _save_bytes(filename, data)
        if not file_path:
            continue

        found += 1
        log.info("Saved attachment: %s", file_path.name)

        invoice_data = process_document(
            file_path,
            email_subject=subject,
            email_body=body,
            project_names=project_names,
            active_projects=active_projects,
        )

        if invoice_data is None:
            log.info("Skipped (not an invoice): %s", file_path.name)
            continue

        vendor_key = invoice_data.get("vendor", "").strip().lower()
        if vendor_key in vendor_map and invoice_data.get("project") == "Unassigned":
            mapped = vendor_map[vendor_key]
            log.info("Vendor mapping: %s → %s", invoice_data["vendor"], mapped)
            invoice_data["project"] = mapped

        detected += 1
        row = insert_invoice(invoice_data, user_id)
        if row is not None:
            inserted.append(row)

    # Mark the email as read
    service.users().messages().modify(
        userId="me",
        id=msg_id,
        body={"removeLabelIds": ["UNREAD"]},
    ).execute()

    return found, detected, inserted


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_invoices_from_gmail(user_id: str, max_emails: int = 50) -> dict:
    """
    Connect to Gmail via OAuth2, process unread inbox emails, insert invoices.

    Returns:
      {
        emails_processed, attachments_found, invoices_detected,
        invoices_inserted, errors, invoices: [...]
      }
    """
    seed_categories()

    try:
        projects        = get_projects(user_id)
        active_projects = [p for p in projects if p.get("status") == "Active"]
        project_names   = [p["name"] for p in active_projects]
        log.info("Active projects: %s", project_names or "(none)")
    except Exception as e:
        log.warning("Could not load projects: %s — continuing without matching.", e)
        project_names   = []
        active_projects = []

    try:
        vendor_map = get_vendor_map()
        log.info("Loaded %d vendor mapping(s)", len(vendor_map))
    except Exception as e:
        log.warning("Could not load vendor map: %s", e)
        vendor_map = {}

    service = _get_gmail_service(user_id)

    results  = (
        service.users()
        .messages()
        .list(userId="me", q="is:unread in:inbox", maxResults=max_emails)
        .execute()
    )
    messages = results.get("messages", [])
    log.info("Unread emails to process: %d", len(messages))

    total_found    = 0
    total_detected = 0
    all_inserted: list[dict] = []
    errors = 0

    for msg_meta in messages:
        msg_id = msg_meta["id"]
        try:
            found, detected, inserted = _process_message(
                service, msg_id, project_names, vendor_map, active_projects, user_id
            )
            total_found    += found
            total_detected += detected
            all_inserted.extend(inserted)
        except Exception as e:
            errors += 1
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                log.error("Rate limit for message %s — retry on next run.", msg_id)
            else:
                log.error("Error processing message %s: %s", msg_id, err)

    log.info(
        "Done. Emails: %d | Attachments: %d | Detected: %d | Inserted: %d | Errors: %d",
        len(messages), total_found, total_detected, len(all_inserted), errors,
    )

    return {
        "emails_processed":  len(messages),
        "attachments_found": total_found,
        "invoices_detected": total_detected,
        "invoices_inserted": len(all_inserted),
        "errors":            errors,
        "invoices":          all_inserted,
    }
