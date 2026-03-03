"""Bert email channel — preprocessing + orchestration.

Handles AgentMail webhook payloads: resolves user, downloads attachments,
builds email context, runs the shared pipeline, and sends a reply via
the email reply agent.
"""

import asyncio
import logging

import httpx
from langsmith import traceable

from app.agents.config import supabase, AGENTMAIL_API_KEY, AGENTMAIL_BASE_URL
from app.agents.pipeline import run_pipeline, store_attachment
from app.agents.subagents.email_reply_agent import run_email_reply_agent

logger = logging.getLogger("bert.email")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_user_id(inbox_id: str) -> str | None:
    """Look up user_id from the inbox address in user_settings."""
    result = (
        supabase.table("user_settings")
        .select("id")
        .eq("agentmail_inbox", inbox_id)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    return None


def _download_attachment(inbox_id: str, message_id: str, attachment_id: str) -> bytes:
    """Download raw attachment bytes from AgentMail."""
    meta_url = f"{AGENTMAIL_BASE_URL}/inboxes/{inbox_id}/messages/{message_id}/attachments/{attachment_id}"
    meta = httpx.get(
        meta_url,
        headers={"Authorization": f"Bearer {AGENTMAIL_API_KEY}"},
        timeout=15,
    )
    meta.raise_for_status()
    download_url = meta.json().get("download_url")
    if not download_url:
        raise ValueError("No download_url in attachment metadata")

    r = httpx.get(download_url, timeout=30)
    r.raise_for_status()
    return r.content


def _get_linked_invoices(thread_id: str) -> list[dict]:
    """Look up invoices linked to this AgentMail thread."""
    links = (
        supabase.table("invoice_threads")
        .select("invoice_id")
        .eq("thread_id", thread_id)
        .execute()
    )
    if not links.data:
        return []

    invoice_ids = [link["invoice_id"] for link in links.data]
    invoices = (
        supabase.table("invoices")
        .select("id, vendor_name, total, invoice_date, currency, invoice_number, processing_status")
        .in_("id", invoice_ids)
        .execute()
    )
    return invoices.data or []


def _build_email_context(
    sender: str,
    subject: str,
    body: str,
    attachment_paths: list[str],
    thread_id: str,
    message_id: str,
    linked_invoices: list[dict],
) -> str:
    """Build the email context string that all agents receive."""
    return (
        f"From: {sender}\n"
        f"Subject: {subject}\n"
        f"Body: {body}\n"
        f"Attachments: {attachment_paths}\n"
        f"Thread ID: {thread_id}\n"
        f"Message ID: {message_id}\n"
        f"Linked invoices: {linked_invoices}"
    )


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def preprocess(payload: dict) -> dict | None:
    """Deterministic preprocessing of the webhook payload.

    Returns a dict with user_id, email_context, and metadata,
    or None if the payload should be skipped.
    """
    message = payload.get("message", {})
    inbox_id = message.get("inbox_id")
    if not inbox_id:
        logger.warning("No inbox_id in webhook payload")
        return None

    user_id = _resolve_user_id(inbox_id)
    if not user_id:
        logger.warning("No user found for inbox %s", inbox_id)
        return None

    thread_id = message.get("thread_id", "")
    message_id = message.get("message_id", "")
    sender = message.get("from", "")
    subject = message.get("subject", "")
    body = message.get("text", "")

    ALLOWED_CONTENT_TYPES = {
        "application/pdf", "image/jpeg", "image/png", "image/webp",
    }
    attachment_paths = []
    for att in message.get("attachments", []):
        att_id = att.get("attachment_id")
        filename = att.get("filename", "attachment")
        content_type = att.get("content_type", "")
        disposition = att.get("content_disposition", "")

        if disposition == "inline":
            continue
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            continue

        if att_id:
            try:
                file_bytes = _download_attachment(inbox_id, message_id, att_id)
                path = store_attachment(user_id, filename, file_bytes)
                attachment_paths.append(path)
            except Exception as e:
                logger.error("Failed to download attachment %s: %s", att_id, e)

    linked_invoices = _get_linked_invoices(thread_id) if thread_id else []

    email_context = _build_email_context(
        sender=sender,
        subject=subject,
        body=body,
        attachment_paths=attachment_paths,
        thread_id=thread_id,
        message_id=message_id,
        linked_invoices=linked_invoices,
    )

    return {
        "user_id": user_id,
        "email_context": email_context,
        "message_id": message_id,
        "sender": sender,
    }


# ---------------------------------------------------------------------------
# Orchestration (pipeline + Layer 3 reply)
# ---------------------------------------------------------------------------

@traceable(name="process_email")
async def process_email(context: dict):
    """Run pipeline + email reply agent for a preprocessed email."""
    result = await run_pipeline(
        user_id=context["user_id"],
        context=context["email_context"],
    )
    logger.info("Pipeline complete: %d tasks", len(result["tasks"]))

    # Layer 3: Email reply
    if result["task_results"]:
        results_str = "\n".join(f"- {r}" for r in result["task_results"])
        follow_up_str = (
            "\n".join(f"- {f}" for f in result["follow_up_states"])
            if result["follow_up_states"]
            else "None"
        )

        reply_result = await run_email_reply_agent(
            user_id=context["user_id"],
            task_results=results_str,
            follow_up_states=follow_up_str,
            email_context=context["email_context"],
        )
        logger.info("Email reply sent=%s", reply_result.get("sent", False))
