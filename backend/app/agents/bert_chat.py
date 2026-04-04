"""Bert chat channel — preprocessing + orchestration.

Handles chat messages (text-only or with file uploads): validates files,
stores attachments, builds chat context with conversation history,
runs the shared pipeline, and returns a chat-friendly reply.
"""

import logging
import os
from datetime import date

from langsmith import traceable

from app.agents.config import supabase
from app.agents.pipeline import ALLOWED_EXTENSIONS, run_pipeline, store_attachment
from app.agents.subagents.chat_reply_agent import run_chat_reply_agent

logger = logging.getLogger("bert.chat")

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
HISTORY_LIMIT = 20  # last N messages included in pipeline context


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fetch_history(user_id: str, limit: int = HISTORY_LIMIT) -> list[dict]:
    """Fetch the most recent chat messages for this user."""
    result = (
        supabase.table("chat_messages")
        .select("role, content, attachment_path, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    rows.reverse()  # oldest first
    return rows


def _save_message(
    user_id: str, role: str, content: str, attachment_path: str | None = None,
) -> None:
    """Insert a chat message into the database."""
    row = {"user_id": user_id, "role": role, "content": content}
    if attachment_path:
        row["attachment_path"] = attachment_path
    supabase.table("chat_messages").insert(row).execute()


def _build_chat_context(
    message: str,
    attachment_paths: list[str],
    history: list[dict],
) -> str:
    """Build the chat context string for the pipeline."""
    parts = [f"Source: Chat\nToday's date: {date.today().isoformat()}"]

    if history:
        lines = []
        for msg in history:
            prefix = "[user]" if msg["role"] == "user" else "[assistant]"
            line = f"{prefix}: {msg['content']}"
            if msg.get("attachment_path"):
                line += f" [attachment: {msg['attachment_path']}]"
            lines.append(line)
        parts.append("Chat history:\n" + "\n".join(lines))

    parts.append(f"User message: {message}")
    parts.append(f"Attachments: {attachment_paths}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def preprocess_chat(
    user_id: str,
    message: str = "",
    filename: str | None = None,
    file_bytes: bytes | None = None,
) -> dict:
    """Preprocess a chat message (text-only or with file).

    If filename/file_bytes are provided, validates and stores the file.
    Fetches conversation history and builds the context string.
    Returns a dict with user_id, context, and attachment_path.
    Raises ValueError on file validation failure.
    """
    attachment_paths: list[str] = []
    attachment_path: str | None = None

    if filename and file_bytes:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type: {ext}. Accepted: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        if len(file_bytes) > MAX_FILE_SIZE:
            raise ValueError("File too large (max 20 MB).")

        attachment_path = store_attachment(user_id, filename, file_bytes)
        attachment_paths.append(attachment_path)

    history = _fetch_history(user_id)

    context = _build_chat_context(
        message=message,
        attachment_paths=attachment_paths,
        history=history,
    )

    return {
        "user_id": user_id,
        "context": context,
        "attachment_path": attachment_path,
    }


# ---------------------------------------------------------------------------
# Orchestration (pipeline + Layer 3 reply)
# ---------------------------------------------------------------------------

@traceable(name="process_chat")
async def process_chat(
    user_id: str,
    context: str,
    user_content: str = "",
    attachment_path: str | None = None,
) -> dict:
    """Run pipeline + chat reply agent, then persist messages.

    Returns dict with reply text.
    """
    # Save user message
    if user_content:
        _save_message(user_id, "user", user_content, attachment_path)

    result = await run_pipeline(user_id=user_id, context=context)
    logger.info("Pipeline complete: %d tasks", len(result["tasks"]))

    # Layer 3: Chat reply
    results_str = "\n".join(f"- {r}" for r in result["task_results"])
    if not results_str:
        results_str = "No actionable tasks were identified from the message."

    reply_result = await run_chat_reply_agent(
        user_id=user_id,
        task_results=results_str,
        context=context,
    )

    reply = reply_result["reply"]

    # Save assistant reply
    _save_message(user_id, "assistant", reply)

    return {"reply": reply}
