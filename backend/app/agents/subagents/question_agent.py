"""Question Agent subagent (Layer 2) — answer data questions.

Handles question tasks: spend summaries, budget vs actual, vendor history,
due invoices, outstanding amounts. Read-only — never modifies data.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

from app.agents.config import get_llm
from app.agents.prompts.question_agent_prompt import QUESTION_AGENT_SYSTEM
from app.agents.tools.get_tools import create_get_tools


QUESTION_AGENT_TOOLS = {
    "get_invoice", "search_invoices",
    "get_vendor_summary", "get_spend_summary",
    "get_due_soon", "get_project_spend", "get_projects", "get_categories",
}
_MAX_ITERATIONS = 10


def _select_tools(user_id: str) -> list:
    """Return the question agent's read-only tools."""
    all_tools = create_get_tools(user_id)
    return [t for t in all_tools if t.name in QUESTION_AGENT_TOOLS]


@traceable(name="question_agent")
async def run_question_agent(
    user_id: str,
    task_instruction: str,
    context: str,
) -> dict:
    """Answer a data question by querying the database.

    Args:
        user_id: Authenticated user UUID (scopes tool access).
        task_instruction: What to answer, from the classifier
            (e.g. "What is the total spend last month?").
        context: Full pre-formatted context string (email or chat).

    Returns:
        Dict with:
        - ``summary``: Natural-language answer to the question.
    """
    tools = _select_tools(user_id)
    tool_map = {t.name: t for t in tools}
    llm = get_llm().bind_tools(tools)

    messages = [
        SystemMessage(content=QUESTION_AGENT_SYSTEM),
        HumanMessage(
            content=f"Question: {task_instruction}\n\nContext:\n{context}"
        ),
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

    return {"summary": response.content}
