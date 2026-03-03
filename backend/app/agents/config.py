import os

import httpx
from langchain_anthropic import ChatAnthropic

# ---------------------------------------------------------------------------
# Supabase — reuse the backend's singleton client
# ---------------------------------------------------------------------------
from app.db import supabase

# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"


def get_llm(
    model: str = DEFAULT_MODEL,
    temperature: float = 0,
    max_tokens: int = 4096,
) -> ChatAnthropic:
    """Create an LLM instance. ANTHROPIC_API_KEY is read from env automatically."""
    return ChatAnthropic(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        max_retries=2,
    )


# ---------------------------------------------------------------------------
# AgentMail
# ---------------------------------------------------------------------------
AGENTMAIL_API_KEY: str = os.environ["AGENTMAIL_API_KEY"]
AGENTMAIL_BASE_URL = "https://api.agentmail.to/v0"


def agentmail_get(path: str) -> dict:
    """GET request to AgentMail API."""
    r = httpx.get(
        f"{AGENTMAIL_BASE_URL}{path}",
        headers={"Authorization": f"Bearer {AGENTMAIL_API_KEY}"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def agentmail_post(path: str, body: dict) -> dict:
    """POST request to AgentMail API."""
    r = httpx.post(
        f"{AGENTMAIL_BASE_URL}{path}",
        headers={"Authorization": f"Bearer {AGENTMAIL_API_KEY}"},
        json=body,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# LangSmith — activated via environment variables:
#   LANGSMITH_TRACING=true
#   LANGSMITH_API_KEY=...
#   LANGSMITH_PROJECT=bert
# No extra code needed; LangChain reads these automatically.
# ---------------------------------------------------------------------------
