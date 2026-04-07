# Routes

Thin HTTP handlers. Routes parse and validate input, delegate to `app/agents/`, and return the result. No business logic here — with one exception noted below.

## Auth

- `deps.py` provides two auth dependencies:
  - `get_current_user` — extracts and returns the JWT user (raises 401 if missing/invalid)
  - `require_auth` — same, used where the alias is clearer
- `user_id` always comes from the verified JWT, never from the request body

## Route Files

| File | Prefix | Description |
|------|--------|-------------|
| `agentmail.py` | `/webhook/agentmail` | Inbound email webhook from AgentMail. Returns 200 immediately and runs the email pipeline in the background (so AgentMail doesn't retry). No auth — webhook is public. |
| `chat.py` | `/chat` | `POST /chat` — text message + optional file upload via `FormData`. Calls `preprocess_chat` then `process_chat`. Returns `{ response: str }`. |
| `extract.py` | `/extract` | `POST /extract` — runs invoice extraction on a file already in Supabase Storage, then does a deterministic vendor mapping lookup. Returns extracted fields + suggested project/category. |
| `projects.py` | `/projects` | `POST /projects/extract-context` — takes an uploaded document and returns LLM-extracted project context (name, description, known vendors, locations). Uses Claude Haiku directly (not the agent pipeline). |

## Exception: Business Logic in `extract.py`

`extract.py` does a direct Supabase vendor mapping lookup after extraction. This is intentional — it's a deterministic DB read that doesn't belong in the agent loop.
