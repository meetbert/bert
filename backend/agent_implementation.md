# BERT Agent Architecture

> Agent pipeline spec. For database schema, see `backend/database.md`.

---

## 1. Email Infrastructure

**Key rule:** The agent ALWAYS sends outbound emails from `clientname@meetbert.uk` (AgentMail). It never sends from the user's personal/work account.

### Path A (MVP) — AgentMail

```
Vendor/client forwards invoice to clientname@meetbert.uk
    → AgentMail webhook fires → triggers agent
    → Agent processes email + attachments
    → Agent sends follow-ups FROM clientname@meetbert.uk
```

### Path B (Post-MVP) — Connected Email OAuth

```
User connects Gmail/Outlook via OAuth (Nylas, read-only)
    → Nylas scans inbox for invoice-like emails
    → Same processing pipeline as Path A
    → All outbound emails still sent FROM clientname@meetbert.uk
```

**Why this split:** User trust (agent never sends from their account), clean audit trail (one channel), simpler permissions (Nylas only needs read scope), professional branding.

### Domain Setup (meetbert.uk)

1. DNS: MX records → AgentMail servers
2. Verification: SPF, DKIM, DMARC
3. AgentMail: register domain, create inbox template
4. Per-user: API call to create `clientname@meetbert.uk`
5. Webhook: point inbound to agent backend URL

---

## 2. Agent Architecture

Two independent agents. They share the same DB but have no direct connection.

```
Follow-up Agent     — scheduled cron, sends reminders for stale invoices, less agentic & more of a script
Task Agent          — main agent triggered by emails, chat uploads, and human input
```

---

### Follow-up Agent (post-MVP)

Standalone scheduled script. Triggered on a specific schedule. Handles all **ongoing** follow-ups for invoices stuck in `awaiting_info`. Completely separate from BERT — only connection is the shared DB.

**Split with BERT:** BERT only follows up on the initial run — when a new invoice is first created with missing fields, that request gets bundled into the Layer 3 reply on the same thread. All subsequent reminders are the Follow-up Agent's job.

**Key behaviour:**
- Groups follow-ups by sender — one email per sender listing all their invoices that need info, not one email per invoice
- Respects `follow_up_count < max_followups` and `email_contacts.reachable`
- When a sender replies to a scheduled follow-up, it hits BERT (Trigger A) → Invoice Management Agent updates the fields → next Follow-up Agent run skips that invoice (fields no longer NULL)
- When `follow_up_count >= max_followups` → notify human

---

### Task Agent

Each run is self-contained — no paused graphs, no checkpointing between runs. Within a run, the agent accumulates context through its tool call conversation. Between runs, all state lives in the DB.

#### Trigger A: Email (AgentMail webhook)

Every inbound email — new or reply — hits the same webhook. Preprocessing resolves context before the agent runs.

**Preprocessing** (`bert_email.py`):
1. Parse AgentMail webhook payload
2. Resolve `user_id` from inbox address (lookup `agentmail_inbox` in `user_settings`)
3. Download attachments, store in Supabase Storage
4. Look up `thread_id` in `invoice_threads` → fetch all linked invoices
5. Build email context string

**Layer 3:** Email Reply Agent — drafts and sends a reply via AgentMail on the original thread.

#### Trigger B: Chat (Frontend)

Single endpoint (`POST /api/chat`) handles both file uploads and text-only messages via `FormData`.

**Preprocessing** (`bert_chat.py` → `preprocess_chat()`):
1. If file provided: validate file type and size, store in Supabase Storage
2. Fetch last 20 messages from `chat_messages` for conversation history
3. Build chat context string (history + current message + attachments)

**Orchestration** (`bert_chat.py` → `process_chat()`):
1. Save user message to `chat_messages`
2. Run pipeline (Layers 1-2)
3. Run chat reply agent (Layer 3)
4. Save assistant reply to `chat_messages`

**Layer 3:** Chat Reply Agent — summarises pipeline results as a chat-friendly message (no email sent). History-aware — can reference previous messages in the conversation.

---

## 3. Pipeline (LangChain)

The pipeline (Layers 1-2) is **source-agnostic** — it receives a context string and returns structured results. Each trigger provides its own preprocessing and Layer 3 reply agent.

```
              Layer 1                    Layer 2                         Layer 3
           Classification               Task Loop                    (per channel)

                              ┌─→ Invoice Management Agent ──┐
                              │                              ├──→ Email Reply Agent  (email)
Trigger ───→ Classifier ──────┼─→ Project Management Agent ──┤
                              │   (post-MVP)                 ├──→ Chat Reply Agent   (chat)
                              └──────────────────────────────┘
```

```
  Email ──► preprocess()  ──► run_pipeline() ──► email_reply_agent  ──► send email
  Chat  ──► preprocess_chat() ──► run_pipeline() ──► chat_reply_agent ──► return message
```

Both flows follow the same shape: **preprocess → pipeline (L1-L2) → reply agent (L3)**.

### Layer 1: Classification

#### Classifier

Reads the context and breaks it into an ordered list of typed tasks for downstream agents to execute.

**Type:** LLM (light — classify + investigate only if unsure)

**System prompt guidance:**
- Classify the sender via `create_or_update_contact` on every **email** (vendor, coworker, or unknown; set reachable=false for noreply/automated). Skip sender classification for chat messages.
- Look at the content, attachments, and linked invoices (or chat history)
- If enough context to classify → output tasks immediately
- If unsure → use read tools to investigate, then classify
- Output tasks in the order they should be executed
- If a task depends on another completing first, put it after

**Tools:** `get_invoice`, `get_invoices_by_vendor`, `get_projects` (read-only, use only if needed), `create_or_update_contact` (classify sender — email only)

**Input:** context string from preprocessing (email or chat). Chat context includes conversation history.

**Output:** ordered list of tasks. Each downstream agent also receives the full context.
```python
[
    {
        "type": "invoice_management",  # or "project_management" or "question"
        "instruction": str,            # what to do, e.g. "Process new invoice from attachment 0"
                                       # or "Update invoice abc with corrected total from reply"
    },
    ...
]
```

**Task types:**

| Type | Description | Downstream agent |
|------|-------------|-----------------|
| `invoice_management` | New invoice, update existing invoice, reply with missing info, correction | Invoice Management Agent |
| `project_management` | Create project, update budget, add vendors/locations, update categories | Project Management Agent |
| (questions) | Answer a question about data | No task created — reply agent answers directly using its read tools |

**Output goes to:** task loop

---

### Layer 2: Task Loop

#### Invoice Agent

Processes everything invoice-related: new invoices, updates, corrections, follow-ups.

**Type:** LLM (agentic — loops with tools until task is complete)

**Input:**
- Full context string from preprocessing
- Task instruction from classifier (e.g. "Process new invoice from attachment 0")

**Tools:** `get_invoice`, `get_projects`, `get_categories`, `get_project_documents`, `get_invoices_by_vendor`, `get_user_settings`, `extract_invoice_data`, `check_duplicate`, `create_invoice`, `update_invoice`, `assign_invoice`, `get_follow_up_state`

**System prompt guidance:**
- For new invoices: extract → check_duplicate → create (pass thread_id to link email thread) → assign project + category → get_follow_up_state to check what's missing
- For updates/corrections: identify the invoice → update fields (pass thread_id to link additional threads) → re-evaluate assignment if key fields changed
- For assignment: query project context, vendor history, onboarding docs. If confident → assign. If not → leave NULL for human.
- Always call check_duplicate before create_invoice

**Output goes to:** task loop (next task runs, or → Layer 3 if last)

---

#### Project Agent (post-MVP)

> TODO — handles project creation, budget updates, vendor/location management, category changes.

---

---

### Layer 3: Response (pluggable per channel)

Layer 3 is **not part of the shared pipeline**. Each channel provides its own reply agent. The pipeline returns `{ tasks, task_results, follow_up_states }` and the channel orchestrator (`bert_email.py` or `bert_chat.py`) calls the appropriate reply agent.

#### Email Reply Agent

After all tasks have executed, drafts and sends a reply email on the original thread.

**Type:** LLM + tool loop (light — drafts reply, sends, updates follow-up tracking)

**Input:**
- Task results from all completed tasks
- Follow-up states from `get_follow_up_state` (missing fields, whether sender should be asked)
- Full email context (thread_id, sender — to know where to reply)

**Logic:**
1. Collect results from all executed tasks
2. Check if any task returned a follow-up request (`should_follow_up: true`)
3. LLM drafts ONE reply that combines: summary of actions taken + request for missing info (if any)
4. Call `send_reply` to send via AgentMail on the original thread

**Tools:** `get_invoice`, `get_invoices_by_vendor`, `get_projects`, `get_categories`, `send_reply`

**Output goes to:** END

#### Chat Reply Agent

After all tasks have executed, summarises results as a concise chat message.

**Type:** LLM (light — formats results for chat UI)

**Input:**
- Task results from all completed tasks
- Full chat context (user message, attachment paths, conversation history)

**Logic:**
1. Read task results and chat history
2. LLM drafts a chat-friendly summary (casual but professional, like a helpful colleague in Slack)
3. Can reference previous messages in the conversation for continuity
4. May use read-only tools to look up details if needed

**Tools:** `get_invoice`, `get_invoices_by_vendor`, `get_projects`, `get_categories` (read-only — no `send_reply`)

**Output goes to:** END (returned to frontend as chat response)

---

## 4. Tools

**`user_id` injection:** Resolved during preprocessing (inbox → `user_settings`). Not passed to the agent or included in tool signatures. Instead, tools are created via a factory function (`create_tools(user_id)`) that captures `user_id` in a closure. Every tool uses it internally for DB queries, but the LLM never sees it — only parameters it reasons about are exposed.

| Tool                     | Type   | Available in                |
|--------------------------|--------|-----------------------------|
| `get_invoice`            | get    | Classifier, Invoice Agent, Email Reply Agent, Chat Reply Agent |
| `get_invoices_by_vendor` | get    | Classifier, Invoice Agent, Email Reply Agent, Chat Reply Agent |
| `get_projects`           | get    | Classifier, Invoice Agent, Email Reply Agent, Chat Reply Agent |
| `get_categories`         | get    | Invoice Agent, Email Reply Agent, Chat Reply Agent |
| `get_project_documents`  | get    | Invoice Agent               |
| `get_user_settings`      | get    | Invoice Agent               |
| `get_follow_up_state`    | get    | Invoice Agent               |
| `create_or_update_contact` | action | Classifier                |
| `extract_invoice_data`   | action | Invoice Agent               |
| `check_duplicate`        | action | Invoice Agent               |
| `create_invoice`         | action | Invoice Agent               |
| `update_invoice`         | action | Invoice Agent               |
| `assign_invoice`         | action | Invoice Agent               |
| `send_reply`             | action | Email Reply Agent           |

---

## 5. File Structure

```
app/
├── main.py                          # FastAPI entrypoint, registers routers
├── db.py                            # Supabase client, seed_categories
├── deps.py                          # Auth dependencies (get_current_user, require_auth)
│
├── routes/
│   ├── agentmail.py                 # POST /webhook/agentmail (inbound email trigger)
│   └── chat.py                      # POST /api/chat (text + optional file, single endpoint)
│
└── agents/
    ├── config.py                    # Supabase client, AgentMail keys, LLM factory
    ├── pipeline.py                  # Shared: run_pipeline(), store_attachment(), ALLOWED_EXTENSIONS
    ├── bert_email.py                # Email channel: preprocess() → process_email()
    ├── bert_chat.py                 # Chat channel: preprocess_chat() → process_chat(), chat history persistence
    │
    ├── subagents/
    │   ├── classifier.py            # Layer 1: LLM + tool loop (light)
    │   ├── invoice_agent.py         # Layer 2: LLM + tool loop (agentic)
    │   ├── email_reply_agent.py     # Layer 3 (email): drafts + sends reply
    │   ├── chat_reply_agent.py      # Layer 3 (chat): summarises results for chat UI
    │   └── project_agent.py         # post-MVP
    │
    ├── tools/
    │   ├── __init__.py              # create_tools(user_id) factory
    │   ├── get_tools.py             # read-only tools
    │   └── action_tools.py          # write tools
    │
    ├── prompts/
    │   ├── classifier_prompt.py
    │   ├── invoice_agent_prompt.py
    │   ├── email_reply_prompt.py
    │   └── chat_reply_prompt.py
    │
    └── tests/
        ├── test_get_tools.py
        ├── test_action_tools.py
        ├── test_classifier.py
        ├── test_invoice_agent.py
        └── test_reply_agent.py
```

Separation: `app/routes/` = thin HTTP handlers, `app/agents/` = all business logic. Routes delegate to channel orchestrators (`bert_email`, `bert_chat`), which call the shared `pipeline` and their respective reply agent.

---

## 6. Deployment

### Frontend: Vercel

Standard deployment for the Lovable-built frontend.

### Agent Backend: Railway (MVP)

Deploy a Python process that:
1. Listens for AgentMail webhooks
2. Runs the LangChain pipeline (classifier → agents → reply)
3. Exposes API for the frontend (FastAPI)

---

## 7. Post-MVP To-Dos

- **Multi-thread replies:** Reply agent currently sends one reply on the triggering thread. Upgrade to send follow-ups on the correct per-invoice thread (e.g., ask the vendor directly on their thread instead of asking the coworker who forwarded it). Requires `get_invoice_threads` tool and updating the reply prompt to support multiple `send_reply` calls across different threads.
- **Connected Email OAuth (Path B):** User connects Gmail/Outlook via Nylas (read-only). Nylas scans inbox for invoice-like emails, feeds them into the same pipeline. All outbound still sent from `clientname@meetbert.uk`.
- **Follow-up Agent:** Scheduled cron job that sends reminders for invoices stuck in `awaiting_info`. Groups follow-ups by sender (one email per sender, not per invoice). Respects `follow_up_count < max_followups` and `sender_reachable`. Notifies human when max follow-ups reached.
- **Project Management Agent:** Handles project creation, budget updates, vendor/location management, category changes. Triggered by emails classified as `project_management`.

- **Invoice lookup by number:** Allow `get_invoice` to accept a human-readable invoice number (e.g. `CI2023-001`) in addition to the database UUID. Currently the LLM sometimes passes invoice numbers and gets no results.
- **Semantic search for project documents:** Add `embedding` vector column (pgvector) to `project_documents` for semantic search instead of reading docs raw.
- **Slack notifications:** Add `'slack'` to `notification_channel` CHECK constraint and implement Slack integration for human notifications.
- **Document comparison in dedup:** Download candidate PDFs from Supabase Storage and pass them to the dedup LLM alongside the new document for visual/content comparison. Catches near-duplicates and OCR inconsistencies that field-level comparison misses.
- **Richer sender classification:** Before classifying a sender, fetch all existing threads from that email address to give the classifier more context (e.g., past invoices sent, forwarding patterns). Currently classification is based on the single inbound email only.
- **Agent log:** All action tool calls (create_invoice, update_invoice, assign_invoice, send_reply, etc.) should write to `agent_log` as a side effect for a user-facing audit trail.
- **Production hosting:** Replace ngrok tunnel with a proper deployed backend (e.g. Railway, Render, Fly.io) with a stable webhook URL. Current MVP uses ngrok for local development.
