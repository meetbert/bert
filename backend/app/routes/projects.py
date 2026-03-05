# app/routes/projects.py
#
# Project-level utilities: extract project context from uploaded documents.

import base64
import json
import logging
import os
import re

import anthropic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.deps import require_auth

router = APIRouter(prefix="/projects", tags=["projects"])
log = logging.getLogger(__name__)

_MIME_TYPES = {
    ".pdf":  "application/pdf",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
}

_CONTEXT_SYSTEM = """\
You are a project context extractor for a production accounting system.
A user has uploaded a document (brief, budget sheet, script, contract, etc.) to seed a new project.

Return ONLY a raw JSON object — no markdown, no code fences, no preamble — with exactly these four keys:

{
  "name": "<production / project / film title if clearly stated, otherwise null>",
  "description": "<1-2 sentences in plain English summarising what this project is. Do NOT include lists, JSON, or structured data.>",
  "known_vendors": ["<vendor name>", "<supplier name>", "<service company>"],
  "known_locations": ["<filming location>", "<studio name>", "<city or venue>"]
}

Rules:
- "name": string or null. Extract the official title from the document.
- "description": 1-2 sentences only. Concise natural-language summary of the project type, purpose, and scope. Never paste raw data or lists here.
- "known_vendors": array of up to 10 strings — company, crew, or contractor names found in the document. Empty array if none found.
- "known_locations": array of up to 10 strings — filming locations, studios, venues, or cities. Empty array if none found.
- Output ONLY the JSON object. No ```json fences. No explanation. No extra keys."""


@router.post("/extract-context")
async def extract_project_context(
    file: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
    """Upload a project document and return an LLM-generated project description."""
    filename = file.filename or ""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    mime_type = _MIME_TYPES.get(ext)

    if not mime_type:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {ext or 'unknown'}")

    file_bytes = await file.read()
    log.info("extract-context: received %s (%d bytes) for user %s", filename, len(file_bytes), user["id"])

    b64_data = base64.b64encode(file_bytes).decode()

    if mime_type == "application/pdf":
        content_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": mime_type, "data": b64_data},
        }
    else:
        content_block = {
            "type": "image",
            "source": {"type": "base64", "media_type": mime_type, "data": b64_data},
        }

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_CONTEXT_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        content_block,
                        {"type": "text", "text": "Extract the project context from this document."},
                    ],
                }
            ],
        )
        text = response.content[0].text if response.content else ""
        log.info("extract-context: extracted %d chars", len(text))
    except anthropic.BadRequestError as e:
        log.error("extract-context: bad request (possibly encrypted/corrupt PDF): %s", e)
        raise HTTPException(status_code=422, detail="Could not read the document. Make sure it is a readable PDF or image.")
    except Exception as e:
        log.error("extract-context: failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")

    # Strip markdown code fences the LLM may have added despite instructions
    text_clean = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    text_clean = re.sub(r"\s*```$", "", text_clean).strip()

    try:
        data = json.loads(text_clean)
        name = data.get("name")
        description = (data.get("description") or "").strip()
        vendors  = [v for v in (data.get("known_vendors")   or []) if isinstance(v, str) and v.strip()]
        locations = [l for l in (data.get("known_locations") or []) if isinstance(l, str) and l.strip()]
        log.info("extract-context: name=%r desc_len=%d vendors=%d locations=%d",
                 name, len(description), len(vendors), len(locations))
        return {
            "name":            name or None,
            "description":     description,
            "known_vendors":   vendors,
            "known_locations": locations,
        }
    except (json.JSONDecodeError, AttributeError) as exc:
        log.error("extract-context: could not parse JSON response (%s). Raw: %s", exc, text_clean[:300])
        # Return empty fields — do not dump raw JSON/text into the description field
        return {"name": None, "description": "", "known_vendors": [], "known_locations": []}
