"""Project Agent subagent (Layer 2) — create and update projects.

Handles project_management tasks: creating projects, updating budgets,
changing status, and updating project details.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

from app.agents.config import get_llm
from app.agents.prompts.project_agent_prompt import PROJECT_AGENT_SYSTEM
from app.agents.tools.action_tools import create_action_tools
from app.agents.tools.get_tools import create_get_tools


PROJECT_AGENT_TOOLS = {
    "get_projects", "get_categories",
    "create_project", "update_project",
}
_MAX_ITERATIONS = 10


def _select_tools(user_id: str) -> list:
    """Return the project agent's tools from both factories."""
    all_tools = create_get_tools(user_id) + create_action_tools(user_id)
    return [t for t in all_tools if t.name in PROJECT_AGENT_TOOLS]


@traceable(name="project_agent")
async def run_project_agent(
    user_id: str,
    task_instruction: str,
    context: str,
) -> dict:
    """Process a single project_management task.

    Args:
        user_id: Authenticated user UUID (scopes tool access).
        task_instruction: What to do, from the classifier
            (e.g. "Create a new project called Brighton Shoot with £25k budget").
        context: Full pre-formatted context string (email or chat).

    Returns:
        Dict with:
        - ``summary``: Natural-language description of what was done.
    """
    tools = _select_tools(user_id)
    tool_map = {t.name: t for t in tools}
    llm = get_llm().bind_tools(tools)

    messages = [
        SystemMessage(content=PROJECT_AGENT_SYSTEM),
        HumanMessage(
            content=f"Task: {task_instruction}\n\nContext:\n{context}"
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
