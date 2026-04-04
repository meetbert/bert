"""Agent prompt templates."""

from app.agents.prompts.classifier_prompt import CLASSIFIER_SYSTEM
from app.agents.prompts.invoice_agent_prompt import INVOICE_AGENT_SYSTEM
from app.agents.prompts.project_agent_prompt import PROJECT_AGENT_SYSTEM
from app.agents.prompts.question_agent_prompt import QUESTION_AGENT_SYSTEM
from app.agents.prompts.email_reply_prompt import REPLY_SYSTEM
from app.agents.prompts.chat_reply_prompt import CHAT_REPLY_SYSTEM

__all__ = [
    "CLASSIFIER_SYSTEM",
    "INVOICE_AGENT_SYSTEM",
    "PROJECT_AGENT_SYSTEM",
    "QUESTION_AGENT_SYSTEM",
    "REPLY_SYSTEM",
    "CHAT_REPLY_SYSTEM",
]
