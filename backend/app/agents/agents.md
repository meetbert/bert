# BERT Agent Architecture

> Agent pipeline spec. For database schema, see `backend/database.md`.

---

## Conventions

- **Tool factory pattern:** Tools are never passed `user_id` as a parameter. Instead, `create_get_tools(user_id)` and `create_action_tools(user_id)` capture `user_id` in a closure. Every tool uses it internally for DB queries — the LLM never sees it.
- **Prompt files:** One file per agent in `prompts/`, named `<agent>_prompt.py`. Each exports a single string constant.
- **Agent entry points:** Each subagent exposes a single `run_<agent>()` async function. Orchestrators call this and nothing else.
- **Config:** LLM model and Supabase client are defined in `config.py`. Import from there — don't re-instantiate.

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
                              │                              ├──→ Chat Reply Agent   (chat)
                              └─→ Question Agent ────────────┘
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
- If unsure → classify based on available context, let downstream agents investigate
- Output tasks in the order they should be executed
- If a task depends on another completing first, put it after

**Tools:** `create_or_update_contact` (classify sender — email only)

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
| `project_management` | Create project, update budget, change status | Project Management Agent |
| `question` | Answer a question about spend, vendors, budgets, due invoices, etc. | Question Agent |

**Output goes to:** task loop

---

### Layer 2: Task Loop

#### Invoice Agent

Processes everything invoice-related: new invoices, updates, corrections, follow-ups.

**Type:** LLM (agentic — loops with tools until task is complete)

**Input:**
- Full context string from preprocessing
- Task instruction from classifier (e.g. "Process new invoice from attachment 0")

**Tools:** `get_invoice`, `search_invoices`, `get_projects`, `get_categories`, `get_project_documents`, `get_follow_up_state`, `extract_invoice_data`, `check_duplicate`, `create_invoice`, `update_invoice`, `assign_invoice`, `bulk_update_invoices`, `delete_invoice`, `set_vendor_mapping`

**System prompt guidance:**
- For new invoices: extract → check_duplicate → create (pass thread_id to link email thread) → assign project and/or category (only what the agent is confident about) → get_follow_up_state to check what's missing
- For updates/corrections: identify the invoice → update fields (pass thread_id to link additional threads) → re-evaluate assignment if key fields changed
- For assignment: query project context, vendor history, onboarding docs. If confident → assign. If not → leave NULL for human.
- Always call check_duplicate before create_invoice

**Output goes to:** task loop (next task runs, or → Layer 3 if last)

---

#### Project Agent

Handles project creation and updates.

**Type:** LLM (agentic — loops with tools until task is complete)

**Input:**
- Full context string from preprocessing
- Task instruction from classifier (e.g. "Create a new project called Brighton Shoot with £25k budget")

**Tools:** `get_projects`, `get_categories`, `create_project`, `update_project`

**Output goes to:** task loop (next task runs, or → Layer 3 if last)

---

#### Question Agent

Answers read-only data questions: spend summaries, budget vs actual, vendor history, due invoices.

**Type:** LLM (agentic — queries tools until it can answer)

**Input:**
- Full context string from preprocessing
- Task instruction from classifier (e.g. "What is the total spend last month?")

**Tools:** `get_invoice`, `search_invoices`, `get_vendor_summary`, `get_spend_summary`, `get_due_soon`, `get_project_spend`, `get_projects`, `get_categories`

**Output goes to:** task loop (next task runs, or → Layer 3 if last)

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

**Tools:** `send_reply` (read tools stripped — agent works from task result summaries already in context)

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

**Tools:** none — works from task result summaries already in context

**Output goes to:** END (returned to frontend as chat response)

---

## 4. Tools

**`user_id` injection:** Resolved during preprocessing (inbox → `user_settings`). Not passed to the agent or included in tool signatures. Instead, tools are created via two factory functions — `create_get_tools(user_id)` and `create_action_tools(user_id)` — that capture `user_id` in a closure. Every tool uses it internally for DB queries, but the LLM never sees it. Each agent selects its own subset from both factories.

| Tool                       | Type   | Available in                              |
|----------------------------|--------|-------------------------------------------|
| `get_invoice`              | get    | Invoice Agent, Question Agent             |
| `search_invoices`          | get    | Invoice Agent, Question Agent             |
| `get_vendor_summary`       | get    | Question Agent                            |
| `get_spend_summary`        | get    | Question Agent                            |
| `get_due_soon`             | get    | Question Agent                            |
| `get_project_spend`        | get    | Question Agent                            |
| `get_projects`             | get    | Invoice Agent, Project Agent, Question Agent |
| `get_categories`           | get    | Invoice Agent, Project Agent, Question Agent |
| `get_project_documents`    | get    | Invoice Agent                             |
| `get_follow_up_state`      | get    | Invoice Agent                             |
| `create_or_update_contact` | action | Classifier                                |
| `extract_invoice_data`     | action | Invoice Agent                             |
| `check_duplicate`          | action | Invoice Agent                             |
| `create_invoice`           | action | Invoice Agent                             |
| `update_invoice`           | action | Invoice Agent                             |
| `assign_invoice`           | action | Invoice Agent                             |
| `bulk_update_invoices`     | action | Invoice Agent                             |
| `delete_invoice`           | action | Invoice Agent                             |
| `set_vendor_mapping`       | action | Invoice Agent                             |
| `create_project`           | action | Project Agent                             |
| `update_project`           | action | Project Agent                             |
| `send_reply`               | action | Email Reply Agent                         |

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
│   ├── chat.py                      # POST /api/chat (text + optional file, single endpoint)
│   ├── extract.py                   # POST /extract (invoice extraction + vendor mapping lookup)
│   └── projects.py                  # POST /projects/extract-context (project doc extraction)
│
└── agents/
    ├── config.py                    # Supabase client, AgentMail keys, LLM factory
    ├── pipeline.py                  # Shared: run_pipeline(), store_attachment(), ALLOWED_EXTENSIONS
    ├── bert_email.py                # Email channel: preprocess() → process_email()
    ├── bert_chat.py                 # Chat channel: preprocess_chat() → process_chat(), chat history persistence
    │
    ├── subagents/
    │   ├── classifier.py            # Layer 1: Classifies Tasks
    │   ├── invoice_agent.py         # Layer 2: handles invoice operations
    │   ├── project_agent.py         # Layer 2: create/update projects
    │   ├── question_agent.py        # Layer 2: read-only data questions
    │   ├── email_reply_agent.py     # Layer 3 (email): drafts + sends reply
    │   └── chat_reply_agent.py      # Layer 3 (chat): summarises results for chat UI
    │
    ├── tools/
    │   ├── get_tools.py             # read-only tools, create_get_tools(user_id) factory
    │   └── action_tools.py          # write tools, create_action_tools(user_id) factory
    │
    ├── prompts/
    │   ├── classifier_prompt.py
    │   ├── invoice_agent_prompt.py
    │   ├── project_agent_prompt.py
    │   ├── question_agent_prompt.py
    │   ├── email_reply_prompt.py
    │   └── chat_reply_prompt.py
    │
    └── tests/
        ├── conftest.py
        ├── tests.md                 # test principles, structure, coverage
        ├── sample_invoices/
        ├── unit/                    # fast, no LLM/DB
        ├── integration/             # real LLM + DB, one component per file
        └── e2e/                     # full pipeline, LLM judge assertions
```

Separation: `app/routes/` = thin HTTP handlers, `app/agents/` = all business logic. Routes delegate to channel orchestrators (`bert_email`, `bert_chat`), which call the shared `pipeline` and their respective reply agent.

---

## 6. Tests

See `app/agents/tests/tests.md` for test principles, structure, and coverage.

---

## 7. Deployment

Both frontend and backend are deployed on **Railway**. To deploy: push to `main`, then manually trigger a deploy from the Railway dashboard.

---

## 8. To-Dos

- **Multi-thread replies:** Reply agent currently sends one reply on the triggering thread. Upgrade to send follow-ups on the correct per-invoice thread (e.g., ask the vendor directly on their thread instead of asking the coworker who forwarded it). Requires `get_invoice_threads` tool and updating the reply prompt to support multiple `send_reply` calls across different threads.
- **Connected Email OAuth (Path B):** User connects Gmail/Outlook via Nylas (read-only). Nylas scans inbox for invoice-like emails, feeds them into the same pipeline. All outbound still sent from `clientname@meetbert.uk`.
- **Follow-up Agent:** Scheduled cron job that sends reminders for invoices stuck in `awaiting_info`. Groups follow-ups by sender (one email per sender, not per invoice). Respects `follow_up_count < max_followups` and `sender_reachable`. Notifies human when max follow-ups reached.
- **Semantic search for project documents:** Add `embedding` vector column (pgvector) to `project_documents` for semantic search instead of reading docs raw.
- **Slack notifications:** Add `'slack'` to `notification_channel` CHECK constraint and implement Slack integration for human notifications.
- **Document comparison in dedup:** Download candidate PDFs from Supabase Storage and pass them to the dedup LLM alongside the new document for visual/content comparison. Catches near-duplicates and OCR inconsistencies that field-level comparison misses.
- **Richer sender classification:** Before classifying a sender, fetch all existing threads from that email address to give the classifier more context (e.g., past invoices sent, forwarding patterns). Currently classification is based on the single inbound email only.
- **Agent log:** All action tool calls (create_invoice, update_invoice, assign_invoice, send_reply, etc.) should write to `agent_log` as a side effect for a user-facing audit trail.
- **Extract budget from project documents:** When a user uploads a brief/budget document during project creation, automatically detect per-category budget breakdowns and pre-fill the category mode + budgets in step 2 of the wizard. Requires updating `/api/projects/extract-context` to return category budgets, and adding a `set_project_categories` tool for the chat agent path.
