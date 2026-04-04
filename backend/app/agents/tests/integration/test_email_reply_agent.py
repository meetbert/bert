"""
Email Reply Agent tests — integration tests with real LLM + real AgentMail.
Run from agent/: python -m pytest tests/test_reply_agent.py -v

Tests the email reply agent: draft reply from task results → send via AgentMail.
Each test sends a setup message (testinbox → testinbox) to create a thread,
then the reply agent replies on that thread.
"""

import uuid

import pytest

from app.agents.config import agentmail_post, supabase
from app.agents.subagents.email_reply_agent import run_email_reply_agent as run_reply_agent
from .conftest import USER_ID

INBOX_ID = "testinboxforbert@agentmail.to"
_RUN_TAG = f"[test-{uuid.uuid4().hex[:8]}]"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def setup_settings():
    """Create user_settings with the test inbox, restore original after."""
    orig = (
        supabase.table("user_settings")
        .select("*")
        .eq("id", USER_ID)
        .maybe_single()
        .execute()
    )
    had_settings = orig is not None and orig.data is not None
    orig_data = orig.data if had_settings else None

    supabase.table("user_settings").upsert({
        "id": USER_ID,
        "company_name": "Test Company",
        "base_currency": "USD",
        "max_followups": 3,
        "agentmail_inbox": INBOX_ID,
    }).execute()

    yield

    if had_settings:
        supabase.table("user_settings").upsert(orig_data).execute()
    else:
        supabase.table("user_settings").delete().eq("id", USER_ID).execute()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _send_setup_message(subject: str, body: str) -> dict:
    """Send a message from testinbox to itself to simulate an inbound email.

    Returns {"message_id": ..., "thread_id": ...}.
    """
    return agentmail_post(f"/inboxes/{INBOX_ID}/messages/send", {
        "to": [INBOX_ID],
        "subject": subject,
        "text": body,
    })


def _make_email(
    sender: str,
    subject: str,
    body: str,
    message_id: str,
    thread_id: str,
    attachment_paths: list[str] | None = None,
    linked_invoices: list[dict] | None = None,
) -> str:
    """Build email context string matching preprocessing output format."""
    attachments = attachment_paths or []
    linked = linked_invoices or []
    return (
        f"From: {sender}\n"
        f"Subject: {subject}\n"
        f"Body: {body}\n"
        f"Attachments: {attachments}\n"
        f"Thread ID: {thread_id}\n"
        f"Message ID: {message_id}\n"
        f"Linked invoices: {linked}"
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reply_invoice_complete():
    """Invoice processed, no follow-up — agent should send a confirmation."""
    setup = _send_setup_message(
        subject=f"Invoice for camera rental {_RUN_TAG}",
        body=(
            "Hi, please find attached our invoice #BL-2024-089 for the "
            "Alexa Mini rental. Total €1,350 + VAT."
        ),
    )

    email = _make_email(
        sender="billing@berlinlens.de",
        subject=f"Invoice for camera rental {_RUN_TAG}",
        body=(
            "Hi, please find attached our invoice #BL-2024-089 for the "
            "Alexa Mini rental. Total €1,350 + VAT."
        ),
        message_id=setup["message_id"],
        thread_id=setup["thread_id"],
    )

    result = await run_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Created invoice from Berlin Lens Co (#BL-2024-089): "
            "camera rental, €1,350 + VAT, currency EUR. "
            "All required fields present. Status: complete."
        ),
        follow_up_states=(
            "Invoice BL-2024-089: should_follow_up = false, "
            "no missing fields."
        ),
        email_context=email,
    )

    assert result["sent"] is True
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_missing_fields_followup():
    """Invoice missing fields — agent should ask for the missing info."""
    setup = _send_setup_message(
        subject=f"Invoice {_RUN_TAG}",
        body="Please see attached.",
    )

    email = _make_email(
        sender="unknown@vendor.com",
        subject=f"Invoice {_RUN_TAG}",
        body="Please see attached.",
        message_id=setup["message_id"],
        thread_id=setup["thread_id"],
    )

    result = await run_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Created invoice from unknown sender: extracted "
            "invoice_date = 2026-03-10, currency = EUR. "
            "vendor_name = null, total = null. Status: awaiting_info."
        ),
        follow_up_states=(
            "Invoice: should_follow_up = true, "
            'missing_sender_fields = ["vendor_name", "total"]. '
            "sender reachable = true."
        ),
        email_context=email,
    )

    assert result["sent"] is True
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_correction_confirmation():
    """Correction received and applied — agent should confirm the update."""
    setup = _send_setup_message(
        subject=f"Re: Missing details {_RUN_TAG}",
        body=(
            "Sorry about that! The correct total is €2,800 including VAT, "
            "and the invoice date should be 15 March 2026."
        ),
    )

    email = _make_email(
        sender="anna@studiohamburg.de",
        subject=f"Re: Missing details {_RUN_TAG}",
        body=(
            "Sorry about that! The correct total is €2,800 including VAT, "
            "and the invoice date should be 15 March 2026."
        ),
        message_id=setup["message_id"],
        thread_id=setup["thread_id"],
        linked_invoices=[{
            "id": "abc-123",
            "vendor_name": "Studio Hamburg",
            "total": 2800,
            "invoice_date": "2026-03-15",
        }],
    )

    result = await run_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Updated invoice abc-123 (Studio Hamburg): set total = €2,800, "
            "invoice_date = 2026-03-15. All required fields now filled. "
            "Status changed to complete."
        ),
        follow_up_states=(
            "Invoice abc-123: should_follow_up = false, no missing fields."
        ),
        email_context=email,
    )

    assert result["sent"] is True
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_multiple_invoices_mixed():
    """Two invoices — one complete, one needs follow-up."""
    setup = _send_setup_message(
        subject=f"Invoices for last week {_RUN_TAG}",
        body=(
            "Hi Bert, attached are two invoices: catering from Fresh Bites "
            "(€650) and equipment from TechRent Berlin (€1,200)."
        ),
    )

    email = _make_email(
        sender="max@production.de",
        subject=f"Invoices for last week {_RUN_TAG}",
        body=(
            "Hi Bert, attached are two invoices: catering from Fresh Bites "
            "(€650) and equipment from TechRent Berlin (€1,200)."
        ),
        message_id=setup["message_id"],
        thread_id=setup["thread_id"],
    )

    result = await run_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Created invoice from Fresh Bites: catering, €650, currency EUR. "
            "vendor_name present, total present, currency present, "
            "invoice_date = null. Status: awaiting_info.\n"
            "Created invoice from TechRent Berlin: lighting rig, €1,200, "
            "currency EUR, invoice_date = 2026-03-01. Status: complete."
        ),
        follow_up_states=(
            "Invoice Fresh Bites: should_follow_up = true, "
            'missing_sender_fields = ["invoice_date"]. '
            "sender reachable = true.\n"
            "Invoice TechRent Berlin: should_follow_up = false, "
            "no missing fields."
        ),
        email_context=email,
    )

    assert result["sent"] is True
    assert result["reply"]
