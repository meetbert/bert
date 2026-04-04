# Integration test fixtures (real LLM, real DB).
# Parent conftest.py (tests/conftest.py) handles path setup and dotenv loading.

import pytest

from app.agents.config import supabase
from app.agents.tests.conftest import USER_ID


@pytest.fixture(autouse=True)
def langsmith_trace(request):
    from langsmith import trace as ls_trace
    with ls_trace(name=f"IT: {request.node.name}"):
        yield


@pytest.fixture(autouse=True, scope="module")
def sweep_orphans():
    """At module start, delete all rows owned by the test user."""
    # Invoices first (invoice_threads FK references invoices)
    invoices = (
        supabase.table("invoices").select("id").eq("user_id", USER_ID).execute()
    )
    for inv in invoices.data:
        try:
            supabase.table("invoice_threads").delete().eq("invoice_id", inv["id"]).execute()
            supabase.table("invoices").delete().eq("id", inv["id"]).execute()
        except Exception:
            pass

    # Projects (project_categories FK references projects)
    projects = (
        supabase.table("projects").select("id").eq("user_id", USER_ID).execute()
    )
    for proj in projects.data:
        try:
            supabase.table("project_categories").delete().eq("project_id", proj["id"]).execute()
            supabase.table("projects").delete().eq("id", proj["id"]).execute()
        except Exception:
            pass

    try:
        supabase.table("email_contacts").delete().eq("user_id", USER_ID).execute()
    except Exception:
        pass

    yield
