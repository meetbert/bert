"""
Invoice Agent tests — integration tests with real LLM + real Supabase.
Run from agent/: python -m pytest tests/test_invoice_agent.py -v

Tests the full invoice agent loop: extract → dedup → create → assign → follow-up.
Uses sample invoices uploaded to Supabase Storage.

Email context format matches the classifier tests and preprocessing spec:
  From: / Subject: / Body: / Attachments: / Thread ID: / Message ID: / Linked invoices:
"""

import os
import uuid

import pytest

from app.agents.config import supabase
from app.agents.subagents.invoice_agent import run_invoice_agent
from .conftest import USER_ID

SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "sample_invoices")
STORAGE_PREFIX = f"{USER_ID}/unassigned"

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

@pytest.fixture(scope="module")
def uploaded_paths():
    """Upload sample PDFs to Supabase Storage once."""
    bucket = supabase.storage.from_("invoices-bucket")
    paths = {}
    for i in range(1, 6):
        local_path = os.path.join(SAMPLE_DIR, f"sample_invoice_{i}.pdf")
        storage_path = f"{STORAGE_PREFIX}/sample_invoice_{i}.pdf"
        with open(local_path, "rb") as f:
            try:
                bucket.upload(storage_path, f.read(), {"content-type": "application/pdf"})
            except Exception:
                pass
        paths[i] = storage_path
    yield paths
    for path in paths.values():
        try:
            bucket.remove([path])
        except Exception:
            pass


@pytest.fixture()
def cleanup_invoices():
    """Collect and delete invoice IDs after each test."""
    created_ids = []
    yield created_ids
    for inv_id in created_ids:
        try:
            supabase.table("invoice_threads").delete().eq(
                "invoice_id", inv_id
            ).execute()
            supabase.table("invoices").delete().eq("id", inv_id).execute()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_new_invoice_with_attachment(uploaded_paths, cleanup_invoices):
    """Full pipeline: extract from PDF → dedup → create → check follow-up."""
    email = _make_email(
        sender="billing@eastrepair.com",
        subject=f"Invoice US-001 {_RUN_TAG}",
        body=(
            "Hi, please find attached our invoice #US-001 for front and rear "
            "brake cables, pedal arms, and 3hrs labor. Total $154.06 including tax. "
            "Payment due within 15 days. Best, East Repair Inc."
        ),
        attachment_paths=[uploaded_paths[1]],
    )

    result = await run_invoice_agent(
        user_id=USER_ID,
        task_instruction=(
            f"Process new invoice from East Repair Inc. {_RUN_TAG}. "
            "Attachment at index 0 (sample_invoice_1.pdf). Email states: "
            "invoice #US-001, brake cables, pedal arms, labor, total $154.06."
        ),
        email_context=email,
    )

    assert result["summary"]
    assert result["invoice_id"] is not None
    cleanup_invoices.append(result["invoice_id"])

    # Verify invoice in DB
    inv = (
        supabase.table("invoices")
        .select("*")
        .eq("id", result["invoice_id"])
        .maybe_single()
        .execute()
    )
    assert inv.data is not None
    assert inv.data["total"] == pytest.approx(154.06, abs=0.5)
    assert inv.data["currency"] == "USD"


@pytest.mark.asyncio
async def test_new_invoice_from_email_body(cleanup_invoices):
    """No attachment — agent should extract from email body and create invoice."""
    email = _make_email(
        sender="anna@studiohamburg.de",
        subject=f"Location fee {_RUN_TAG}",
        body=(
            f"Hi Bert, the location fee for the shoot on 15 Jan 2026 is €2,500. "
            f"Invoice number LOC-{_RUN_TAG}. Currency EUR. "
            f"From Studio Hamburg {_RUN_TAG}. Thanks, Anna"
        ),
    )

    result = await run_invoice_agent(
        user_id=USER_ID,
        task_instruction=(
            f"Process new invoice from Studio Hamburg {_RUN_TAG}. "
            "No attachment. Email states: location fee, €2,500, "
            f"invoice number LOC-{_RUN_TAG}, date 2026-01-15, EUR."
        ),
        email_context=email,
    )

    assert result["invoice_id"] is not None
    cleanup_invoices.append(result["invoice_id"])

    inv = (
        supabase.table("invoices")
        .select("*")
        .eq("id", result["invoice_id"])
        .maybe_single()
        .execute()
    )
    assert inv.data is not None
    assert inv.data["total"] == pytest.approx(2500, abs=1)
    assert inv.data["processing_status"] == "complete"


@pytest.mark.asyncio
async def test_update_existing_invoice(cleanup_invoices):
    """Agent should update an existing incomplete invoice with corrected fields."""
    # Pre-create an incomplete invoice
    pre = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": f"Studio Hamburg {_RUN_TAG}",
            "total": None,
            "invoice_date": None,
            "currency": None,
            "processing_status": "awaiting_info",
        })
        .execute()
    )
    invoice_id = pre.data[0]["id"]
    cleanup_invoices.append(invoice_id)

    email = _make_email(
        sender="anna@studiohamburg.de",
        subject=f"Re: Missing details {_RUN_TAG}",
        body=(
            "Sorry about that! The total is €2,800, invoice date 15 March 2026, "
            "currency EUR."
        ),
        linked_invoices=[{
            "id": invoice_id,
            "vendor_name": f"Studio Hamburg {_RUN_TAG}",
            "total": None,
            "invoice_date": None,
        }],
    )

    result = await run_invoice_agent(
        user_id=USER_ID,
        task_instruction=(
            f"Update existing invoice {invoice_id} (Studio Hamburg {_RUN_TAG}) "
            "with corrected details from sender reply: total = €2,800, "
            "invoice_date = 2026-03-15, currency = EUR."
        ),
        email_context=email,
    )

    assert result["summary"]

    # Verify the update in DB
    inv = (
        supabase.table("invoices")
        .select("*")
        .eq("id", invoice_id)
        .maybe_single()
        .execute()
    )
    assert inv.data["total"] == pytest.approx(2800, abs=1)
    assert inv.data["processing_status"] == "complete"


@pytest.mark.asyncio
async def test_not_invoice_attachment(uploaded_paths):
    """Non-invoice attachment (tree photo) — agent should not create an invoice."""
    email = _make_email(
        sender="random@photos.com",
        subject=f"Nice tree {_RUN_TAG}",
        body="Check out this amazing tree I found!",
        attachment_paths=[uploaded_paths[4]],
    )

    result = await run_invoice_agent(
        user_id=USER_ID,
        task_instruction=(
            "Process new invoice from unknown sender. "
            "Attachment at index 0. No details in email body."
        ),
        email_context=email,
    )

    assert result["invoice_id"] is None
    assert result["summary"]


@pytest.mark.asyncio
async def test_bulk_update_via_agent(cleanup_invoices):
    """Agent should bulk update invoices when instructed."""
    # Pre-create two invoices from the same vendor
    vendor = f"Bulk Test Vendor {_RUN_TAG}"
    ids = []
    for _ in range(2):
        inv = (
            supabase.table("invoices")
            .insert({
                "user_id": USER_ID,
                "vendor_name": vendor,
                "total": 500.00,
                "invoice_date": "2026-01-01",
                "currency": "EUR",
                "payment_status": "unpaid",
            })
            .execute()
        )
        inv_id = inv.data[0]["id"]
        cleanup_invoices.append(inv_id)
        ids.append(inv_id)

    context = (
        f"Source: Chat\n"
        f"User message: mark all {vendor} invoices as paid\n"
        f"Attachments: []"
    )

    result = await run_invoice_agent(
        user_id=USER_ID,
        task_instruction=f"Bulk mark all invoices from '{vendor}' as paid.",
        email_context=context,
    )

    assert result["summary"]

    # Verify all are paid
    for inv_id in ids:
        inv = (
            supabase.table("invoices")
            .select("payment_status")
            .eq("id", inv_id)
            .maybe_single()
            .execute()
        )
        assert inv.data["payment_status"] == "paid"


@pytest.mark.asyncio
async def test_delete_via_agent(cleanup_invoices):
    """Agent should delete an invoice when instructed."""
    vendor = f"Delete Test Vendor {_RUN_TAG}"
    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": vendor,
            "total": 300.00,
            "invoice_date": "2026-01-01",
            "currency": "EUR",
            "invoice_number": f"DEL-001-{_RUN_TAG}",
        })
        .execute()
    )
    inv_id = inv.data[0]["id"]
    # Only add to cleanup if agent doesn't delete it
    cleanup_invoices.append(inv_id)

    context = (
        f"Source: Chat\n"
        f"User message: delete invoice DEL-001-{_RUN_TAG}\n"
        f"Attachments: []"
    )

    result = await run_invoice_agent(
        user_id=USER_ID,
        task_instruction=f"Delete invoice with invoice_number DEL-001-{_RUN_TAG}. Search for it first to get the ID.",
        email_context=context,
    )

    assert result["summary"]

    # Verify deleted (maybe_single returns None when no row found)
    gone = (
        supabase.table("invoices")
        .select("id")
        .eq("id", inv_id)
        .maybe_single()
        .execute()
    )
    assert gone is None or gone.data is None
