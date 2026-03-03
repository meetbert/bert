# app/webhook.py
#
# Thin FastAPI route for inbound AgentMail webhooks.
# Delegates all logic to agents/bert_email.

import asyncio
import logging

from fastapi import APIRouter, Request, Response

from app.agents.bert_email import preprocess, process_email

router = APIRouter()
log = logging.getLogger(__name__)


@router.post("/webhook/agentmail")
async def handle_webhook(request: Request):
    """Handle inbound AgentMail webhook events.

    Returns 200 immediately and processes the pipeline in the background
    so AgentMail doesn't time out and retry.
    """
    payload = await request.json()

    event_type = payload.get("event_type")
    if event_type != "message.received":
        return Response(status_code=200)

    context = preprocess(payload)
    if not context:
        return Response(status_code=200)

    asyncio.create_task(process_email(context))
    return {"status": "accepted"}
