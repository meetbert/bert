# BERT Agent Tests

> Test structure, principles, and coverage for the agent pipeline.

---

## Principles

- **No pre-seeded data** — every test creates everything it needs via fixtures and is fully self-contained.
- **Full cleanup** — all DB rows created during a test (invoices, projects, contacts, etc.) are deleted in teardown, whether the test passes or fails.
- **Output only** — tests verify inputs, outputs, and DB state. No assertions on intermediate agent steps or internal pipeline fields.
- **Runnable in any order** — no test depends on state left by a previous test.
- **Dedicated test user** — all test data is written under a single `TEST_USER_ID` defined in `tests/conftest.py`. This is a real DB user created solely for testing — it holds no production data. The orphan sweep deletes all rows for this user at module start.
- **No hardcoded IDs** — tests never reference a specific UUID that exists in the DB; all required rows are created in fixtures.
- **LangSmith tracing** — each test run creates a named root span (`IT: <test_name>` or `E2E: <test_name>`) so traces are grouped per test in LangSmith. LLM judge calls are excluded from tracing.

---

## Folder Structure

```
app/agents/tests/
├── conftest.py                    # path setup, dotenv, shared TEST_USER_ID
├── sample_invoices/               # sample PDF fixtures
│   ├── sample_invoice_1.pdf       # East Repair Inc. — US-001, $154.06
│   ├── sample_invoice_2.pdf       # Zylker Electronics Hub — INV-000001, $2,338.35
│   ├── sample_invoice_3.pdf       # Tom Green Handyman — 0003521, $3,367.20
│   ├── sample_invoice_4.pdf       # Tree photo — not an invoice
│   └── sample_invoice_5.pdf       # ABC Exports Ltd. — CI2023-001, $13,000.00
│
├── unit/                          # fast, no LLM, no DB (~1s)
│   ├── test_classifier_parse.py   # _parse_tasks: JSON extraction, type filtering
│   └── test_preprocessing.py      # _build_email_context, _build_chat_context, file validation
│
├── integration/                   # real LLM, real DB, single component per file
│   ├── conftest.py                # sweep_orphans, langsmith_trace fixture (IT: <test_name>)
│   ├── test_get_tools.py          # read-only DB tools (no LLM)
│   ├── test_action_tools.py       # write tools: extract, create, update, assign, delete
│   ├── test_classifier.py         # classifier: task type detection, sender classification
│   ├── test_invoice_agent.py      # full invoice agent loop: extract → create → assign → follow-up
│   ├── test_project_agent.py      # full project agent loop: create/update projects
│   ├── test_question_agent.py     # full question agent loop: spend, due, vendor queries
│   ├── test_email_reply_agent.py  # email reply agent: draft + send
│   └── test_chat_reply_agent.py   # chat reply agent: summarise results
│
└── e2e/                           # real LLM, real DB, full pipeline
    ├── conftest.py                # sweep_orphans, langsmith_trace fixture (E2E: <test_name>)
    └── test_pipeline.py           # 16 tests: run_pipeline() + reply agent, DB + LLM judge
```

---

## Running Tests

```bash
# Unit only (fast, no credentials needed beyond .env)
pytest app/agents/tests/unit/ -v

# Integration only
pytest app/agents/tests/integration/ -v

# E2E only
pytest app/agents/tests/e2e/ -v

# All
pytest app/agents/tests/ -v
```

---

## Integration Tests of current Agent Architecture

Each file tests one component in isolation. The agent loop tests (`test_invoice_agent`, `test_project_agent`, etc.) run the full LLM + tools + DB loop for a single agent — they are component-level e2e tests, not pure unit tests. The distinction from `e2e/` is that they test one agent without the surrounding pipeline (no classifier, no reply agent on top).

---

## E2E Tests (`test_pipeline.py`)

All via **chat context** unless noted. Each test calls `run_pipeline()` + `run_chat_reply_agent()` (or `run_email_reply_agent()` for T16), then asserts on DB state and/or uses an LLM judge on the final reply.

| # | Test | Asserts |
|---|------|---------|
| 1 | New invoice from body | DB: vendor/total/currency/category; LLM judge: reply confirms creation |
| 2 | New invoice from attachment | DB: invoice linked to PDF path; LLM judge: reply confirms creation |
| 3 | Vendor reply correction | DB: updated total; LLM judge: reply confirms update |
| 4 | Invoice with project + category assignment | DB: project_id + category_id set; LLM judge: reply confirms assignment |
| 5 | Bulk update | DB: all target invoices marked paid; LLM judge: reply confirms bulk update |
| 6 | Delete invoice | DB: invoice gone; LLM judge: reply confirms deletion |
| 7 | Create project | DB: project with correct name/budget; LLM judge: reply confirms creation |
| 8 | Update project budget | DB: budget updated; LLM judge: reply confirms update |
| 9 | Invoice + question (multi-task) | DB: invoice created; LLM judge: reply addresses both invoice and question |
| 10 | Spend summary | LLM judge: reply mentions correct total |
| 11 | Due soon | LLM judge: reply mentions correct invoice/date |
| 12 | Project spend | LLM judge: reply mentions correct remaining budget |
| 13 | Vendor summary | LLM judge: reply mentions correct amount owed |
| 14 | Invoice search | LLM judge: reply mentions correct vendor/invoice |
| 15 | No action (thank you note) | DB: no new rows created; LLM judge: polite acknowledgement |
| 16 | New invoice via email *(email channel)* | DB: invoice created; `send_reply` called; LLM judge: reply acknowledges receipt |
