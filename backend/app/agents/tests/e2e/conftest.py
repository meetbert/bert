"""E2E test fixtures — shared state for the full pipeline tests.

Relies on the parent conftest.py (tests/conftest.py) having already
added the agent/ directory to sys.path and loaded .env.
"""

import uuid

import pytest

from app.agents.config import supabase
from app.agents.tests.conftest import USER_ID


@pytest.fixture(autouse=True)
def langsmith_trace(request):
    from langsmith import trace as ls_trace
    with ls_trace(name=f"E2E: {request.node.name}"):
        yield


@pytest.fixture(scope="session")
def test_user_id() -> str:
    return USER_ID


@pytest.fixture
def tag() -> str:
    """Unique per-test tag, e.g. '[test-3f2a1c]'. Embedded in vendor names / project names."""
    return f"[test-{uuid.uuid4().hex[:6]}]"


@pytest.fixture(autouse=True, scope="module")
def sweep_orphans():
    """At module start, delete all rows owned by the test user."""
    old_invoices = (
        supabase.table("invoices")
        .select("id")
        .eq("user_id", USER_ID)
        .execute()
    )
    for inv in old_invoices.data:
        try:
            supabase.table("invoice_threads").delete().eq("invoice_id", inv["id"]).execute()
            supabase.table("invoices").delete().eq("id", inv["id"]).execute()
        except Exception:
            pass

    for table in ("projects", "email_contacts"):
        try:
            supabase.table(table).delete().eq("user_id", USER_ID).execute()
        except Exception:
            pass

    yield


@pytest.fixture
def invoice_ids():
    """Collect invoice IDs during a test; delete them all in teardown."""
    ids = []
    yield ids
    for inv_id in ids:
        try:
            supabase.table("invoice_threads").delete().eq("invoice_id", inv_id).execute()
            supabase.table("invoices").delete().eq("id", inv_id).execute()
        except Exception:
            pass


@pytest.fixture
def project_ids():
    """Collect project IDs during a test; delete them all in teardown."""
    ids = []
    yield ids
    for proj_id in ids:
        try:
            supabase.table("projects").delete().eq("id", proj_id).execute()
        except Exception:
            pass
