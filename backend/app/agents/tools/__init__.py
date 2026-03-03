"""Tool factory — creates all tools scoped to a user.

Usage:
    from tools import create_tools
    tools = create_tools(user_id)
"""

from app.agents.tools.get_tools import create_get_tools
from app.agents.tools.action_tools import create_action_tools


def create_tools(user_id: str) -> list:
    """Create all tools (get + action) with user_id baked in.

    Args:
        user_id: UUID of the authenticated user.

    Returns:
        Combined list of all LangChain @tool-decorated functions.
    """
    return create_get_tools(user_id) + create_action_tools(user_id)
