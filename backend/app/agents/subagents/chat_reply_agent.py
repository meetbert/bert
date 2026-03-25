"""Chat reply subagent (Layer 3) — summarize task results for chat UI.

Takes task results from the pipeline and produces a concise,
chat-friendly summary. No email sending — just text output.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

from app.agents.config import get_llm
from app.agents.prompts.chat_reply_prompt import CHAT_REPLY_SYSTEM
from app.agents.tools.action_tools import create_action_tools
from app.agents.tools.get_tools import create_get_tools


CHAT_REPLY_TOOLS = {
    # Read tools
    "get_invoice",
    "get_invoices_by_vendor",
    "search_invoices",
    "get_invoices_by_project",
    "get_vendor_summary",
    "get_spend_summary",
    "get_due_soon",
    "get_project_spend",
    "get_projects",
    "get_categories",
    # Write tools
    "update_invoice",
    "assign_invoice",
    "bulk_update_invoices",
    "delete_invoice",
    "create_project",
    "update_project",
    "set_vendor_mapping",
    "send_chaser",
}
_MAX_ITERATIONS = 12


def _select_tools(user_id: str) -> list:
    """Return tools for answering questions and handling chat commands."""
    all_tools = create_get_tools(user_id) + create_action_tools(user_id)
    return [t for t in all_tools if t.name in CHAT_REPLY_TOOLS]


@traceable(name="chat_reply_agent")
async def run_chat_reply_agent(
    user_id: str,
    task_results: str,
    context: str,
) -> dict:
    """Summarize pipeline results as a chat message, or answer questions.

    Args:
        user_id: Authenticated user UUID (scopes tool access).
        task_results: Combined summaries from all invoice agent runs.
        context: The original chat context (user message, attachments, history).

    Returns:
        Dict with ``reply`` (the chat message text).
    """
    tools = _select_tools(user_id)
    tool_map = {t.name: t for t in tools}
    llm = get_llm().bind_tools(tools) if tools else get_llm()

    human_message = (
        f"Task results:\n{task_results}\n\n"
        f"Upload context:\n{context}"
    )

    messages = [
        SystemMessage(content=CHAT_REPLY_SYSTEM),
        HumanMessage(content=human_message),
    ]

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

    return {"reply": response.content}
