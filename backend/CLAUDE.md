# BERT Backend

BERT is an AI invoice processing assistant. It receives invoices via email or chat, extracts data, manages projects and categories, and answers spend-related questions — all through a multi-agent pipeline backed by Claude.

## Stack

- **FastAPI** — HTTP layer (`app/routes/`, `app/main.py`)
- **Supabase** — PostgreSQL database + file storage (`app/db.py`, `app/agents/config.py`)
- **LangChain + Claude API** — agent pipeline (`app/agents/`)
- **pytest** — unit, integration, and e2e tests (`app/agents/tests/`)

## Commands

```bash
# Local dev
uvicorn app.main:app --reload

# Tests
pytest app/agents/tests/unit/ -v          # fast, no credentials needed
pytest app/agents/tests/integration/ -v   # real LLM + DB
pytest app/agents/tests/e2e/ -v           # full pipeline
pytest app/agents/tests/ -v               # all
```

## Deployment

Hosted on **Railway**. To deploy: push to `main`, then manually trigger a deploy from the Railway dashboard. Do not deploy automatically.

## Folder Map

```
app/
├── main.py        # FastAPI app, router registration
├── db.py          # Supabase client
├── deps.py        # Auth dependencies (get_current_user, require_auth)
├── routes/        # Thin HTTP handlers — see app/routes/routes.md
└── agents/        # Agent pipeline, tools, prompts, tests — see agents.md
```

## Reference Docs

@app/agents/agents.md
@database.md
@app/routes/routes.md
@app/agents/tests/tests.md

## Doc Maintenance

When you change agent architecture, add/remove tools, modify the DB schema, update routes, or change test patterns — update the relevant doc in the same session.
