"""Unit tests for preprocessing helpers — no LLM, no DB, no network."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from unittest.mock import patch

from app.agents.bert_email import _build_email_context
from app.agents.bert_chat import _build_chat_context


# ---------------------------------------------------------------------------
# _build_email_context
# ---------------------------------------------------------------------------

def test_build_email_context_basic():
    ctx = _build_email_context(
        sender="vendor@example.com",
        subject="Invoice #123",
        body="Please find our invoice attached.",
        attachment_paths=["invoices/abc.pdf"],
        thread_id="thread-001",
        message_id="msg-001",
        linked_invoices=[],
    )
    assert "From: vendor@example.com" in ctx
    assert "Subject: Invoice #123" in ctx
    assert "Body: Please find our invoice attached." in ctx
    assert "invoices/abc.pdf" in ctx
    assert "Thread ID: thread-001" in ctx
    assert "Message ID: msg-001" in ctx
    assert "Linked invoices: []" in ctx


def test_build_email_context_with_linked_invoices():
    linked = [{"id": "uuid-1", "vendor_name": "Acme", "total": 100}]
    ctx = _build_email_context(
        sender="a@b.com", subject="Re: Invoice", body="Correction.",
        attachment_paths=[], thread_id="t1", message_id="m1",
        linked_invoices=linked,
    )
    assert "uuid-1" in ctx
    assert "Acme" in ctx


def test_build_email_context_no_attachments():
    ctx = _build_email_context(
        sender="a@b.com", subject="Hi", body="No attachments here.",
        attachment_paths=[], thread_id="t1", message_id="m1",
        linked_invoices=[],
    )
    assert "Attachments: []" in ctx


# ---------------------------------------------------------------------------
# _build_chat_context
# ---------------------------------------------------------------------------

def test_build_chat_context_no_history():
    ctx = _build_chat_context(
        message="Please record invoice #INV-001.",
        attachment_paths=[],
        history=[],
    )
    assert "Source: Chat" in ctx
    assert "User message: Please record invoice #INV-001." in ctx
    assert "Chat history" not in ctx


def test_build_chat_context_with_history():
    history = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi! How can I help?"},
    ]
    ctx = _build_chat_context(
        message="Record this invoice.",
        attachment_paths=[],
        history=history,
    )
    assert "Chat history:" in ctx
    assert "[user]: Hello" in ctx
    assert "[assistant]: Hi! How can I help?" in ctx
    assert "User message: Record this invoice." in ctx


def test_build_chat_context_with_attachment():
    ctx = _build_chat_context(
        message="See attachment.",
        attachment_paths=["invoices/test.pdf"],
        history=[],
    )
    assert "invoices/test.pdf" in ctx


# ---------------------------------------------------------------------------
# preprocess_chat — file validation (no real DB or storage needed)
# ---------------------------------------------------------------------------

def test_preprocess_chat_rejects_unsupported_extension():
    import pytest
    from app.agents.bert_chat import preprocess_chat
    with pytest.raises(ValueError, match="Unsupported file type"):
        preprocess_chat(
            user_id="test-user",
            message="See attached",
            filename="document.docx",
            file_bytes=b"fake content",
        )


def test_preprocess_chat_rejects_oversized_file():
    import pytest
    from app.agents.bert_chat import preprocess_chat, MAX_FILE_SIZE
    with pytest.raises(ValueError, match="too large"):
        preprocess_chat(
            user_id="test-user",
            message="See attached",
            filename="invoice.pdf",
            file_bytes=b"x" * (MAX_FILE_SIZE + 1),
        )
