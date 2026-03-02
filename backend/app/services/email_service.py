# app/services/email_service.py
#
# Outbound email via Mailgun.
# Used to send replies and notifications FROM <user>@meetbert.uk addresses.

import logging
import os
from typing import Optional

import httpx

log = logging.getLogger(__name__)


async def send_email(
    to: str,
    subject: str,
    text: str,
    from_address: Optional[str] = None,
    html: Optional[str] = None,
) -> bool:
    """
    Send an email via Mailgun.

    Args:
        to:           Recipient address.
        subject:      Email subject.
        text:         Plain-text body.
        from_address: Sender address (defaults to noreply@meetbert.uk).
        html:         Optional HTML body.

    Returns:
        True on success, False on failure.
    """
    api_key = os.getenv("MAILGUN_API_KEY")
    domain  = os.getenv("MAILGUN_DOMAIN", "meetbert.uk")

    if not api_key:
        log.error("MAILGUN_API_KEY not set — cannot send email to %s", to)
        return False

    sender = from_address or f"Bert <noreply@{domain}>"

    payload: dict = {
        "from":    sender,
        "to":      to,
        "subject": subject,
        "text":    text,
    }
    if html:
        payload["html"] = html

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://api.mailgun.net/v3/{domain}/messages",
                auth=("api", api_key),
                data=payload,
                timeout=10.0,
            )

        if resp.status_code in (200, 201):
            log.info("Email sent to %s — subject: %s", to, subject)
            return True

        log.error(
            "Mailgun send failed (status=%d): %s",
            resp.status_code, resp.text,
        )
        return False

    except Exception as e:
        log.exception("Exception sending email to %s: %s", to, e)
        return False
