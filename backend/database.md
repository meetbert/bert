# BERT Database Schema

> Supabase (PostgreSQL) — source of truth for all application state.

## Design Principles

1. **DB is the source of truth.** The invoice row is created by the agent after extraction + dedup, with whatever fields were extracted. Remaining NULL fields are filled by follow-ups or human input. No in-memory state between runs.
2. **Stateless runs.** Each agent run is self-contained. Between runs, all state lives in the DB. The frontend queries Supabase directly.
3. **Derived, not stored.** What's missing is derived at runtime by checking which required fields are still NULL. No explicit pending arrays in the DB.

---

## Schema

> All timestamp columns use `timestamptz` (not `timestamp`).

### `projects`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `user_id` | uuid FK → auth.users | | Owner of this project |
| `name` | text | | |
| `budget` | numeric | 0 | CHECK: >= 0. Always the authoritative budget figure. In 'category' mode kept in sync by `trg_sync_project_budget`. |
| `budget_mode` | text | 'total' | CHECK: 'total', 'category'. Controls whether budget is one total or split by category |
| `status` | text | 'Active' | CHECK: 'Active', 'Completed', 'Archived' |
| `description` | text | nullable | Context for agent project-matching |
| `known_vendors` | text[] | '{}' | Vendor names associated with this project |
| `known_locations` | text[] | '{}' | Filming locations for project-matching |
| `created_at` | timestamptz | now() | |
| `updated_at` | timestamptz | now() | Set by application code on every update |
| `ai_context` | text | nullable | Free-text context injected into agent prompts for project-matching |

### `invoice_categories`

Global list of expense categories. Projects pick from these during onboarding.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `name` | text UNIQUE | | e.g. Travel, Equipment, Crew/Freelance |

Seed: Travel, Accommodation, Contributor Fees, Location Rental, Crew/Freelance, Equipment, Post-Production, Insurance, Music/Licensing, Office/Admin, Other

### `project_categories`

Junction table. Each project selects categories during onboarding and assigns a budget per category.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `project_id` | uuid FK → projects | | |
| `category_id` | uuid FK → invoice_categories | | NOT NULL |
| `budget` | float8 | 0 | CHECK: >= 0. Budget allocated to this category within this project |
| `created_at` | timestamptz | now() | |

UNIQUE constraint on (`project_id`, `category_id`).

> **Budget in 'total' mode** = `projects.budget` (single figure set by user)
> **Budget in 'category' mode** = `projects.budget` kept in sync automatically by trigger `trg_sync_project_budget` (see below)
> **Spend per category** = `SELECT SUM(i.total) FROM invoices i WHERE i.project_id = ? AND i.category_id = ?`

#### Trigger: `trg_sync_project_budget`

Fires `AFTER INSERT OR UPDATE OR DELETE` on `project_categories`. When `budget_mode = 'category'`, recalculates `SUM(project_categories.budget)` for the affected project and writes it to `projects.budget`. This keeps `projects.budget` as the single source of truth in both modes — the frontend and agents always read `projects.budget` regardless of mode.

```sql
CREATE OR REPLACE FUNCTION sync_project_budget()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET budget = (
    SELECT COALESCE(SUM(budget), 0)
    FROM project_categories
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
  )
  WHERE id = COALESCE(NEW.project_id, OLD.project_id)
    AND budget_mode = 'category';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_project_budget
AFTER INSERT OR UPDATE OR DELETE ON project_categories
FOR EACH ROW EXECUTE FUNCTION sync_project_budget();
```

### `project_documents`

Documents uploaded during onboarding (scripts, briefs, budgets, etc.) to give the agent project context.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `project_id` | uuid FK → projects | | |
| `file_name` | text | | Original file name |
| `storage_path` | text | | Path in Supabase Storage bucket |
| `uploaded_at` | timestamptz | now() | |

> MVP: agent reads these docs raw when it needs project context during extraction/assignment.
> Post-MVP: add an `embedding` vector column (pgvector) for semantic search.

### `invoices`

The central table. Created by the agent after extraction + dedup, with whatever fields were extracted. Remaining NULL fields filled by follow-ups or human input.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `user_id` | uuid FK → auth.users | | Owner of this invoice |
| **Invoice fields** | | | |
| `vendor_name` | text | nullable | NULL = pending |
| `invoice_date` | date | nullable | NULL = pending |
| `invoice_number` | text | nullable | NULL = pending, 'N/A' = confirmed absent |
| `currency` | text | nullable | NULL = pending |
| `subtotal` | float8 | nullable | CHECK: >= 0 |
| `vat` | float8 | nullable | CHECK: >= 0. NULL = pending, 0 = confirmed absent |
| `total` | float8 | nullable | CHECK: >= 0. NULL = pending |
| `due_date` | date | nullable | NULL = pending |
| `description` | text | nullable | Invoice description |
| `line_items` | jsonb | nullable | |
| `project_id` | uuid FK → projects | nullable | NULL = pending |
| `category_id` | uuid FK → invoice_categories | nullable | NULL = pending |
| **Document** | | | |
| `document_path` | text | nullable | Path in Supabase Storage |
| `document_hash` | text | nullable | SHA-256 hex of the original file. Computed during extraction, used for duplicate detection. |
| **Lifecycle** | | | |
| `processing_status` | text | 'awaiting_info' | CHECK: 'awaiting_info', 'complete'. Set by DB trigger `trg_processing_status` — never set in application code. |
| `payment_status` | text | 'unpaid' | CHECK: 'unpaid', 'paid', 'overdue', 'partially_paid' |
| `updated_at` | timestamptz | nullable | When the invoice was last modified |
| `created_at` | timestamptz | now() | |
| **Follow-up tracking** | | | |
| `follow_up_count` | int4 | 0 | CHECK: >= 0. Total follow-ups sent across all threads |
| `last_followed_up_at` | timestamptz | nullable | When the last follow-up was sent |
| `human_notified_at` | timestamptz | nullable | When human was first notified (null = not yet) |

#### `processing_status` values

Managed by Postgres trigger `trg_processing_status` (BEFORE INSERT OR UPDATE). The trigger checks `vendor_name`, `total`, `invoice_date`, and `currency` — if all four are non-NULL, status is set to `complete`, otherwise `awaiting_info`. Application code should never set this field.

| Value | Meaning |
|-------|---------|
| `awaiting_info` | One or more required fields (`vendor_name`, `total`, `invoice_date`, `currency`) are NULL |
| `complete` | All required fields present |

#### Field resolution rules

NULL = still pending. Non-required fields are extracted if present but never trigger follow-ups.

`0` = never ask · `1` = ask

| Field | Sender | Human |
|-------|--------|-------|
| `vendor_name` | 1 | 1 |
| `total` | 1 | 1 |
| `invoice_date` | 1 | 1 |
| `currency` | 1 | 1 |
| `project_id` | 0 | 1 |
| `category_id` | 0 | 1 |

### `invoice_threads`

Links an invoice to its AgentMail threads. One invoice can have multiple threads (original email, forwarded duplicates, additional info). Email content lives in AgentMail — fetch via thread API.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `invoice_id` | uuid FK → invoices | | |
| `thread_id` | text | | AgentMail thread ID |
| `created_at` | timestamptz | now() | |

### `agent_log`

User-facing audit trail. Written as a side effect by action tools (`create_invoice`, `assign_invoice`, etc.) when they execute. Developer-level tracing (every LLM call, tool call, latency) is handled by LangSmith.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `invoice_id` | uuid FK → invoices | | |
| `action` | text | | What happened, e.g. 'created', 'assigned', 'updated', 'follow_up_sent' |
| `details` | text | nullable | Human-readable summary, e.g. 'Assigned to Berlin Documentary → Travel' |
| `created_at` | timestamptz | now() | |

### `email_contacts`

Known email addresses and their classification. Created by the classifier on first contact, updated as the system learns more.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `user_id` | uuid FK → auth.users | | ON DELETE CASCADE |
| `email` | text | | UNIQUE per user (user_id, email) |
| `display_name` | text | nullable | Sender's name if known |
| `sender_type` | text | 'unknown' | CHECK: 'vendor', 'coworker', 'unknown' |
| `reachable` | boolean | true | false for noreply@, automated senders |
| `created_at` | timestamptz | now() | |
| `updated_at` | timestamptz | nullable | |

### `vendor_mappings`

Persists vendor→project/category assignments learned or set manually. When an invoice arrives from a known vendor, the agent can look up the mapping and auto-assign.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `user_id` | uuid FK → auth.users | | ON DELETE CASCADE |
| `vendor_name` | text | | Exact vendor name (case-insensitive match at query time) |
| `project_id` | uuid FK → projects | nullable | Target project |
| `category_id` | uuid FK → invoice_categories | nullable | Target category within the project |
| `created_at` | timestamptz | now() | |
| `updated_at` | timestamptz | nullable | |

UNIQUE constraint on (`user_id`, `vendor_name`).

### `chat_messages`

Chat history. One flat conversation per user — no threading. Backend persists messages during `process_chat()`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | gen_random_uuid() | |
| `user_id` | uuid FK → auth.users | | ON DELETE CASCADE |
| `role` | text | | CHECK: 'user', 'assistant' |
| `content` | text | | Message text |
| `attachment_path` | text | nullable | Supabase Storage path if file was uploaded |
| `created_at` | timestamptz | now() | |

Index: `(user_id, created_at DESC)` for efficient history fetching.

### `user_settings`

Per-user configuration. One row per user.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK (FK → auth.users) | | |
| `company_name` | text | nullable | |
| `email_address` | text | nullable | User's monitored inbox |
| `email_provider` | text | 'gmail' | CHECK: 'gmail', 'outlook', 'other' |
| `base_currency` | text | 'EUR' | Default currency for display |
| `agentmail_inbox` | text | nullable | The `clientname@meetbert.uk` address |
| `max_followups` | int4 | 3 | CHECK: >= 0. Max sender follow-ups for required fields |
| `notification_channel` | text | 'email' | CHECK: 'email', 'none' |
| `onboarding_done` | bool | false | |
| `created_at` | timestamptz | now() | |

---

## Row Level Security (RLS)

All tables have RLS enabled. The backend uses the **service role** key (bypasses RLS). These policies only apply to frontend Supabase calls using the user's JWT.

| Table | Policy | Rule |
|-------|--------|------|
| `projects` | Owner access | `auth.uid() = user_id` |
| `invoices` | Owner access | `auth.uid() = user_id` |
| `user_settings` | Owner access | `auth.uid() = id` |
| `email_contacts` | Owner access | `auth.uid() = user_id` |
| `invoice_categories` | Full access (global) | `true` (authenticated only) |
| `project_categories` | Via project owner | `EXISTS (... projects.user_id = auth.uid())` |
| `project_documents` | Via project owner | `EXISTS (... projects.user_id = auth.uid())` |
| `invoice_threads` | Via invoice owner | `EXISTS (... invoices.user_id = auth.uid())` |
| `agent_log` | Read-only via invoice owner | SELECT only, `EXISTS (... invoices.user_id = auth.uid())` |
| `chat_messages` | Owner access | `auth.uid() = user_id` |

Index: `chat_messages(user_id, created_at DESC)` — efficient history fetching.

Unique constraint: `invoices(user_id, document_hash) WHERE document_hash IS NOT NULL` — prevents the same file from creating duplicate invoices at the DB level.

---

## Storage (Buckets)

```
invoices-bucket/
├── {user_id}/
│   ├── {project_id}/           # after project assignment
│   │   ├── invoice_123.pdf
│   │   └── ...
│   └── unassigned/             # before project assignment
│       ├── invoice_789.pdf
│       └── ...

project-documents-bucket/
├── {user_id}/
│   └── {project_id}/
│       ├── budget_plan.pdf
│       └── ...
```

**Storage flow:**
1. Email/chat upload arrives with attachment → preprocessing uploads to `invoices-bucket/{user_id}/unassigned/`
2. `document_path` in invoices table = bucket path
3. When project assigned → `assign_invoice` moves file to `{project_id}/` folder
4. Frontend retrieves via Supabase signed URL
