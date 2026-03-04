# app/routes/projects.py
#
# Project-level utilities: extract project context from uploaded documents.

import base64
import logging
import os

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
You are a project context extractor for a production accounting system. \
A user has uploaded a document to their project (brief, budget sheet, script, contract, etc.).

Extract and summarise the key information that would help an invoice processing AI \
understand what this project is about. Focus on:
- Project type or nature (e.g. short film, commercial, music video, corporate event)
- Scope and objectives
- Key vendors, crew, or contractors mentioned
- Budget figures or ranges
- Filming locations, schedule, or timeline
- Any other context relevant for matching invoices to this project

Write a concise, factual summary in 3–6 plain English sentences. \
No bullet points, no headings, no markdown."""


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

    return {"description": text.strip()}
