"""Classifier subagent (Layer 1) — email triage into task list.

Reads an inbound email and produces an ordered list of typed tasks
for downstream agents (invoice, project, question).
"""

import json
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

from app.agents.config import get_llm
from app.agents.prompts.classifier_prompt import CLASSIFIER_SYSTEM
from app.agents.tools.action_tools import create_action_tools


CLASSIFIER_TOOLS = {
    "create_or_update_contact",
}
VALID_TASK_TYPES = {"invoice_management", "project_management", "question"}
_MAX_ITERATIONS = 10


def _select_tools(user_id: str) -> list:
    """Return the classifier's tools."""
    all_tools = create_action_tools(user_id)
    return [t for t in all_tools if t.name in CLASSIFIER_TOOLS]


def _parse_tasks(text) -> list[dict]:
    """Extract the JSON task array from the LLM's final response.

    Handles JSON wrapped in ```json code fences or bare JSON.
    Returns an empty list if parsing fails or no tasks found.
    """
    # Newer LangChain/Claude may return content as a list of blocks
    if isinstance(text, list):
        text = " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in text
        )

    # Try code-fenced JSON first
    match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    if match:
        raw = match.group(1)
    else:
        # Try bare JSON array
        match = re.search(r"\[.*\]", text, re.DOTALL)
        raw = match.group(0) if match else None

    if not raw:
        return []

    try:
        tasks = json.loads(raw)
    except json.JSONDecodeError:
        return []

    # Keep only well-formed tasks
    return [
        t for t in tasks
        if isinstance(t, dict)
        and t.get("type") in VALID_TASK_TYPES
        and isinstance(t.get("instruction"), str)
    ]


@traceable(name="classifier")
async def run_classifier(user_id: str, email_context: str) -> list[dict]:
    """Classify an inbound email into an ordered task list.

    Args:
        user_id: Authenticated user UUID (scopes tool access).
        email_context: Pre-formatted email string containing sender,
            subject, body, attachments, and linked invoices.

    Returns:
        Ordered list of task dicts, each with ``type``
        (``"invoice_management"``, ``"project_management"``,
        ``"question"``) and ``instruction`` keys.
        Returns ``[]`` if no actionable items are found.
    """
    tools = _select_tools(user_id)
    # Contact tool requires an email address — not available in chat contexts
    if email_context.strip().startswith("Source: Chat"):
        tools = [t for t in tools if t.name != "create_or_update_contact"]
    tool_map = {t.name: t for t in tools}
    llm = get_llm().bind_tools(tools)

    messages = [
        SystemMessage(content=CLASSIFIER_SYSTEM),
        HumanMessage(content=email_context),
    ]

    tasks = []
    for _ in range(_MAX_ITERATIONS):
        response: AIMessage = await llm.ainvoke(messages)
        messages.append(response)

        parsed = _parse_tasks(response.content)
        if parsed:
            tasks = parsed

        if not response.tool_calls:
            break

        for tc in response.tool_calls:
            result = await tool_map[tc["name"]].ainvoke(tc["args"])
            messages.append(
                ToolMessage(content=str(result), tool_call_id=tc["id"])
            )

    return tasks
