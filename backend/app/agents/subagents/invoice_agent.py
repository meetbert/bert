"""Invoice Agent subagent (Layer 2) — extract, create, assign invoices.

Processes a single invoice_management task: new invoices, updates,
corrections. Uses the full tool suite to extract data, check duplicates,
create/update records, assign to projects, and check follow-up state.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

from app.agents.config import get_llm
from app.agents.prompts.invoice_agent_prompt import INVOICE_AGENT_SYSTEM
from app.agents.tools.action_tools import create_action_tools
from app.agents.tools.get_tools import create_get_tools


INVOICE_AGENT_TOOLS = {
    # Get tools
    "get_invoice", "search_invoices",
    "get_projects", "get_categories", "get_project_documents",
    "get_follow_up_state",
    # Action tools
    "extract_invoice_data", "check_duplicate",
    "create_invoice", "update_invoice", "assign_invoice",
    "bulk_update_invoices", "delete_invoice",
    "set_vendor_mapping",
}
_MAX_ITERATIONS = 25


def _select_tools(user_id: str) -> list:
    """Return the invoice agent's tools from both factories."""
    all_tools = create_get_tools(user_id) + create_action_tools(user_id)
    return [t for t in all_tools if t.name in INVOICE_AGENT_TOOLS]


@traceable(name="invoice_agent")
async def run_invoice_agent(
    user_id: str,
    task_instruction: str,
    email_context: str,
) -> dict:
    """Process a single invoice_management task.

    Args:
        user_id: Authenticated user UUID (scopes tool access).
        task_instruction: What to do, from the classifier
            (e.g. "Process new invoice from attachment 0").
        email_context: Full pre-formatted email string containing
            sender, subject, body, attachments, thread history,
            and linked invoices.

    Returns:
        Dict with:
        - ``summary``: Natural-language description of what was done.
        - ``follow_up_state``: Result of get_follow_up_state if called,
          or None if not applicable.
        - ``invoice_id``: ID of the created/updated invoice, or None.
    """
    tools = _select_tools(user_id)
    tool_map = {t.name: t for t in tools}
    llm = get_llm().bind_tools(tools)

    messages = [
        SystemMessage(content=INVOICE_AGENT_SYSTEM),
        HumanMessage(
            content=f"Task: {task_instruction}\n\nEmail context:\n{email_context}"
        ),
    ]

    # Track state from tool calls
    last_follow_up_state = None
    last_invoice_id = None

    for _ in range(_MAX_ITERATIONS):
        response: AIMessage = await llm.ainvoke(messages)
        messages.append(response)

        if not response.tool_calls:
            break

        for tc in response.tool_calls:
            result = await tool_map[tc["name"]].ainvoke(tc["args"])
            messages.append(
                ToolMessage(content=str(result), tool_call_id=tc["id"])
            )

            # Track follow-up state and invoice IDs
            if tc["name"] == "get_follow_up_state" and isinstance(result, dict):
                last_follow_up_state = result
            if tc["name"] in ("create_invoice", "update_invoice") and isinstance(result, dict):
                if result.get("id"):
                    last_invoice_id = result["id"]

    return {
        "summary": response.content,
        "follow_up_state": last_follow_up_state,
        "invoice_id": last_invoice_id,
    }
