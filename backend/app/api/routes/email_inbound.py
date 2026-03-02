# app/api/routes/email_inbound.py
#
# Mailgun inbound webhook handler.
#
# Mailgun routes emails sent to *@meetbert.uk here as multipart/form-data.
# We verify the HMAC signature, look up the recipient's user_id, save attachments,
# run Gemini invoice extraction, and insert results into Supabase.

import hashlib
import hmac
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from app.db import crud

router = APIRouter(prefix="/email", tags=["email"])
log    = logging.getLogger(__name__)

ATTACHMENTS_DIR = Path(__file__).resolve().parents[3] / "attachments"
SUPPORTED_EXTS  = {".pdf", ".jpg", ".jpeg", ".png"}


def _verify_mailgun_signature(signing_key: str, token: str, timestamp: str, signature: str) -> bool:
    """Verify a Mailgun webhook HMAC-SHA256 signature."""
    msg    = f"{timestamp}{token}"
    digest = hmac.new(signing_key.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


@router.post("/inbound")
async def inbound_email(request: Request):
    """
    Receive an inbound email from Mailgun.

    Always returns 200 so Mailgun does not retry on business-logic failures
    (unknown recipient, no attachments, etc.).  Returns 403 only on bad signatures.
    """
    signing_key = os.getenv("MAILGUN_SIGNING_KEY")
    form        = await request.form()

    # ── Signature verification ─────────────────────────────────────────────
    if signing_key:
        token     = str(form.get("token",     ""))
        timestamp = str(form.get("timestamp", ""))
        signature = str(form.get("signature", ""))
        if not _verify_mailgun_signature(signing_key, token, timestamp, signature):
            log.warning("Mailgun signature verification failed")
            raise HTTPException(status_code=403, detail="Invalid signature")

    # ── Parse envelope ─────────────────────────────────────────────────────
    recipient = str(form.get("recipient") or "").lower().strip()
    sender    = str(form.get("sender")    or "")
    subject   = str(form.get("subject")   or "")
    body      = str(form.get("body-plain") or form.get("body-html") or "")
    att_count = int(form.get("attachment-count") or 0)

    log.info(
        "Inbound email: recipient=%s sender=%s subject=%s attachments=%d",
        recipient, sender, subject, att_count,
    )

    # ── Resolve recipient to user ──────────────────────────────────────────
    user_id = crud.get_user_id_by_inbox(recipient)
    if not user_id:
        log.warning("No active inbox found for recipient: %s", recipient)
        return {"status": "unknown_recipient"}

    # ── Fetch user's projects for Gemini context ───────────────────────────
    projects        = crud.get_projects(user_id)
    active_projects = [p for p in projects if p.get("status") == "Active"]
    project_names   = [p["name"] for p in active_projects]

    ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

    inserted = 0
    errors   = 0

    for i in range(1, att_count + 1):
        att = form.get(f"attachment-{i}")
        if att is None or not hasattr(att, "filename"):
            continue

        filename = att.filename or f"attachment-{i}"
        ext      = Path(filename).suffix.lower()

        if ext not in SUPPORTED_EXTS:
            log.info("Skipping unsupported attachment type: %s", filename)
            continue

        # ── Save attachment to disk ────────────────────────────────────────
        dest    = ATTACHMENTS_DIR / f"{user_id}_{filename}"
        counter = 1
        while dest.exists():
            dest = ATTACHMENTS_DIR / f"{user_id}_{Path(filename).stem}_{counter}{ext}"
            counter += 1

        contents = await att.read()
        dest.write_bytes(contents)
        log.info("Saved attachment: %s (%d bytes)", dest.name, len(contents))

        # ── Run Gemini invoice extraction ──────────────────────────────────
        try:
            from app.services.invoice_processor import process_document
            result = process_document(
                file_path=dest,
                email_subject=subject,
                email_body=body[:500],
                project_names=project_names,
                active_projects=active_projects,
            )
            if result:
                result["source_file"] = dest.name
                crud.insert_invoice(result, user_id)
                inserted += 1
                log.info(
                    "Inserted invoice from %s for user %s (vendor=%s total=%s)",
                    dest.name, user_id, result.get("vendor"), result.get("total"),
                )
            else:
                log.info("Attachment %s is not an invoice, skipping.", dest.name)
        except Exception as e:
            log.exception("Failed to process attachment %s: %s", dest.name, e)
            errors += 1

    return {
        "status":                "ok",
        "recipient":             recipient,
        "attachments_processed": att_count,
        "invoices_inserted":     inserted,
        "errors":                errors,
    }
