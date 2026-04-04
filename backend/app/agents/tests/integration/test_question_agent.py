"""
Question Agent tests — integration tests with real LLM + real Supabase.
Run from agent/: python -m pytest tests/test_question_agent.py -v

Tests the question agent: read-only data queries answered in natural language.
All tests are non-destructive — no data is created or modified.
"""

import uuid

import pytest

from app.agents.config import supabase
from app.agents.subagents.question_agent import run_question_agent
from .conftest import USER_ID

_RUN_TAG = f"[test-{uuid.uuid4().hex[:8]}]"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chat_context(message: str) -> str:
    """Build a minimal chat context string for the question agent."""
    return (
        f"Message: {message}\n"
        f"Attachments: []\n"
        f"History: []"
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def invoice_fixture():
    """Create a known invoice for querying, delete after module."""
    vendor_name = f"Query Vendor {_RUN_TAG}"
    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": vendor_name,
            "total": 3750.0,
            "currency": "EUR",
            "invoice_number": f"QRY-{_RUN_TAG[:8]}",
            "invoice_date": "2026-03-01",
            "due_date": "2026-04-01",
            "payment_status": "unpaid",
        })
        .execute()
    )
    invoice_id = inv.data[0]["id"]
    yield {"id": invoice_id, "vendor_name": vendor_name, "total": 3750.0}
    try:
        supabase.table("invoices").delete().eq("id", invoice_id).execute()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_question_spend_summary():
    """Ask for overall spend summary — agent should use get_spend_summary."""
    result = await run_question_agent(
        user_id=USER_ID,
        task_instruction="What is the total amount spent across all invoices?",
        context=_make_chat_context("What is the total spend?"),
    )

    assert isinstance(result, dict)
    assert "summary" in result
    assert result["summary"]  # non-empty string


@pytest.mark.asyncio
async def test_question_due_soon():
    """Ask which invoices are due soon — agent should use get_due_soon."""
    result = await run_question_agent(
        user_id=USER_ID,
        task_instruction="Which invoices are due in the next 30 days?",
        context=_make_chat_context("What invoices are due soon?"),
    )

    assert isinstance(result, dict)
    assert "summary" in result
    assert result["summary"]


@pytest.mark.asyncio
async def test_question_vendor_history(invoice_fixture):
    """Ask about a specific vendor — agent should use get_vendor_summary."""
    vendor = invoice_fixture["vendor_name"]
    result = await run_question_agent(
        user_id=USER_ID,
        task_instruction=f"What is the total spend with {vendor}?",
        context=_make_chat_context(f"How much have we spent with {vendor}?"),
    )

    assert isinstance(result, dict)
    assert "summary" in result
    # The answer should reference the vendor or the amount
    summary_lower = result["summary"].lower()
    assert any(
        term in summary_lower
        for term in [vendor.lower()[:10], "3750", "3,750", "eur"]
    )


@pytest.mark.asyncio
async def test_question_projects_list():
    """Ask for a list of projects — agent should use get_projects."""
    result = await run_question_agent(
        user_id=USER_ID,
        task_instruction="What projects do we have?",
        context=_make_chat_context("Show me all projects."),
    )

    assert isinstance(result, dict)
    assert "summary" in result
    assert result["summary"]


@pytest.mark.asyncio
async def test_question_no_data_graceful():
    """Question about a non-existent vendor — agent should respond gracefully."""
    result = await run_question_agent(
        user_id=USER_ID,
        task_instruction="What is the total spend with Vendor XYZ-NONEXISTENT-12345?",
        context=_make_chat_context("How much did we spend with Vendor XYZ-NONEXISTENT-12345?"),
    )

    assert isinstance(result, dict)
    assert "summary" in result
    assert result["summary"]


@pytest.mark.asyncio
async def test_question_returns_only_summary_key():
    """Question agent output must only contain the 'summary' key."""
    result = await run_question_agent(
        user_id=USER_ID,
        task_instruction="How many unpaid invoices do we have?",
        context=_make_chat_context("How many unpaid invoices are there?"),
    )

    assert set(result.keys()) == {"summary"}
