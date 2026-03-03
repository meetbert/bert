"""Shared pipeline — Classifier → Task Loop (Layers 1-2).

Source-agnostic: receives a context string and returns structured results.
Layer 3 (reply) is handled by the caller (email or chat channel).
"""

import hashlib
import logging

from langsmith import traceable

from app.agents.config import supabase
from app.agents.subagents.classifier import run_classifier
from app.agents.subagents.invoice_agent import run_invoice_agent

logger = logging.getLogger("bert.pipeline")

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def store_attachment(user_id: str, filename: str, file_bytes: bytes) -> str:
    """Upload attachment to Supabase Storage, return the storage path."""
    file_hash = hashlib.sha256(file_bytes).hexdigest()[:12]
    safe_name = filename.replace(" ", "_")
    storage_path = f"{user_id}/unassigned/{file_hash}_{safe_name}"

    bucket = supabase.storage.from_("invoices-bucket")
    try:
        bucket.upload(storage_path, file_bytes, {"content-type": "application/octet-stream"})
    except Exception:
        # File may already exist (same hash) — that's fine
        pass
    return storage_path


# ---------------------------------------------------------------------------
# Pipeline (Layers 1-2)
# ---------------------------------------------------------------------------

@traceable(name="pipeline")
async def run_pipeline(user_id: str, context: str) -> dict:
    """Run the core pipeline: Classifier → Task Loop.

    Layer 1: Classifier — triage context into tasks.
    Layer 2: Task loop — run each task through its agent.

    Returns dict with tasks, task_results, and follow_up_states.
    """
    tasks = await run_classifier(user_id, context)
    logger.info("Classifier produced %d tasks", len(tasks))

    if not tasks:
        return {"tasks": [], "task_results": [], "follow_up_states": []}

    task_results = []
    follow_up_states = []

    for task in tasks:
        if task["type"] == "invoice_management":
            result = await run_invoice_agent(
                user_id=user_id,
                task_instruction=task["instruction"],
                email_context=context,
            )
            task_results.append(result["summary"])
            if result.get("follow_up_state"):
                follow_up_states.append(str(result["follow_up_state"]))

        elif task["type"] in ("project_management", "question"):
            task_results.append(
                f"[{task['type']}] Not yet implemented: {task['instruction']}"
            )
            logger.info("Skipping post-MVP task type: %s", task["type"])

    return {
        "tasks": tasks,
        "task_results": task_results,
        "follow_up_states": follow_up_states,
    }
