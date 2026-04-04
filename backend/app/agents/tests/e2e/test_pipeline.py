"""E2E pipeline tests — full run_pipeline() + reply agent.

Each test:
  1. Calls run_pipeline(user_id, context).
  2. Calls run_chat_reply_agent() (or run_email_reply_agent for test #16)
     to get the final user-facing reply.
  3. Asserts DB state and/or uses an LLM judge on the reply.

No assertions on internal pipeline fields (task_types, task_results, etc.).
All DB rows created during a test are cleaned up in fixture teardown.
"""

import os
import pathlib
import pytest

from app.agents.config import supabase
from app.agents.pipeline import run_pipeline, store_attachment
from app.agents.subagents.chat_reply_agent import run_chat_reply_agent
from app.agents.subagents.email_reply_agent import run_email_reply_agent
from langchain_core.messages import HumanMessage
from .conftest import USER_ID

SAMPLE_DIR = pathlib.Path(__file__).parent.parent / "sample_invoices"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _chat(msg: str, attachments: list[str] | None = None) -> str:
    """Build a chat-formatted context string."""
    lines = ["Source: Chat", "", f"User message: {msg}"]
    lines.append(f"Attachments: {attachments or []}")
    return "\n".join(lines)


def _email(
    sender: str,
    subject: str,
    body: str,
    attachments: list[str] | None = None,
    thread_id: str = "test-thread-001",
    message_id: str = "test-msg-001",
) -> str:
    """Build an email-formatted context string."""
    return (
        f"From: {sender}\n"
        f"Subject: {subject}\n"
        f"Body: {body}\n"
        f"Attachments: {attachments or []}\n"
        f"Thread ID: {thread_id}\n"
        f"Message ID: {message_id}\n"
        f"Linked invoices: []"
    )


async def _run_chat(user_id: str, context: str) -> tuple[dict, str]:
    """Run pipeline + chat reply agent. Returns (pipeline_result, reply)."""
    pipeline_result = await run_pipeline(user_id=user_id, context=context)
    task_results_str = "\n\n".join(pipeline_result["task_results"]) or "No tasks processed."
    result = await run_chat_reply_agent(user_id=user_id, task_results=task_results_str, context=context)
    return pipeline_result, result["reply"]


async def _run_email(user_id: str, context: str) -> tuple[dict, dict]:
    """Run pipeline + email reply agent. Returns (pipeline_result, reply_result)."""
    pipeline_result = await run_pipeline(user_id=user_id, context=context)
    task_results_str = "\n\n".join(pipeline_result["task_results"]) or "No tasks processed."
    follow_up_str = "\n\n".join(pipeline_result["follow_up_states"])
    reply_result = await run_email_reply_agent(
        user_id=user_id,
        task_results=task_results_str,
        follow_up_states=follow_up_str,
        email_context=context,
    )
    return pipeline_result, reply_result


async def _llm_judge(context: str, reply: str, criteria: str) -> bool:
    """Ask the LLM whether `reply` satisfies `criteria`. Returns True/False."""
    from app.agents.config import get_llm
    from langsmith import tracing_context
    llm = get_llm()
    prompt = (
        f"Context: {context}\n"
        f"Reply: {reply}\n\n"
        f"Does the reply satisfy this criteria: '{criteria}'?\n"
        "Answer only YES or NO."
    )
    with tracing_context(enabled=False):
        response = await llm.ainvoke([HumanMessage(content=prompt)])
    return "YES" in response.content.upper()


def _find_invoices_by_tag(tag: str) -> list[dict]:
    """Find invoices in the DB whose vendor_name contains the tag."""
    return (
        supabase.table("invoices")
        .select("*")
        .eq("user_id", USER_ID)
        .ilike("vendor_name", f"%{tag}%")
        .execute()
    ).data


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_new_invoice_from_body(tag, invoice_ids):
    """T1 — Agent extracts invoice from chat message body and creates it."""
    # Use a stable invoice_number for DB lookup (LLM may strip the tag from vendor names)
    inv_num = f"INV-{tag[6:-1]}"
    vendor = f"Acme {tag}"
    context = _chat(
        f"Just received invoice {inv_num} from {vendor}. "
        "Total is €120, currency EUR, it's for Office Supplies. Please record it."
    )

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion — search by invoice_number which the LLM preserves verbatim
    rows = (
        supabase.table("invoices")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("invoice_number", inv_num)
        .execute()
    ).data
    assert rows, f"Expected invoice {inv_num} to be created"
    inv = rows[0]
    invoice_ids.append(inv["id"])

    assert inv["total"] == pytest.approx(120, abs=1)
    assert inv["currency"] == "EUR"

    # LLM judge
    assert await _llm_judge(
        f"User asked to record a €120 invoice from {vendor}",
        reply,
        "confirms that the invoice was created or recorded",
    )


@pytest.mark.asyncio
async def test_new_invoice_from_attachment(tag, invoice_ids):
    """T2 — Agent extracts invoice from a PDF attachment uploaded via store_attachment."""
    # Upload using store_attachment — same code path as the real chat channel
    pdf_path = SAMPLE_DIR / "sample_invoice_1.pdf"
    attachment_path = store_attachment(
        USER_ID,
        "sample_invoice_1.pdf",
        pdf_path.read_bytes(),
    )

    context = _chat(
        f"Please process the attached invoice {tag}.",
        attachments=[attachment_path],
    )

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion — find the invoice linked to this document path
    rows = (
        supabase.table("invoices")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("document_path", attachment_path)
        .execute()
    ).data

    # Fall back to storage-path lookup in case path was moved by assign_invoice
    if not rows:
        rows = (
            supabase.table("invoices")
            .select("*")
            .eq("user_id", USER_ID)
            .ilike("document_path", f"%{attachment_path.split('/')[-1]}%")
            .execute()
        ).data

    assert rows, "Expected an invoice to be created from the attachment"
    invoice_ids.append(rows[0]["id"])

    # LLM judge
    assert await _llm_judge(
        "User sent a PDF invoice attachment for processing",
        reply,
        "confirms that the invoice was processed or recorded",
    )

    # Cleanup storage
    try:
        supabase.storage.from_("invoices-bucket").remove([attachment_path])
    except Exception:
        pass


@pytest.mark.asyncio
async def test_vendor_correction(tag, invoice_ids):
    """T3 — Agent updates an existing invoice when vendor sends a correction."""
    vendor = f"Studio {tag}"
    # Pre-create an incomplete invoice
    pre = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": vendor,
            "total": None,
            "invoice_date": None,
            "currency": None,
            "processing_status": "awaiting_info",
        })
        .execute()
    )
    inv_id = pre.data[0]["id"]
    invoice_ids.append(inv_id)

    context = _chat(
        f"{vendor} just replied to correct their invoice: "
        "the total is €200, date is 2026-03-01, currency EUR."
    )

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion
    inv = (
        supabase.table("invoices")
        .select("*")
        .eq("id", inv_id)
        .maybe_single()
        .execute()
    )
    assert inv.data is not None
    assert inv.data["total"] == pytest.approx(200, abs=1)

    # LLM judge
    assert await _llm_judge(
        f"Vendor {vendor} corrected their invoice total to €200",
        reply,
        "confirms that the invoice was updated with the corrected details",
    )


@pytest.mark.asyncio
async def test_invoice_project_and_category(tag, invoice_ids, project_ids):
    """T4 — Agent creates invoice and assigns it to a project with a category."""
    vendor = f"Arri {tag}"
    # No brackets in project name — brackets trick the LLM into treating the tag as an ID
    project_name = f"Brighton Shoot {tag[6:-1]}"

    # Pre-create a project
    proj = (
        supabase.table("projects")
        .insert({
            "user_id": USER_ID,
            "name": project_name,
            "budget": 10000,
            "status": "Active",
        })
        .execute()
    )
    proj_id = proj.data[0]["id"]
    project_ids.append(proj_id)

    # Seed a few project_categories so get_categories returns results for this project
    global_cats = (
        supabase.table("invoice_categories")
        .select("id, name")
        .limit(3)
        .execute()
    ).data
    seeded_cat_ids = []
    for cat in global_cats:
        row = (
            supabase.table("project_categories")
            .insert({"project_id": proj_id, "category_id": cat["id"], "budget": 2000})
            .execute()
        )
        seeded_cat_ids.append(row.data[0]["id"])

    inv_num = f"ARRI-{tag[6:-1]}"
    context = _chat(
        f"New invoice {inv_num} from {vendor} for €500 EUR. Please record it and assign it "
        f"to the project '{project_name}'."
    )

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion — search by invoice_number
    rows = (
        supabase.table("invoices")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("invoice_number", inv_num)
        .execute()
    ).data
    assert rows, f"Expected invoice {inv_num} to be created"
    inv = rows[0]
    invoice_ids.append(inv["id"])

    assert inv["project_id"] == proj_id
    assert inv["category_id"] is not None

    # Cleanup seeded project_categories
    for cat_id in seeded_cat_ids:
        try:
            supabase.table("project_categories").delete().eq("id", cat_id).execute()
        except Exception:
            pass

    # LLM judge
    assert await _llm_judge(
        f"User asked to record a €500 invoice from {vendor} and assign it to {project_name}",
        reply,
        "confirms the invoice was recorded and assigned to the project",
    )


@pytest.mark.asyncio
async def test_bulk_update(tag, invoice_ids):
    """T5 — Agent bulk-marks all invoices from a vendor as paid."""
    vendor = f"Bulk {tag}"
    ids = []
    for _ in range(2):
        inv = (
            supabase.table("invoices")
            .insert({
                "user_id": USER_ID,
                "vendor_name": vendor,
                "total": 100.00,
                "invoice_date": "2026-01-01",
                "currency": "EUR",
                "payment_status": "unpaid",
            })
            .execute()
        )
        inv_id = inv.data[0]["id"]
        invoice_ids.append(inv_id)
        ids.append(inv_id)

    context = _chat(f"Please mark all invoices from {vendor} as paid.")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion
    for inv_id in ids:
        row = (
            supabase.table("invoices")
            .select("payment_status")
            .eq("id", inv_id)
            .maybe_single()
            .execute()
        )
        assert row.data["payment_status"] == "paid"

    # LLM judge
    assert await _llm_judge(
        f"User asked to mark all {vendor} invoices as paid",
        reply,
        "confirms that the invoices were marked as paid",
    )


@pytest.mark.asyncio
async def test_delete_invoice(tag, invoice_ids):
    """T6 — Agent deletes an invoice when asked."""
    vendor = f"Delete {tag}"
    inv_number = f"DEL-{tag}"
    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": vendor,
            "total": 300.00,
            "invoice_date": "2026-01-01",
            "currency": "EUR",
            "invoice_number": inv_number,
        })
        .execute()
    )
    inv_id = inv.data[0]["id"]
    # Add to cleanup in case agent doesn't delete it
    invoice_ids.append(inv_id)

    context = _chat(f"Please delete invoice {inv_number}.")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion
    gone = (
        supabase.table("invoices")
        .select("id")
        .eq("id", inv_id)
        .maybe_single()
        .execute()
    )
    assert gone is None or gone.data is None

    # LLM judge
    assert await _llm_judge(
        f"User asked to delete invoice {inv_number}",
        reply,
        "confirms that the invoice was deleted",
    )


@pytest.mark.asyncio
async def test_create_project(tag, project_ids):
    """T7 — Agent creates a new project with a budget."""
    project_name = f"Alpha {tag}"
    context = _chat(f"Please create a new project called '{project_name}' with a budget of €50000.")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion
    rows = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", USER_ID)
        .ilike("name", f"%{tag}%")
        .execute()
    ).data
    assert rows, "Expected a project to be created"
    proj = rows[0]
    project_ids.append(proj["id"])

    assert proj["budget"] == pytest.approx(50000, abs=1)

    # LLM judge
    assert await _llm_judge(
        f"User asked to create project {project_name} with a €50000 budget",
        reply,
        "confirms the project was created",
    )


@pytest.mark.asyncio
async def test_update_project(tag, project_ids):
    """T8 — Agent updates a project's budget."""
    # No brackets — brackets trick the LLM into treating the tag as a project ID
    project_name = f"Proj {tag[6:-1]}"
    proj = (
        supabase.table("projects")
        .insert({
            "user_id": USER_ID,
            "name": project_name,
            "budget": 10000,
            "status": "Active",
        })
        .execute()
    )
    proj_id = proj.data[0]["id"]
    project_ids.append(proj_id)

    context = _chat(f"Please update the budget for project '{project_name}' to €75000.")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion
    updated = (
        supabase.table("projects")
        .select("budget")
        .eq("id", proj_id)
        .maybe_single()
        .execute()
    )
    assert updated.data["budget"] == pytest.approx(75000, abs=1)

    # LLM judge
    assert await _llm_judge(
        f"User asked to update project {project_name} budget to €75000",
        reply,
        "confirms the project budget was updated",
    )


@pytest.mark.asyncio
async def test_multi_task_invoice_and_question(tag, invoice_ids):
    """T9 — Agent processes an invoice AND answers a question in a single message."""
    inv_num = f"MULTI-{tag[6:-1]}"
    vendor = f"Multi {tag}"
    context = _chat(
        f"I just received invoice {inv_num} from {vendor} for €50 EUR. "
        "Please record it. Also, what is my total outstanding amount across all invoices?"
    )

    pipeline_result, reply = await _run_chat(USER_ID, context)

    # DB assertion — invoice was created
    rows = (
        supabase.table("invoices")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("invoice_number", inv_num)
        .execute()
    ).data
    assert rows, f"Expected invoice {inv_num} to be created"
    invoice_ids.append(rows[0]["id"])

    # LLM judge — reply addresses both actions
    assert await _llm_judge(
        f"User asked to record a €50 invoice from {vendor} AND asked about total outstanding",
        reply,
        "confirms the invoice was recorded AND mentions or answers the spend question",
    )


@pytest.mark.asyncio
async def test_spend_summary(tag, invoice_ids):
    """T10 — Question agent answers a spend summary query correctly."""
    vendor = f"SpendCo {tag}"
    for amount in [100, 200]:
        inv = (
            supabase.table("invoices")
            .insert({
                "user_id": USER_ID,
                "vendor_name": vendor,
                "total": float(amount),
                "invoice_date": "2026-03-01",
                "currency": "EUR",
            })
            .execute()
        )
        invoice_ids.append(inv.data[0]["id"])

    context = _chat(f"What is the total amount I owe to {vendor}?")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    assert await _llm_judge(
        f"User asked for total spend with {vendor}. Two invoices: €100 and €200, total €300.",
        reply,
        "mentions 300 or states the total is approximately €300",
    )


@pytest.mark.asyncio
async def test_due_soon(tag, invoice_ids):
    """T11 — Question agent lists invoices due within the next few days."""
    from datetime import date, timedelta
    vendor = f"DueCo {tag}"
    due = (date.today() + timedelta(days=3)).isoformat()

    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": vendor,
            "total": 500.00,
            "invoice_date": "2026-03-01",
            "due_date": due,
            "currency": "EUR",
        })
        .execute()
    )
    invoice_ids.append(inv.data[0]["id"])

    context = _chat(f"Which invoices from {vendor} are due soon?")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    assert await _llm_judge(
        f"User asked which {vendor} invoices are due soon. One invoice is due in 3 days.",
        reply,
        f"mentions {vendor} or the invoice due on {due}",
    )


@pytest.mark.asyncio
async def test_project_spend(tag, invoice_ids, project_ids):
    """T12 — Question agent reports remaining project budget correctly."""
    project_name = f"ProjX {tag}"
    proj = (
        supabase.table("projects")
        .insert({
            "user_id": USER_ID,
            "name": project_name,
            "budget": 5000,
            "status": "Active",
        })
        .execute()
    )
    proj_id = proj.data[0]["id"]
    project_ids.append(proj_id)

    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": f"SomeVendor {tag}",
            "total": 1000.00,
            "invoice_date": "2026-03-01",
            "currency": "EUR",
            "project_id": proj_id,
        })
        .execute()
    )
    invoice_ids.append(inv.data[0]["id"])

    context = _chat(f"What is the remaining budget for project '{project_name}'?")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    assert await _llm_judge(
        f"Project {project_name} has a €5000 budget. One €1000 invoice is assigned to it.",
        reply,
        "mentions the project budget or spend amount (e.g. 5000, 4000, or 1000)",
    )


@pytest.mark.asyncio
async def test_vendor_summary(tag, invoice_ids):
    """T13 — Question agent sums up what is owed to a specific vendor."""
    vendor = f"VendX {tag}"
    for amount in [100, 150]:
        inv = (
            supabase.table("invoices")
            .insert({
                "user_id": USER_ID,
                "vendor_name": vendor,
                "total": float(amount),
                "invoice_date": "2026-03-01",
                "currency": "EUR",
                "payment_status": "unpaid",
            })
            .execute()
        )
        invoice_ids.append(inv.data[0]["id"])

    context = _chat(f"How much do I owe {vendor} in total?")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    assert await _llm_judge(
        f"User asked total owed to {vendor}. Two unpaid invoices: €100 and €150, total €250.",
        reply,
        "mentions 250 or states the total owed is approximately €250",
    )


@pytest.mark.asyncio
async def test_invoice_search(tag, invoice_ids):
    """T14 — Question agent finds invoices when the user searches by vendor."""
    # No brackets — brackets in vendor names may be stripped by the LLM in replies
    vendor = f"Search {tag[6:-1]}"
    inv = (
        supabase.table("invoices")
        .insert({
            "user_id": USER_ID,
            "vendor_name": vendor,
            "total": 75.00,
            "invoice_date": "2026-02-01",
            "currency": "EUR",
        })
        .execute()
    )
    invoice_ids.append(inv.data[0]["id"])

    context = _chat(f"Find all invoices from {vendor}.")

    pipeline_result, reply = await _run_chat(USER_ID, context)

    assert await _llm_judge(
        f"User asked to find invoices from {vendor}. One invoice exists for €75.",
        reply,
        f"mentions {vendor} or shows an invoice result",
    )


@pytest.mark.asyncio
async def test_no_action(test_user_id):
    """T15 — A thank-you note should produce no DB changes and a polite reply."""
    # Count rows before
    before_invoices = len(
        supabase.table("invoices").select("id").eq("user_id", test_user_id).execute().data
    )
    before_projects = len(
        supabase.table("projects").select("id").eq("user_id", test_user_id).execute().data
    )

    context = _chat("Thank you, that's all for today!")

    pipeline_result, reply = await _run_chat(test_user_id, context)

    # DB: no new rows
    after_invoices = len(
        supabase.table("invoices").select("id").eq("user_id", test_user_id).execute().data
    )
    after_projects = len(
        supabase.table("projects").select("id").eq("user_id", test_user_id).execute().data
    )
    assert after_invoices == before_invoices
    assert after_projects == before_projects

    # LLM judge
    assert await _llm_judge(
        "User sent a thank-you note with no actionable request",
        reply,
        "is a polite acknowledgement with no mention of invoices or projects being created",
    )


@pytest.mark.asyncio
async def test_email_channel(tag, invoice_ids, monkeypatch):
    """T16 — Full email channel: invoice created from attachment, reply sent."""
    # Upload via store_attachment (same code path as real email channel)
    pdf_path = SAMPLE_DIR / "sample_invoice_1.pdf"
    attachment_path = store_attachment(
        USER_ID,
        "sample_invoice_1.pdf",
        pdf_path.read_bytes(),
    )

    # Ensure the test user has an inbox_id set (create_action_tools reads it at factory time)
    original_inbox = (
        supabase.table("user_settings")
        .select("agentmail_inbox")
        .eq("id", USER_ID)
        .maybe_single()
        .execute()
    )
    original_inbox_val = original_inbox.data.get("agentmail_inbox") if original_inbox.data else None
    if not original_inbox_val:
        supabase.table("user_settings").update(
            {"agentmail_inbox": "test-inbox-fake"}
        ).eq("id", USER_ID).execute()

    # Monkeypatch agentmail_post so no real API call is made
    sent_calls = []
    import app.agents.tools.action_tools as _at
    monkeypatch.setattr(
        _at,
        "agentmail_post",
        lambda path, payload: (
            sent_calls.append({"path": path, "payload": payload})
            or {"message_id": "test-reply-001", "thread_id": "test-thread-001"}
        ),
    )

    context = _email(
        sender="vendor@example.com",
        subject=f"Invoice {tag}",
        body=f"Please find our invoice {tag} attached. Total €154.06 USD.",
        attachments=[attachment_path],
    )

    pipeline_result, reply_result = await _run_email(USER_ID, context)

    # DB assertion — invoice created (find by document_path)
    rows = (
        supabase.table("invoices")
        .select("*")
        .eq("user_id", USER_ID)
        .eq("document_path", attachment_path)
        .execute()
    ).data
    if not rows:
        rows = (
            supabase.table("invoices")
            .select("*")
            .eq("user_id", USER_ID)
            .ilike("document_path", f"%{attachment_path.split('/')[-1]}%")
            .execute()
        ).data

    assert rows, "Expected invoice to be created from email attachment"
    invoice_ids.append(rows[0]["id"])

    # send_reply was called
    assert reply_result["sent"], "Expected send_reply to be called"
    assert sent_calls, "Expected agentmail_post to be invoked"

    # LLM judge on reply text
    assert await _llm_judge(
        "Vendor emailed an invoice attachment",
        reply_result["reply"],
        "acknowledges receipt of the invoice",
    )

    # Restore original inbox value if we changed it
    if not original_inbox_val:
        supabase.table("user_settings").update(
            {"agentmail_inbox": None}
        ).eq("id", USER_ID).execute()

    # Cleanup storage
    try:
        supabase.storage.from_("invoices-bucket").remove([attachment_path])
    except Exception:
        pass
