# app/routes/extract.py
#
# Endpoints for invoice data extraction with deterministic vendor-based assignment.

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import require_auth
from app.agents.config import supabase
from app.agents.tools.action_tools import create_action_tools

router = APIRouter(prefix="/extract", tags=["extract"])
log = logging.getLogger(__name__)


class ExtractRequest(BaseModel):
    attachment_path: str


@router.post("")
async def extract_invoice(body: ExtractRequest, user: dict = Depends(require_auth)):
    """Run invoice extraction on a file already in Supabase Storage.

    Returns the extracted fields plus any vendor-mapped project/category.
    Single LLM call for extraction, then deterministic DB lookup for assignment.
    """
    user_id = user["id"]
    tools = create_action_tools(user_id)
    tool_map = {t.name: t for t in tools}

    result = tool_map["extract_invoice_data"].invoke({
        "attachment_path": body.attachment_path,
    })

    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    # Deterministic vendor lookup for auto-assignment
    vendor_name = result.get("vendor_name") if isinstance(result, dict) else None
    if vendor_name:
        try:
            mapping = (
                supabase.table("vendor_mappings")
                .select("project_id, category_id")
                .eq("user_id", user_id)
                .eq("vendor_name", vendor_name)
                .maybe_single()
                .execute()
            )
            if mapping.data:
                result["suggested_project_id"] = mapping.data.get("project_id")
                result["suggested_category_id"] = mapping.data.get("category_id")
        except Exception:
            log.debug("Vendor mapping lookup failed for %s", vendor_name)

    return result
