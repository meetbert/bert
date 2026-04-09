# app/routes/chat.py
#
# Thin FastAPI routes for chat. Delegates to agents/bert_chat.

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.deps import get_current_user
from app.agents.bert_chat import preprocess_chat, process_chat


class ChatResponse:
    response: str


limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/chat", tags=["chat"])
log = logging.getLogger(__name__)


@router.post("")
@limiter.limit("20/minute")
async def chat(
    request: Request,
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

    # Store just the message text; attachment_path is persisted separately
    user_content = message

    result = await process_chat(
        user_id=preprocessed["user_id"],
        context=preprocessed["context"],
        user_content=user_content,
        attachment_path=preprocessed.get("attachment_path"),
    )
    return {"response": result["reply"]}
