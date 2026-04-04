"""
Classifier tests — unit tests for parsing + integration tests with real LLM.
Run from agent/: python -m pytest tests/test_classifier.py -v

Integration tests verify the full classifier pipeline including:
- Email triage into task types
- Sender classification via create_or_update_contact
- Email context format: From: / Subject: / Body: / Attachments: / Thread ID: / Message ID: / Linked invoices:
"""

import uuid

import pytest

from app.agents.config import supabase
from app.agents.subagents.classifier import _parse_tasks, run_classifier
from .conftest import USER_ID

_RUN_TAG = f"[test-{uuid.uuid4().hex[:8]}]"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_email(
    sender: str,
    subject: str,
    body: str,
    attachment_paths: list[str] | None = None,
    linked_invoices: list[dict] | None = None,
    thread_id: str = "test-thread-001",
    message_id: str = "test-msg-001",
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
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def cleanup_contacts():
    """Collect and delete contact IDs after each test."""
    created_emails = []
    yield created_emails
    for email in created_emails:
        try:
            supabase.table("email_contacts").delete().eq(
                "user_id", USER_ID
            ).eq("email", email.lower()).execute()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Unit tests: _parse_tasks
# ---------------------------------------------------------------------------

def test_parse_bare_json():
    text = '[{"type": "invoice_management", "instruction": "Process new invoice"}]'
    tasks = _parse_tasks(text)
    assert len(tasks) == 1
    assert tasks[0]["type"] == "invoice_management"


def test_parse_code_fenced_json():
    text = '```json\n[{"type": "invoice_management", "instruction": "Process new invoice"}]\n```'
    tasks = _parse_tasks(text)
    assert len(tasks) == 1


def test_parse_code_fence_no_lang():
    text = '```\n[{"type": "question", "instruction": "Answer budget question"}]\n```'
    tasks = _parse_tasks(text)
    assert len(tasks) == 1
    assert tasks[0]["type"] == "question"


def test_parse_with_surrounding_text():
    text = 'Here are the tasks:\n[{"type": "invoice_management", "instruction": "Do something"}]\nDone.'
    tasks = _parse_tasks(text)
    assert len(tasks) == 1


def test_parse_multiple_tasks():
    text = """[
        {"type": "invoice_management", "instruction": "Process invoice A"},
        {"type": "question", "instruction": "Answer budget question"}
    ]"""
    tasks = _parse_tasks(text)
    assert len(tasks) == 2
    assert tasks[0]["type"] == "invoice_management"
    assert tasks[1]["type"] == "question"


def test_parse_empty_array():
    text = "[]"
    tasks = _parse_tasks(text)
    assert tasks == []


def test_parse_no_json():
    text = "This email is just a thank-you note, no action needed."
    tasks = _parse_tasks(text)
    assert tasks == []


def test_parse_invalid_json():
    text = "[{broken json}]"
    tasks = _parse_tasks(text)
    assert tasks == []


def test_parse_filters_invalid_type():
    text = '[{"type": "unknown_type", "instruction": "Do something"}]'
    tasks = _parse_tasks(text)
    assert tasks == []


def test_parse_filters_missing_instruction():
    text = '[{"type": "invoice_management"}]'
    tasks = _parse_tasks(text)
    assert tasks == []


def test_parse_filters_mixed_valid_invalid():
    text = """[
        {"type": "invoice_management", "instruction": "Valid task"},
        {"type": "bad_type", "instruction": "Invalid task"},
        {"type": "question", "instruction": "Another valid task"}
    ]"""
    tasks = _parse_tasks(text)
    assert len(tasks) == 2
    assert tasks[0]["instruction"] == "Valid task"
    assert tasks[1]["instruction"] == "Another valid task"


# ---------------------------------------------------------------------------
# Integration tests: run_classifier (real LLM + real Supabase)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_classify_single_invoice(cleanup_contacts):
    """Standard vendor invoice — one invoice_management task + vendor contact."""
    sender = f"billing-{_RUN_TAG}@berlinlens.de"
    cleanup_contacts.append(sender)

    email = _make_email(
        sender=sender,
        subject=f"Invoice for camera rental {_RUN_TAG}",
        body=(
            "Hi, please find attached our invoice #BL-2024-089 for the "
            "Alexa Mini rental (3 days @ €450/day). Total €1,350 + VAT. "
            "Payment due within 30 days."
        ),
        attachment_paths=["invoices-bucket/user123/unassigned/BL-2024-089.pdf"],
    )

    tasks = await run_classifier(USER_ID, email)
    assert len(tasks) == 1
    assert tasks[0]["type"] == "invoice_management"

    # Verify sender was classified as a contact
    contact = (
        supabase.table("email_contacts")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("email", sender.lower())
        .maybe_single()
        .execute()
    )
    assert contact.data is not None
    assert contact.data["sender_type"] == "vendor"
    assert contact.data["reachable"] is True


@pytest.mark.asyncio
async def test_classify_no_action(cleanup_contacts):
    """Thank-you email — should return empty list but still classify sender."""
    sender = f"anna-{_RUN_TAG}@studio.de"
    cleanup_contacts.append(sender)

    email = _make_email(
        sender=sender,
        subject=f"Re: All sorted {_RUN_TAG}",
        body="Great, thanks for handling that! Have a good weekend.",
    )

    tasks = await run_classifier(USER_ID, email)
    assert tasks == []


@pytest.mark.asyncio
async def test_classify_multiple_invoices(cleanup_contacts):
    """Coworker forwards two invoices — two invoice_management tasks."""
    sender = f"max-{_RUN_TAG}@production.de"
    cleanup_contacts.append(sender)

    email = _make_email(
        sender=sender,
        subject=f"Invoices for last week's shoot {_RUN_TAG}",
        body=(
            "Hi Bert, attached are the invoices from last week. The catering one "
            "is from Fresh Bites (€650) and the equipment invoice is from TechRent "
            "Berlin (€1,200 for lighting rig). Thanks, Max"
        ),
        attachment_paths=[
            "invoices-bucket/user123/unassigned/fresh-bites-march.pdf",
            "invoices-bucket/user123/unassigned/techrent-lighting.pdf",
        ],
    )

    tasks = await run_classifier(USER_ID, email)
    assert len(tasks) == 2
    assert all(t["type"] == "invoice_management" for t in tasks)

    # Sender is a coworker forwarding invoices
    contact = (
        supabase.table("email_contacts")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("email", sender.lower())
        .maybe_single()
        .execute()
    )
    assert contact.data is not None
    assert contact.data["sender_type"] == "coworker"


@pytest.mark.asyncio
async def test_classify_vendor_reply_with_linked_invoice(cleanup_contacts):
    """Vendor reply with corrections for an existing invoice."""
    sender = f"anna-vendor-{_RUN_TAG}@studiohamburg.de"
    cleanup_contacts.append(sender)

    email = _make_email(
        sender=sender,
        subject=f"Re: Missing details {_RUN_TAG}",
        body=(
            "Sorry about that! The correct total is €2,800 including VAT, "
            "and the invoice date should be 15 March 2026."
        ),
        linked_invoices=[{
            "id": "abc-123",
            "vendor_name": "Studio Hamburg",
            "total": None,
            "invoice_date": None,
        }],
    )

    tasks = await run_classifier(USER_ID, email)
    assert len(tasks) == 1
    assert tasks[0]["type"] == "invoice_management"
    # Instruction should reference the existing invoice
    assert "abc-123" in tasks[0]["instruction"] or "update" in tasks[0]["instruction"].lower()


@pytest.mark.asyncio
async def test_classify_noreply_sender(cleanup_contacts):
    """Noreply sender — contact should be marked as not reachable."""
    sender = f"noreply-{_RUN_TAG}@automated-billing.com"
    cleanup_contacts.append(sender)

    email = _make_email(
        sender=sender,
        subject=f"Automated invoice {_RUN_TAG}",
        body=(
            "This is an automated message. Please find attached invoice "
            "#AUTO-001 for monthly server hosting. Total: $99.00 USD."
        ),
        attachment_paths=["invoices-bucket/user123/unassigned/auto-001.pdf"],
    )

    tasks = await run_classifier(USER_ID, email)
    assert len(tasks) == 1
    assert tasks[0]["type"] == "invoice_management"

    # noreply sender should be unreachable
    contact = (
        supabase.table("email_contacts")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("email", sender.lower())
        .maybe_single()
        .execute()
    )
    assert contact.data is not None
    assert contact.data["reachable"] is False


@pytest.mark.asyncio
async def test_classify_invoice_plus_question(cleanup_contacts):
    """Email with invoice and a budget question — two tasks of different types."""
    sender = f"producer-{_RUN_TAG}@filmcrew.de"
    cleanup_contacts.append(sender)

    email = _make_email(
        sender=sender,
        subject=f"Location invoice + budget check {_RUN_TAG}",
        body=(
            "Hey Bert, forwarding the location fee invoice from Halle am Berghain "
            "(see attached). Also — can you tell me how much budget is left in "
            "the Location Rental category for the Berlin Documentary project? Thanks!"
        ),
        attachment_paths=["invoices-bucket/user123/unassigned/halle-berghain-fee.pdf"],
    )

    tasks = await run_classifier(USER_ID, email)
    assert len(tasks) == 2
    types = {t["type"] for t in tasks}
    assert "invoice_management" in types
    assert "question" in types
