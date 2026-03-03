"""
Action tools tests — integration tests against real Supabase + real LLM.
Run from agent/: python -m pytest tests/test_action_tools.py -v

Sample invoices:
  1. East Repair Inc. — US-001, $154.06, 2019-11-02, USD
  2. Zylker Electronics Hub — INV-000001, $2,338.35, 2024-08-05, USD
  3. Tom Green Handyman — 0003521, $3,367.20, 2016-06-05, USD
  4. Tree photo — not an invoice
  5. ABC Exports Ltd. — CI2023-001, $13,000.00, 2030-09-30, USD

Vendor names include a [test-<uuid>] marker so they never collide across
runs.  A module-level sweep deletes any orphaned test rows older than 1 hour.
"""

import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.agents.config import supabase
from app.agents.tools.action_tools import create_action_tools

USER_ID = "cf08829b-9f8a-4448-b3b3-666391e469c0"
SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "sample_invoices")
STORAGE_PREFIX = f"{USER_ID}/unassigned"

# Unique tag for this test run — appended to vendor names
_RUN_TAG = f"[test-{uuid.uuid4().hex[:8]}]"

# Marker prefix used to identify all test rows (for orphan cleanup)
_TEST_MARKER = "[test-"

# Fake email contexts for each sample invoice
FAKE_EMAILS = {
    1: (
        "From: billing@eastrepair.com\n"
        "Subject: Invoice US-001 for brake cables and pedal arms\n"
        "Body: Hi, please find attached our invoice #US-001 for front and rear "
        "brake cables, pedal arms, and 3hrs labor. Total $154.06 including tax. "
        "Payment due within 15 days. Best, East Repair Inc."
    ),
    2: (
        "From: sales@zylkerelectronics.com\n"
        "Subject: Invoice INV-000001 — Camera, Fitness Tracker, Laptop\n"
        "Body: Dear customer, attached is your invoice for the DSLR camera, "
        "fitness tracker, and laptop. Total $2,338.35 including 5% tax. "
        "Full payment due on receipt. — Zylker Electronics Hub"
    ),
    3: (
        "From: tom@tomgreenhandyman.com\n"
        "Subject: Tax Invoice 0003521 — Bathroom Upgrade\n"
        "Body: Hi, here's the invoice for the bathroom upgrade work. "
        "Labour, materials, tiles, and sub-contractor fees. "
        "Total due: $3,367.20 including tax. Payment due by the 10th of next month."
    ),
    4: (
        "From: random@photos.com\n"
        "Subject: Nice tree\n"
        "Body: Check out this amazing tree I found!"
    ),
    5: (
        "From: info@abcexports.com\n"
        "Subject: Commercial Invoice CI2023-001\n"
        "Body: Please find attached the commercial invoice for Widget Model X, "
        "Gadget Model Y, and Gizmo Model Z. Total amount due: $13,000.00 USD. "
        "Payment via wire transfer. Due date: October 15, 2030."
    ),
}


def _tagged(name: str) -> str:
    """Append the run-unique tag to a vendor name."""
    return f"{name} {_RUN_TAG}"


def _local_hash(sample_num: int) -> str:
    """Compute SHA-256 hash of a local sample PDF."""
    path = os.path.join(SAMPLE_DIR, f"sample_invoice_{sample_num}.pdf")
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def sweep_orphaned_test_rows():
    """Delete any test rows older than 1 hour from previous crashed runs."""
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    # Clean orphaned invoices (and their threads)
    old_invoices = (
        supabase.table("invoices")
        .select("id")
        .eq("user_id", USER_ID)
        .ilike("vendor_name", f"%{_TEST_MARKER}%")
        .lt("created_at", one_hour_ago)
        .execute()
    )
    for inv in old_invoices.data:
        try:
            supabase.table("invoice_threads").delete().eq(
                "invoice_id", inv["id"]
            ).execute()
            supabase.table("invoices").delete().eq("id", inv["id"]).execute()
        except Exception:
            pass

    # Clean orphaned contacts
    old_contacts = (
        supabase.table("email_contacts")
        .select("id")
        .eq("user_id", USER_ID)
        .ilike("email", f"%{_TEST_MARKER}%")
        .lt("created_at", one_hour_ago)
        .execute()
    )
    for contact in old_contacts.data:
        try:
            supabase.table("email_contacts").delete().eq(
                "id", contact["id"]
            ).execute()
        except Exception:
            pass

    yield  # run all tests

    # No extra teardown needed — per-test fixtures handle normal cleanup


@pytest.fixture(scope="module")
def tools():
    """Create all action tools scoped to the test user."""
    return {t.name: t for t in create_action_tools(USER_ID)}


@pytest.fixture(scope="module")
def uploaded_paths():
    """Upload all sample PDFs to Supabase Storage once, return paths."""
    bucket = supabase.storage.from_("invoices-bucket")
    paths = {}
    for i in range(1, 6):
        local_path = os.path.join(SAMPLE_DIR, f"sample_invoice_{i}.pdf")
        storage_path = f"{STORAGE_PREFIX}/sample_invoice_{i}.pdf"
        with open(local_path, "rb") as f:
            try:
                bucket.upload(storage_path, f.read(), {"content-type": "application/pdf"})
            except Exception:
                # Already exists from a previous run — that's fine
                pass
        paths[i] = storage_path
    yield paths
    # Cleanup: remove uploaded files
    for path in paths.values():
        try:
            bucket.remove([path])
        except Exception:
            pass


@pytest.fixture()
def cleanup_invoices():
    """Collect invoice IDs created during a test and delete them after."""
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


@pytest.fixture()
def cleanup_contacts():
    """Collect contact IDs created during a test and delete them after."""
    created_ids = []
    yield created_ids
    for contact_id in created_ids:
        try:
            supabase.table("email_contacts").delete().eq(
                "id", contact_id
            ).execute()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# extract_invoice_data
# ---------------------------------------------------------------------------

class TestExtractInvoiceData:

    def test_extract_from_pdf_east_repair(self, tools, uploaded_paths):
        """Sample 1: East Repair Inc. — should extract all fields."""
        result = tools["extract_invoice_data"].invoke({
            "attachment_path": uploaded_paths[1],
            "email_body": FAKE_EMAILS[1],
        })
        assert "error" not in result
        assert "not_invoice" not in result
        assert result["vendor_name"] is not None
        assert "east repair" in result["vendor_name"].lower()
        assert result["invoice_number"] == "US-001"
        assert result["total"] == pytest.approx(154.06, abs=0.1)
        assert result["currency"] == "USD"
        assert result["document_hash"] is not None

    def test_extract_from_pdf_zylker(self, tools, uploaded_paths):
        """Sample 2: Zylker Electronics Hub — should extract all fields."""
        result = tools["extract_invoice_data"].invoke({
            "attachment_path": uploaded_paths[2],
            "email_body": FAKE_EMAILS[2],
        })
        assert "error" not in result
        assert result["total"] == pytest.approx(2338.35, abs=0.1)
        assert result["invoice_number"] == "INV-000001"

    def test_extract_not_invoice(self, tools, uploaded_paths):
        """Sample 4: Tree photo — should return not_invoice: true."""
        result = tools["extract_invoice_data"].invoke({
            "attachment_path": uploaded_paths[4],
        })
        assert result.get("not_invoice") is True

    def test_extract_from_email_body_only(self, tools):
        """No attachment — extract from email body alone."""
        result = tools["extract_invoice_data"].invoke({
            "email_body": (
                "Hi, this is a reminder that invoice #REM-99 from Studio Berlin "
                "for location rental is €2,500. Invoice date was 2026-01-15. "
                "Currency EUR. Please process."
            ),
            "email_subject": "Fwd: Location rental invoice",
        })
        assert "error" not in result
        assert result.get("not_invoice") is not True
        assert result["total"] == pytest.approx(2500, abs=1)
        assert result["currency"] == "EUR"
        assert result["document_hash"] is None  # no file processed

    def test_extract_unsupported_file_type(self, tools):
        """Unsupported extension — should return an error."""
        result = tools["extract_invoice_data"].invoke({
            "attachment_path": "some/path/file.docx",
        })
        assert "error" in result


# ---------------------------------------------------------------------------
# create_or_update_contact
# ---------------------------------------------------------------------------

class TestCreateOrUpdateContact:

    def test_create_new_vendor_contact(self, tools, cleanup_contacts):
        """Create a new vendor contact."""
        email = f"billing-{_RUN_TAG}@testvendor.com"
        result = tools["create_or_update_contact"].invoke({
            "email": email,
            "sender_type": "vendor",
            "reachable": True,
            "display_name": f"Test Vendor Billing {_RUN_TAG}",
        })
        cleanup_contacts.append(result["id"])
        assert result["email"] == email.lower()
        assert result["sender_type"] == "vendor"
        assert result["reachable"] is True

    def test_create_noreply_contact(self, tools, cleanup_contacts):
        """Create a noreply contact — reachable should be false."""
        email = f"noreply-{_RUN_TAG}@automated.com"
        result = tools["create_or_update_contact"].invoke({
            "email": email,
            "sender_type": "unknown",
            "reachable": False,
        })
        cleanup_contacts.append(result["id"])
        assert result["reachable"] is False

    def test_update_existing_contact(self, tools, cleanup_contacts):
        """Create then update — sender_type should change."""
        email = f"update-{_RUN_TAG}@example.com"
        # Create as unknown
        created = tools["create_or_update_contact"].invoke({
            "email": email,
            "sender_type": "unknown",
        })
        cleanup_contacts.append(created["id"])
        assert created["sender_type"] == "unknown"

        # Update to coworker
        updated = tools["create_or_update_contact"].invoke({
            "email": email,
            "sender_type": "coworker",
            "display_name": f"Updated Name {_RUN_TAG}",
        })
        assert updated["id"] == created["id"]
        assert updated["sender_type"] == "coworker"


# ---------------------------------------------------------------------------
# check_duplicate
# ---------------------------------------------------------------------------

class TestCheckDuplicate:

    def test_no_candidates_returns_new(self, tools):
        """Unknown vendor — should return 'new'."""
        result = tools["check_duplicate"].invoke({
            "vendor_name": _tagged("Totally Unique Vendor XYZ"),
        })
        assert result["verdict"] == "new"
        assert result["matched_invoice_id"] is None

    def test_hash_match_returns_duplicate(self, tools, cleanup_invoices):
        """Create an invoice with a hash, then check with same hash — instant dup."""
        doc_hash = _local_hash(3)  # Tom Green Handyman

        invoice = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Tom Green Handyman"),
            "total": 3367.20,
            "invoice_date": "2016-06-05",
            "currency": "USD",
            "invoice_number": f"0003521-{_RUN_TAG}",
            "document_hash": doc_hash,
        })
        cleanup_invoices.append(invoice["id"])

        result = tools["check_duplicate"].invoke({
            "vendor_name": _tagged("Tom Green Handyman"),
            "document_hash": doc_hash,
        })
        assert result["verdict"] == "duplicate"
        assert result["matched_invoice_id"] == invoice["id"]

    def test_same_vendor_and_number_duplicate(self, tools, cleanup_invoices):
        """Same vendor + invoice number — LLM should say duplicate."""
        vendor = _tagged("ABC Exports Ltd.")
        inv_num = f"CI2023-001-{_RUN_TAG}"

        invoice = tools["create_invoice"].invoke({
            "vendor_name": vendor,
            "total": 13000.00,
            "invoice_date": "2030-09-30",
            "currency": "USD",
            "invoice_number": inv_num,
        })
        cleanup_invoices.append(invoice["id"])

        result = tools["check_duplicate"].invoke({
            "vendor_name": vendor,
            "total": 13000.00,
            "invoice_date": "2030-09-30",
            "invoice_number": inv_num,
            "email_context": "Resending the same invoice",
        })
        assert result["verdict"] == "duplicate"

    def test_same_vendor_different_number_is_new(self, tools, cleanup_invoices):
        """Same vendor but different invoice number — should be new."""
        vendor = _tagged("ABC Exports Ltd.")

        invoice = tools["create_invoice"].invoke({
            "vendor_name": vendor,
            "total": 5000.00,
            "invoice_date": "2030-10-15",
            "currency": "USD",
            "invoice_number": f"CI2023-002-{_RUN_TAG}",
        })
        cleanup_invoices.append(invoice["id"])

        result = tools["check_duplicate"].invoke({
            "vendor_name": vendor,
            "total": 8000.00,
            "invoice_date": "2030-11-01",
            "invoice_number": f"CI2023-003-{_RUN_TAG}",
            "email_context": "New shipment invoice, different from previous orders",
        })
        assert result["verdict"] == "new"


# ---------------------------------------------------------------------------
# create_invoice
# ---------------------------------------------------------------------------

class TestCreateInvoice:

    def test_create_complete_invoice(self, tools, cleanup_invoices):
        """All required fields → processing_status = 'complete'."""
        vendor = _tagged("East Repair Inc.")
        result = tools["create_invoice"].invoke({
            "vendor_name": vendor,
            "total": 154.06,
            "invoice_date": "2019-11-02",
            "currency": "USD",
            "invoice_number": f"US-001-{_RUN_TAG}",
            "subtotal": 145.00,
            "vat": 9.06,
            "due_date": "2019-02-26",
            "description": "Brake cables, pedal arms, labor",
        })
        cleanup_invoices.append(result["id"])
        assert result["processing_status"] == "complete"
        assert result["vendor_name"] == vendor
        assert result["total"] == pytest.approx(154.06)

    def test_create_incomplete_invoice(self, tools, cleanup_invoices):
        """Missing required fields → processing_status = 'awaiting_info'."""
        result = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Unknown Sender"),
        })
        cleanup_invoices.append(result["id"])
        assert result["processing_status"] == "awaiting_info"

    def test_create_with_thread_id(self, tools, cleanup_invoices):
        """Passing thread_id should create an invoice_threads link."""
        thread_id = f"test-thread-{_RUN_TAG}"
        result = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Thread Test Vendor"),
            "total": 100.00,
            "invoice_date": "2026-01-01",
            "currency": "EUR",
            "thread_id": thread_id,
        })
        cleanup_invoices.append(result["id"])

        threads = (
            supabase.table("invoice_threads")
            .select("*")
            .eq("invoice_id", result["id"])
            .execute()
        )
        assert len(threads.data) == 1
        assert threads.data[0]["thread_id"] == thread_id


# ---------------------------------------------------------------------------
# update_invoice
# ---------------------------------------------------------------------------

class TestUpdateInvoice:

    def test_update_fills_missing_fields(self, tools, cleanup_invoices):
        """Update missing fields → status transitions to 'complete'."""
        invoice = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Partial Vendor"),
        })
        cleanup_invoices.append(invoice["id"])
        assert invoice["processing_status"] == "awaiting_info"

        updated = tools["update_invoice"].invoke({
            "invoice_id": invoice["id"],
            "updates": {
                "total": 500.00,
                "invoice_date": "2026-02-01",
                "currency": "EUR",
            },
        })
        assert updated["processing_status"] == "complete"
        assert updated["total"] == pytest.approx(500.00)

    def test_update_rejects_protected_fields(self, tools, cleanup_invoices):
        """Fields outside the allowlist should be silently ignored."""
        invoice = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Allowlist Test"),
            "total": 100.00,
            "invoice_date": "2026-01-01",
            "currency": "EUR",
        })
        cleanup_invoices.append(invoice["id"])

        result = tools["update_invoice"].invoke({
            "invoice_id": invoice["id"],
            "updates": {
                "user_id": "hacker-id",
                "created_at": "1999-01-01",
                "id": "fake-id",
            },
        })
        assert result.get("error") == "No valid fields to update"

    def test_update_with_thread_id(self, tools, cleanup_invoices):
        """Passing thread_id should add a new invoice_threads link."""
        invoice = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Thread Update Test"),
            "total": 200.00,
            "invoice_date": "2026-01-01",
            "currency": "EUR",
        })
        cleanup_invoices.append(invoice["id"])

        thread_id = f"reply-thread-{_RUN_TAG}"
        tools["update_invoice"].invoke({
            "invoice_id": invoice["id"],
            "updates": {"description": "Updated via reply"},
            "thread_id": thread_id,
        })

        threads = (
            supabase.table("invoice_threads")
            .select("*")
            .eq("invoice_id", invoice["id"])
            .execute()
        )
        assert len(threads.data) == 1
        assert threads.data[0]["thread_id"] == thread_id

    def test_update_allowlist_accepts_valid_fields(self, tools, cleanup_invoices):
        """Allowlisted fields should be updated successfully."""
        invoice = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Allowlist Valid"),
            "total": 100.00,
            "invoice_date": "2026-01-01",
            "currency": "EUR",
        })
        cleanup_invoices.append(invoice["id"])

        new_name = _tagged("Allowlist Valid Renamed")
        updated = tools["update_invoice"].invoke({
            "invoice_id": invoice["id"],
            "updates": {
                "vendor_name": new_name,
                "description": "New description",
                "payment_status": "paid",
                "due_date": "2026-03-01",
            },
        })
        assert updated["vendor_name"] == new_name
        assert updated["description"] == "New description"
        assert updated["payment_status"] == "paid"


# ---------------------------------------------------------------------------
# assign_invoice
# ---------------------------------------------------------------------------

class TestAssignInvoice:

    def test_assign_sets_project_and_category(self, tools, cleanup_invoices):
        """Assign should set project_id and category_id on the invoice."""
        invoice = tools["create_invoice"].invoke({
            "vendor_name": _tagged("Assign Test Vendor"),
            "total": 750.00,
            "invoice_date": "2026-01-15",
            "currency": "EUR",
        })
        cleanup_invoices.append(invoice["id"])

        projects = (
            supabase.table("projects")
            .select("id, project_categories(id, category_id)")
            .eq("user_id", USER_ID)
            .eq("status", "Active")
            .limit(1)
            .execute()
        )
        if not projects.data:
            pytest.skip("No active projects for test user")

        project_id = projects.data[0]["id"]
        cats = projects.data[0].get("project_categories", [])
        if not cats:
            pytest.skip("No categories for test project")
        category_id = cats[0]["category_id"]

        result = tools["assign_invoice"].invoke({
            "invoice_id": invoice["id"],
            "project_id": project_id,
            "category_id": category_id,
        })
        assert result.get("project_id") == project_id
        assert result.get("category_id") == category_id

    def test_assign_nonexistent_invoice(self, tools):
        """Assigning a non-existent invoice should return an error."""
        result = tools["assign_invoice"].invoke({
            "invoice_id": "00000000-0000-0000-0000-000000000000",
            "project_id": "fake-project",
            "category_id": "fake-category",
        })
        assert "error" in result
