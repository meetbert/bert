"""
Get tools tests — queries real Supabase with seeded test data.
Run from agent/: python -m pytest tests/test_get_tools.py -v
"""
from app.agents.tools.get_tools import create_get_tools

# ---- Test data IDs (match seeded rows in Supabase) ----
USER_ID = "cf08829b-9f8a-4448-b3b3-666391e469c0"
PROJECT_ID = "29ff02d5-7132-4aa2-bd96-36401b846fb8"
CATEGORY_ID = "02d8de88-3f11-4295-a483-936fb501bf63"
INVOICE_ID = "938722c5-9c29-4077-9ef1-459e82ac9263"

tools = {t.name: t for t in create_get_tools(USER_ID)}


# ---------------------------------------------------------------------------
# get_invoice
# ---------------------------------------------------------------------------

def test_get_invoice_found():
    result = tools["get_invoice"].invoke({"invoice_id": INVOICE_ID})
    assert result is not None
    assert result["vendor_name"] == "Acme Corp"
    assert result["total"] == 1200
    assert result["currency"] == "USD"
    assert result["user_id"] == USER_ID


def test_get_invoice_not_found():
    result = tools["get_invoice"].invoke({"invoice_id": "00000000-0000-0000-0000-000000000000"})
    assert result is None


def test_get_invoice_wrong_user():
    """Invoice exists but belongs to a different user — should not return."""
    other_tools = {t.name: t for t in create_get_tools("00000000-0000-0000-0000-000000000000")}
    result = other_tools["get_invoice"].invoke({"invoice_id": INVOICE_ID})
    assert result is None


# ---------------------------------------------------------------------------
# get_invoices_by_vendor
# ---------------------------------------------------------------------------

def test_get_invoices_by_vendor_found():
    result = tools["get_invoices_by_vendor"].invoke({"vendor_name": "Acme Corp"})
    assert len(result) >= 1
    assert result[0]["vendor_name"] == "Acme Corp"


def test_get_invoices_by_vendor_case_insensitive():
    result = tools["get_invoices_by_vendor"].invoke({"vendor_name": "acme corp"})
    assert len(result) >= 1


def test_get_invoices_by_vendor_no_match():
    result = tools["get_invoices_by_vendor"].invoke({"vendor_name": "Nonexistent Vendor"})
    assert result == []


# ---------------------------------------------------------------------------
# get_projects
# ---------------------------------------------------------------------------

def test_get_projects():
    result = tools["get_projects"].invoke({})
    assert len(result) >= 1
    project = next(p for p in result if p["id"] == PROJECT_ID)
    assert project["name"] == "Website Redesign"
    assert project["status"] == "Active"
    assert project["budget"] == 5000


# ---------------------------------------------------------------------------
# get_categories
# ---------------------------------------------------------------------------

def test_get_categories():
    result = tools["get_categories"].invoke({"project_id": PROJECT_ID})
    assert len(result) >= 1
    cat = result[0]
    assert cat["budget"] == 1200
    assert cat["invoice_categories"]["name"] == "Office Supplies"


# ---------------------------------------------------------------------------
# get_project_documents
# ---------------------------------------------------------------------------

def test_get_project_documents():
    result = tools["get_project_documents"].invoke({"project_id": PROJECT_ID})
    assert len(result) >= 1
    assert result[0]["file_name"] == "specs.pdf"


def test_get_project_documents_empty():
    result = tools["get_project_documents"].invoke({"project_id": "00000000-0000-0000-0000-000000000000"})
    assert result == []


# ---------------------------------------------------------------------------
# get_user_settings
# ---------------------------------------------------------------------------

def test_get_user_settings():
    result = tools["get_user_settings"].invoke({})
    assert result is not None
    assert result["company_name"] == "Test Company"
    assert result["base_currency"] == "USD"
    assert result["max_followups"] == 3


# ---------------------------------------------------------------------------
# get_follow_up_state
# ---------------------------------------------------------------------------

def test_follow_up_state_complete_invoice():
    """Invoice has all sender fields filled — no follow-up needed."""
    result = tools["get_follow_up_state"].invoke({"invoice_id": INVOICE_ID})
    assert result["should_follow_up"] is False
    assert result["missing_sender_fields"] == []
    assert result["max_followups"] == 3


def test_follow_up_state_not_found():
    result = tools["get_follow_up_state"].invoke({"invoice_id": "00000000-0000-0000-0000-000000000000"})
    assert result == {"error": "Invoice not found"}
