# app/routes/extract.py
#
# Thin endpoint for invoice data extraction.
# Reuses the existing extract_invoice_data agent tool so the LLM logic
# lives in exactly one place.

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import require_auth
from app.agents.tools.action_tools import create_action_tools

router = APIRouter(prefix="/extract", tags=["extract"])
log = logging.getLogger(__name__)


class ExtractRequest(BaseModel):
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
