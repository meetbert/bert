"""
Chat Reply Agent tests — integration tests with real LLM.
Run from agent/: python -m pytest tests/test_chat_reply_agent.py -v

Tests the chat reply agent: formats pipeline task results into a concise
chat-friendly summary. No tools, no database writes — LLM-only.
"""

import pytest

from app.agents.subagents.chat_reply_agent import run_chat_reply_agent
from .conftest import USER_ID



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chat_context(message: str, history: list[str] | None = None) -> str:
    """Build a minimal chat context string."""
    hist = history or []
    return (
        f"Message: {message}\n"
        f"Attachments: []\n"
        f"History: {hist}"
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reply_invoice_created():
    """Agent should confirm invoice creation in a chat-friendly tone."""
    result = await run_chat_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Created invoice from Berlin Lens Co (#BL-2024-089): "
            "camera rental, €1,350 + VAT, currency EUR, invoice_date 2026-03-15. "
            "All required fields present. Status: complete."
        ),
        context=_make_chat_context("I just sent you an invoice from Berlin Lens."),
    )

    assert isinstance(result, dict)
    assert "reply" in result
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_question_answered():
    """Agent should present the data answer clearly."""
    result = await run_chat_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Total spend with Studio Hamburg: €12,400 across 4 invoices. "
            "Most recent invoice: March 2026, €3,200."
        ),
        context=_make_chat_context("How much have we spent with Studio Hamburg?"),
    )

    assert isinstance(result, dict)
    assert "reply" in result
    assert result["reply"]
    # Answer should reference some spend figure
    assert any(term in result["reply"] for term in ["12", "400", "hamburg", "Hamburg"])


@pytest.mark.asyncio
async def test_reply_multiple_tasks():
    """Multiple task results should be merged into one coherent reply."""
    result = await run_chat_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Created invoice from Fresh Bites: catering, €650, currency EUR. "
            "Status: awaiting_info — missing invoice_date.\n"
            "Created invoice from TechRent Berlin: lighting rig, €1,200, "
            "currency EUR, invoice_date 2026-03-01. Status: complete."
        ),
        context=_make_chat_context(
            "I forwarded two invoices — Fresh Bites catering and TechRent lighting."
        ),
    )

    assert isinstance(result, dict)
    assert "reply" in result
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_project_created():
    """Agent should confirm project creation."""
    result = await run_chat_reply_agent(
        user_id=USER_ID,
        task_results=(
            "Created project 'Brighton Beach Shoot' with budget £20,000. "
            "Status: Active."
        ),
        context=_make_chat_context("Create a project called Brighton Beach Shoot with a £20k budget."),
    )

    assert isinstance(result, dict)
    assert "reply" in result
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_no_action_needed():
    """When no tasks were run, agent should respond gracefully."""
    result = await run_chat_reply_agent(
        user_id=USER_ID,
        task_results="No actions were required for this message.",
        context=_make_chat_context("Thanks, have a good weekend!"),
    )

    assert isinstance(result, dict)
    assert "reply" in result
    assert result["reply"]


@pytest.mark.asyncio
async def test_reply_returns_only_reply_key():
    """Chat reply agent output must only contain the 'reply' key."""
    result = await run_chat_reply_agent(
        user_id=USER_ID,
        task_results="Updated invoice INV-001: set payment_status to paid.",
        context=_make_chat_context("Mark INV-001 as paid."),
    )

    assert set(result.keys()) == {"reply"}
