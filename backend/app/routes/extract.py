# app/routes/extract.py
#
# Endpoints for invoice data extraction and full agent processing.

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import require_auth
from app.agents.tools.action_tools import create_action_tools
from app.agents.subagents.invoice_agent import run_invoice_agent

router = APIRouter(prefix="/extract", tags=["extract"])
log = logging.getLogger(__name__)


class ExtractRequest(BaseModel):
    attachment_path: str


class ProcessRequest(BaseModel):
    attachment_path: str


@router.post("")
async def extract_invoice(body: ExtractRequest, user: dict = Depends(require_auth)):
    """Run invoice extraction on a file already in Supabase Storage.

    Returns the extracted fields (vendor, date, total, …) without inserting
    anything — the frontend handles the insert via RLS.
    """
    tools = create_action_tools(user["id"])
    tool_map = {t.name: t for t in tools}

    result = tool_map["extract_invoice_data"].invoke({
        "attachment_path": body.attachment_path,
    })

    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    return result


@router.post("/process")
async def process_invoice(body: ProcessRequest, user: dict = Depends(require_auth)):
    """Run the full invoice agent: extract, deduplicate, create, and auto-assign.

    Returns the created invoice data including project_id and category_id
    if the agent was confident enough to assign them.
    """
    user_id = user["id"]

    context = (
        f"Source: frontend_upload\n"
        f"Attachment: {body.attachment_path}\n"
        f"Sender: user (direct upload via UI)\n"
        f"Subject: Manual invoice upload\n"
        f"Body: User uploaded an invoice file via the import modal.\n"
        f"Attachments:\n  [0] {body.attachment_path}\n"
        f"Thread ID: upload-{body.attachment_path}\n"
        f"Message ID: upload-{body.attachment_path}\n"
        f"Linked invoices: none\n"
    )

    task_instruction = (
        "Process new invoice from attachment 0. "
        "Extract data, check for duplicates, create the invoice record, "
        "and assign to the correct project and category if confident."
    )

    try:
        result = await run_invoice_agent(
            user_id=user_id,
            task_instruction=task_instruction,
            email_context=context,
        )
    except Exception as e:
        log.exception("Invoice agent failed for %s", body.attachment_path)
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

    return {
        "summary": result.get("summary"),
        "invoice_id": result.get("invoice_id"),
        "follow_up_state": result.get("follow_up_state"),
    }
