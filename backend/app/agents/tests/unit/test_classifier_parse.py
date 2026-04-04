"""Unit tests for _parse_tasks — no LLM, no DB."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from app.agents.subagents.classifier import _parse_tasks


def test_bare_json_array():
    text = '[{"type": "invoice_management", "instruction": "Process new invoice"}]'
    result = _parse_tasks(text)
    assert len(result) == 1
    assert result[0]["type"] == "invoice_management"
    assert result[0]["instruction"] == "Process new invoice"


def test_code_fenced_json():
    text = '```json\n[{"type": "question", "instruction": "What is my total spend?"}]\n```'
    result = _parse_tasks(text)
    assert len(result) == 1
    assert result[0]["type"] == "question"


def test_multiple_tasks():
    text = '[{"type": "invoice_management", "instruction": "Create invoice"}, {"type": "project_management", "instruction": "Create project Alpha"}]'
    result = _parse_tasks(text)
    assert len(result) == 2
    assert result[0]["type"] == "invoice_management"
    assert result[1]["type"] == "project_management"


def test_invalid_task_type_filtered():
    text = '[{"type": "unknown_type", "instruction": "Do something"}, {"type": "question", "instruction": "What is spend?"}]'
    result = _parse_tasks(text)
    assert len(result) == 1
    assert result[0]["type"] == "question"


def test_missing_instruction_filtered():
    text = '[{"type": "invoice_management"}, {"type": "question", "instruction": "Spend?"}]'
    result = _parse_tasks(text)
    assert len(result) == 1
    assert result[0]["type"] == "question"


def test_empty_input():
    assert _parse_tasks("") == []


def test_no_json_in_text():
    assert _parse_tasks("Sorry, I cannot help with that.") == []


def test_malformed_json():
    assert _parse_tasks("[{type: invoice_management}]") == []


def test_list_of_blocks_input():
    """LangChain may return content as a list of block dicts."""
    blocks = [
        {"type": "text", "text": '[{"type": "question", "instruction": "Total spend?"}]'},
    ]
    result = _parse_tasks(blocks)
    assert len(result) == 1
    assert result[0]["type"] == "question"


def test_all_valid_task_types():
    text = '[{"type": "invoice_management", "instruction": "a"}, {"type": "project_management", "instruction": "b"}, {"type": "question", "instruction": "c"}]'
    result = _parse_tasks(text)
    assert len(result) == 3
