"""Email reply subagent (Layer 3) — draft and send email reply.

Combines task results and follow-up states into a single reply and
sends it via AgentMail. Single LLM call to draft, then send_reply
to dispatch — follow-up tracking is handled atomically inside send_reply
when invoice_ids_with_follow_up is passed.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

from app.agents.config import get_llm
from app.agents.prompts.email_reply_prompt import REPLY_SYSTEM
from app.agents.tools.action_tools import create_action_tools


REPLY_TOOL_NAMES = {"send_reply"}
_MAX_ITERATIONS = 5


def _select_tools(user_id: str) -> list:
    """Return only send_reply."""
    all_tools = create_action_tools(user_id)
    return [t for t in all_tools if t.name in REPLY_TOOL_NAMES]


@traceable(name="email_reply_agent")
async def run_email_reply_agent(
    user_id: str,
    task_results: str,
    follow_up_states: str,
    email_context: str,
) -> dict:
    """Draft and send a reply email based on task results.

    Args:
        user_id: Authenticated user UUID (scopes tool access).
        task_results: Combined summaries from all Layer 2 agent runs.
        follow_up_states: Output of get_follow_up_state for each invoice.
            The LLM uses this to pass invoice_ids_with_follow_up to send_reply,
            which atomically updates follow_up_count and last_followed_up_at.
        email_context: Original email metadata (sender, subject, body, thread).

    Returns:
        Dict with ``reply`` (the drafted email text) and
        ``sent`` (whether send_reply was called successfully).
    """
    tools = _select_tools(user_id)
    tool_map = {t.name: t for t in tools}
    llm = get_llm().bind_tools(tools)

    human_message = (
        f"Task results:\n{task_results}\n\n"
        f"Follow-up states:\n{follow_up_states}\n\n"
        f"Original email:\n{email_context}"
    )

    messages = [
        SystemMessage(content=REPLY_SYSTEM),
        HumanMessage(content=human_message),
    ]

    sent = False
    reply_text = ""

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
            if tc["name"] == "send_reply":
                reply_text = tc["args"].get("body", "")
                if "error" not in result:
                    sent = True

    return {"reply": reply_text, "sent": sent}
