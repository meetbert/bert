# app/routes/chat.py
#
# Thin FastAPI routes for chat. Delegates to agents/bert_chat.

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.deps import get_current_user
from app.agents.bert_chat import preprocess_chat, process_chat


class ChatResponse:
    response: str


router = APIRouter(prefix="/chat", tags=["chat"])
log = logging.getLogger(__name__)


@router.post("")
async def chat(
    message: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user=Depends(get_current_user),
):
    """Chat with Bert — text-only or with a file attachment."""
    try:
        file_bytes = None
        filename = None
        if file:
            file_bytes = await file.read()
            filename = file.filename or "upload"

        preprocessed = preprocess_chat(
            user_id=user["id"],
            message=message,
            filename=filename,
            file_bytes=file_bytes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build user-facing content for message persistence
    user_content = message
    if filename:
        user_content = filename + (f' — "{message}"' if message.strip() else "")

    result = await process_chat(
        user_id=preprocessed["user_id"],
        context=preprocessed["context"],
        user_content=user_content,
        attachment_path=preprocessed.get("attachment_path"),
    )
    return {"response": result["reply"]}
