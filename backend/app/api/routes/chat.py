# app/api/routes/chat.py
#
# Placeholder chat endpoint.
# Will be replaced with a LangGraph agent once the graph is implemented
# in app/langgraph/.
#
# TODO: Wire up LangGraph:
#   1. Build your graph in app/langgraph/graph.py
#   2. Import and invoke the compiled graph here
#   3. Stream tokens back using StreamingResponse if desired

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.models.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])
log    = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    _user = Depends(get_current_user),
):
    """
    Chat endpoint — currently returns a placeholder response.

    TODO: Replace the stub below with a LangGraph invocation, e.g.:

        from app.langgraph.graph import compiled_graph

        result = await compiled_graph.ainvoke({"message": body.message})
        return ChatResponse(response=result["response"])
    """
    log.info("Chat message received (placeholder): %s", body.message[:80])

    # ── Placeholder response ──────────────────────────────────────────────────
    return ChatResponse(
        response=(
            "Hi! I'm Bert, your invoice assistant. "
            "LangGraph integration is coming soon — "
            "I'll be able to answer questions about your invoices, "
            "projects, and spending once it's wired up."
        )
    )
