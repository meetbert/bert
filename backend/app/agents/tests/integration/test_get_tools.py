"""
Get tools tests — queries real Supabase with test data created in fixtures.
Run from agent/: python -m pytest tests/test_get_tools.py -v

All required rows are created at test-module start and torn down after.
No pre-seeded data in the database is required.
"""
import pytest

from app.agents.config import supabase
from app.agents.tools.get_tools import create_get_tools
from .conftest import USER_ID



# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def seed_data():
    """Create all rows needed by get-tools tests, tear them down after."""

    # user_settings — save original so we can restore it after tests
    orig_settings = (
        supabase.table("user_settings")
        .select("*")
        .eq("id", USER_ID)
        .maybe_single()
        .execute()
    )
    had_settings = orig_settings is not None and orig_settings.data is not None
    orig_settings_data = orig_settings.data if had_settings else None

    supabase.table("user_settings").upsert({
        "id": USER_ID,
        "company_name": "Test Company",
        "base_currency": "USD",
        "max_followups": 3,
    }).execute()

    # invoice_categories — reuse "Office Supplies" if it already exists
    cat_result = (
        supabase.table("invoice_categories")
        .select("id")
        .eq("name", "Office Supplies")
        .execute()
    )
    if cat_result.data:
        category_id = cat_result.data[0]["id"]
        created_category = False
    else:
        cat = (
            supabase.table("invoice_categories")
            .insert({"name": "Office Supplies"})
            .execute()
        )
        category_id = cat.data[0]["id"]
        created_category = True

    # project
    proj = (
        supabase.table("projects")
        .insert({
            "user_id": USER_ID,
            "name": "Website Redesign",
            "budget": 5000,
            "status": "Active",
        })
        .execute()
    )
    project_id = proj.data[0]["id"]

    # project_categories
    supabase.table("project_categories").insert({
        "project_id": project_id,
        "category_id": category_id,
        "budget": 1200,
    }).execute()

    # project_documents
    supabase.table("project_documents").insert({
        "project_id": project_id,
        "file_name": "specs.pdf",
        "storage_path": "test/specs.pdf",
    }).execute()

    # invoice — all four sender fields present so get_follow_up_state
    # returns should_follow_up=False (vendor_name, total, invoice_date, currency)
    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": "Acme Corp",
            "total": 1200,
            "currency": "USD",
            "invoice_date": "2024-01-01",
            "payment_status": "unpaid",
            "project_id": project_id,
        })
        .execute()
    )
    invoice_id = inv.data[0]["id"]

    yield {
        "project_id": project_id,
        "category_id": category_id,
        "invoice_id": invoice_id,
    }

    # Teardown — order matters (FK constraints)
    supabase.table("invoices").delete().eq("id", invoice_id).execute()
    supabase.table("project_documents").delete().eq("project_id", project_id).execute()
    supabase.table("project_categories").delete().eq("project_id", project_id).execute()
    supabase.table("projects").delete().eq("id", project_id).execute()
    if created_category:
        supabase.table("invoice_categories").delete().eq("id", category_id).execute()
    if had_settings:
        supabase.table("user_settings").upsert(orig_settings_data).execute()
    else:
        supabase.table("user_settings").delete().eq("id", USER_ID).execute()


@pytest.fixture(scope="module")
def tools(seed_data):
    return {t.name: t for t in create_get_tools(USER_ID)}


# ---------------------------------------------------------------------------
# get_invoice
# ---------------------------------------------------------------------------

def test_get_invoice_found(tools, seed_data):
    result = tools["get_invoice"].invoke({"invoice_id": seed_data["invoice_id"]})
    assert result is not None
    assert result["vendor_name"] == "Acme Corp"
    assert result["total"] == 1200
    assert result["currency"] == "USD"
    assert result["user_id"] == USER_ID


def test_get_invoice_not_found(tools):
    result = tools["get_invoice"].invoke({"invoice_id": "00000000-0000-0000-0000-000000000000"})
    assert result is None


def test_get_invoice_wrong_user(tools, seed_data):
    """Invoice exists but belongs to a different user — should not return."""
    other_tools = {t.name: t for t in create_get_tools("00000000-0000-0000-0000-000000000000")}
    result = other_tools["get_invoice"].invoke({"invoice_id": seed_data["invoice_id"]})
    assert result is None


# ---------------------------------------------------------------------------
# get_projects
# ---------------------------------------------------------------------------

def test_get_projects(tools, seed_data):
    result = tools["get_projects"].invoke({})
    assert len(result) >= 1
    project = next(p for p in result if p["id"] == seed_data["project_id"])
    assert project["name"] == "Website Redesign"
    assert project["status"] == "Active"
    assert project["budget"] == 5000


# ---------------------------------------------------------------------------
# get_categories
# ---------------------------------------------------------------------------

def test_get_categories(tools, seed_data):
    result = tools["get_categories"].invoke({"project_id": seed_data["project_id"]})
    assert len(result) >= 1
    cat = result[0]
    assert cat["budget"] == 1200
    assert cat["invoice_categories"]["name"] == "Office Supplies"


# ---------------------------------------------------------------------------
# get_project_documents
# ---------------------------------------------------------------------------

def test_get_project_documents(tools, seed_data):
    result = tools["get_project_documents"].invoke({"project_id": seed_data["project_id"]})
    assert len(result) >= 1
    assert result[0]["file_name"] == "specs.pdf"


def test_get_project_documents_empty(tools):
    result = tools["get_project_documents"].invoke({"project_id": "00000000-0000-0000-0000-000000000000"})
    assert result == []


# ---------------------------------------------------------------------------
# get_follow_up_state
# ---------------------------------------------------------------------------

def test_follow_up_state_complete_invoice(tools, seed_data):
    """Invoice has all sender fields filled — no follow-up needed."""
    result = tools["get_follow_up_state"].invoke({
        "invoice_id": seed_data["invoice_id"],
        "sender_email": "billing@acme.com",
    })
    assert result["should_follow_up"] is False
    assert result["missing_sender_fields"] == []
    assert result["max_followups"] == 3


def test_follow_up_state_not_found(tools):
    result = tools["get_follow_up_state"].invoke({
        "invoice_id": "00000000-0000-0000-0000-000000000000",
        "sender_email": "billing@acme.com",
    })
    assert result == {"error": "Invoice not found"}


# ---------------------------------------------------------------------------
# search_invoices
# ---------------------------------------------------------------------------

def test_search_invoices_by_vendor(tools):
    result = tools["search_invoices"].invoke({"vendor_name": "Acme"})
    assert len(result) >= 1
    assert all("acme" in r["vendor_name"].lower() for r in result)


def test_search_invoices_by_payment_status(tools):
    result = tools["search_invoices"].invoke({"payment_status": "unpaid"})
    assert isinstance(result, list)
    assert all(r["payment_status"] == "unpaid" for r in result)


def test_search_invoices_by_project(tools, seed_data):
    result = tools["search_invoices"].invoke({"project_id": seed_data["project_id"]})
    assert len(result) >= 1
    assert all(r["project_id"] == seed_data["project_id"] for r in result)


def test_search_invoices_no_match(tools):
    result = tools["search_invoices"].invoke({"vendor_name": "Nonexistent Vendor XYZ"})
    assert result == []


# ---------------------------------------------------------------------------
# get_vendor_summary
# ---------------------------------------------------------------------------

def test_get_vendor_summary_found(tools):
    result = tools["get_vendor_summary"].invoke({"vendor_name": "Acme Corp"})
    assert result["found"] is True
    assert result["invoice_count"] >= 1
    assert "total_invoiced" in result
    assert "total_outstanding" in result


def test_get_vendor_summary_not_found(tools):
    result = tools["get_vendor_summary"].invoke({"vendor_name": "Nonexistent Vendor XYZ"})
    assert result["found"] is False


# ---------------------------------------------------------------------------
# get_spend_summary
# ---------------------------------------------------------------------------

def test_get_spend_summary_all_time(tools):
    result = tools["get_spend_summary"].invoke({})
    assert result["found"] is True
    assert result["total_spend"] >= 0
    assert "spend_by_project" in result
    assert "top_vendors" in result


def test_get_spend_summary_with_date_range(tools):
    result = tools["get_spend_summary"].invoke({
        "date_from": "2020-01-01",
        "date_to": "2030-12-31",
    })
    assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# get_due_soon
# ---------------------------------------------------------------------------

def test_get_due_soon_returns_structure(tools):
    result = tools["get_due_soon"].invoke({"days": 30})
    assert "invoice_count" in result
    assert "total_due" in result
    assert "invoices" in result
    assert isinstance(result["invoices"], list)


# ---------------------------------------------------------------------------
# get_project_spend
# ---------------------------------------------------------------------------

def test_get_project_spend_found(tools, seed_data):
    result = tools["get_project_spend"].invoke({"project_id": seed_data["project_id"]})
    assert "project_name" in result
    assert "budget" in result
    assert "total_invoiced" in result
    assert "remaining_budget" in result
    assert "over_budget" in result


def test_get_project_spend_not_found(tools):
    result = tools["get_project_spend"].invoke({
        "project_id": "00000000-0000-0000-0000-000000000000",
    })
    assert "error" in result
