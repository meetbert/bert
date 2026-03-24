"""Action tools (write/side-effect) for modifying Supabase data.

All tools are created via ``create_action_tools(user_id)`` which captures
``user_id`` in a closure so the LLM never sees it.
"""

import base64
import hashlib
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

from app.agents.config import agentmail_get, agentmail_post, get_llm, supabase


# ---------------------------------------------------------------------------
# Internal prompts
# ---------------------------------------------------------------------------

_DEDUP_SYSTEM = """\
You are a duplicate invoice detector. Compare a new invoice against existing \
invoices from the database and return a JSON verdict.

You receive:
- The new invoice's extracted fields and email context (subject, body, sender).
- Existing candidate invoices with their fields.
- Thread history for each candidate (previous email conversations about that invoice).

Rules:
- Same invoice_number + same vendor → duplicate (unless totals differ, then correction).
- Same vendor + total + date, no invoice numbers on either → likely duplicate.
- Same vendor + total + date, different invoice numbers → not a duplicate (two separate invoices).
- Same vendor + invoice_number, different total or date → correction (updated version).
- Same vendor + total, different date → likely recurring invoice (e.g., monthly rent), not a duplicate.
- Use thread history for extra context: if the conversations reference the same job/project/event, stronger duplicate signal.
- If uncertain, prefer "new" to avoid blocking a legitimate invoice.

Return ONLY a JSON object:
{"verdict": "new" | "duplicate" | "correction", "matched_invoice_id": "..." or null, "reason": "..."}"""

_EXTRACT_SYSTEM = """\
You are an invoice data extraction engine. Extract structured data from the \
provided document (PDF or image) and/or email body.

Return ONLY a JSON object with these keys:
- "vendor_name": company or person name (string or null)
- "invoice_date": date in YYYY-MM-DD format (string or null)
- "invoice_number": invoice/reference number (string or null)
- "currency": 3-letter ISO code like EUR, USD, GBP (string or null)
- "subtotal": amount before tax (number or null)
- "vat": tax/VAT amount, 0 if explicitly absent (number or null)
- "total": total amount (number or null)
- "due_date": payment due date in YYYY-MM-DD (string or null)
- "description": brief description of what the invoice is for (string or null)
- "line_items": array of {"description": string, "quantity": number, "unit_price": number} or null

Rules:
- Use null for any field you cannot determine. Never guess or fabricate.
- Dates MUST be YYYY-MM-DD. Currency MUST be a 3-letter ISO code.
- Monetary values MUST be numbers, not strings. Strip currency symbols.
- If the document is not an invoice, receipt, or financial document, return {"not_invoice": true}."""

_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fetch_thread_messages(inbox_id: str, thread_id: str) -> list[dict]:
    """Fetch messages from an AgentMail thread. Returns a simplified list."""
    try:
        data = agentmail_get(f"/inboxes/{inbox_id}/threads/{thread_id}")
        return [
            {
                "from": m.get("from"),
                "subject": m.get("subject"),
                "preview": m.get("preview") or m.get("text", "")[:300],
                "timestamp": m.get("timestamp"),
            }
            for m in data.get("messages", [])
        ]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_action_tools(user_id: str) -> list:
    """Factory that returns all action tools scoped to a user.

    Args:
        user_id: UUID of the authenticated user.

    Returns:
        List of LangChain @tool-decorated functions.
    """

    # Look up the user's AgentMail inbox once
    _settings = (
        supabase.table("user_settings")
        .select("agentmail_inbox")
        .eq("id", user_id)
        .execute()
    )
    _inbox_id = _settings.data[0].get("agentmail_inbox") if _settings.data else None

    # ---- create_or_update_contact -------------------------------------------------

    @tool
    def create_or_update_contact(
        email: str,
        sender_type: str = "unknown",
        reachable: bool = True,
        display_name: str | None = None,
    ) -> dict:
        """Create or update an email contact classification.

        Call this for the email sender after determining whether they are
        a vendor (sends invoices), coworker (forwards invoices), or unknown.
        Set reachable to false for noreply@ or automated senders.
        """
        # Check if contact already exists
        existing = (
            supabase.table("email_contacts")
            .select("id, sender_type, reachable")
            .eq("user_id", user_id)
            .eq("email", email.lower())
            .execute()
        )

        if existing.data:
            # Update if classification changed
            updates = {"updated_at": "now()"}
            if sender_type != "unknown":
                updates["sender_type"] = sender_type
            if display_name:
                updates["display_name"] = display_name
            updates["reachable"] = reachable

            result = (
                supabase.table("email_contacts")
                .update(updates)
                .eq("id", existing.data[0]["id"])
                .execute()
            )
            return result.data[0]
        else:
            # Create new contact
            result = (
                supabase.table("email_contacts")
                .insert({
                    "user_id": user_id,
                    "email": email.lower(),
                    "display_name": display_name,
                    "sender_type": sender_type,
                    "reachable": reachable,
                })
                .execute()
            )
            return result.data[0]

    # ---- extract_invoice_data -------------------------------------------

    @tool
    def extract_invoice_data(
        attachment_path: str | None = None,
        email_body: str | None = None,
        email_subject: str | None = None,
    ) -> dict:
        """Extract structured invoice fields from a document or email body.

        Pass the attachment path (in Supabase Storage) and/or the email body.
        If an attachment is provided, the document is downloaded and sent to
        the LLM for extraction. The email body provides additional context.
        Returns extracted fields plus a document_hash if a file was processed.
        """
        content_blocks = []
        doc_hash = None

        # Download and encode the attachment if provided
        if attachment_path:
            ext = "." + attachment_path.rsplit(".", 1)[-1].lower() if "." in attachment_path else ""
            mime_type = _MIME_TYPES.get(ext)
            if not mime_type:
                return {"error": f"Unsupported file type: {ext}"}

            try:
                file_bytes = supabase.storage.from_("invoices-bucket").download(attachment_path)
            except Exception as e:
                return {"error": f"Failed to download attachment: {e}"}

            doc_hash = hashlib.sha256(file_bytes).hexdigest()
            b64_data = base64.b64encode(file_bytes).decode()

            if mime_type == "application/pdf":
                content_blocks.append({
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": b64_data,
                    },
                })
            else:
                content_blocks.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": b64_data,
                    },
                })

        # Add email context as text
        context_parts = []
        if email_subject:
            context_parts.append(f"Email subject: {email_subject}")
        if email_body:
            context_parts.append(f"Email body: {email_body[:1000]}")

        prompt_text = "Extract all invoice data from the provided document."
        if context_parts:
            prompt_text += "\n\nAdditional context from the email:\n" + "\n".join(context_parts)
        if not attachment_path:
            prompt_text = (
                "No document attached. Extract whatever invoice data you can "
                "from the email content below.\n\n" + "\n".join(context_parts)
            )

        content_blocks.append({"type": "text", "text": prompt_text})

        llm = get_llm(temperature=0, max_tokens=2048)
        try:
            response = llm.invoke([
                SystemMessage(content=_EXTRACT_SYSTEM),
                HumanMessage(content=content_blocks),
            ])
        except Exception as e:
            return {"error": f"Extraction failed: {e}"}

        # Parse the JSON response
        text = response.content
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            raw = match.group(1)
        else:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            raw = match.group(0) if match else None

        if not raw:
            return {"error": "Could not parse extraction response"}

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {"error": "Invalid JSON in extraction response"}

        if data.get("not_invoice"):
            return {"not_invoice": True}

        # Add document hash
        data["document_hash"] = doc_hash
        return data

    # ---- check_duplicate ------------------------------------------------

    @tool
    def check_duplicate(
        vendor_name: str,
        total: float | None = None,
        invoice_date: str | None = None,
        invoice_number: str | None = None,
        document_hash: str | None = None,
        email_context: str | None = None,
    ) -> dict:
        """Check if a similar invoice already exists before creating a new one.

        Pass whatever fields you extracted from the new invoice, plus the
        email context (subject, body, sender) for better comparison.
        Returns a verdict: "new" (safe to create), "duplicate" (skip),
        or "correction" (update the existing invoice instead).
        """
        # Layer 1: Hash check (instant, no LLM)
        if document_hash:
            result = (
                supabase.table("invoices")
                .select("id, vendor_name, total, invoice_date, invoice_number")
                .eq("user_id", user_id)
                .eq("document_hash", document_hash)
                .execute()
            )
            if result.data:
                match = result.data[0]
                return {
                    "verdict": "duplicate",
                    "matched_invoice_id": match["id"],
                    "reason": f"Exact document match (same file hash) with existing invoice from {match.get('vendor_name', 'unknown')}",
                }

        # Layer 2: Candidate search
        candidates = []
        seen_ids = set()
        fields = (
            "id, vendor_name, total, invoice_date, invoice_number, "
            "currency, description, processing_status, created_at"
        )

        if vendor_name:
            result = (
                supabase.table("invoices")
                .select(fields)
                .eq("user_id", user_id)
                .ilike("vendor_name", vendor_name)
                .execute()
            )
            for inv in result.data:
                if inv["id"] not in seen_ids:
                    candidates.append(inv)
                    seen_ids.add(inv["id"])

        if invoice_number:
            result = (
                supabase.table("invoices")
                .select(fields)
                .eq("user_id", user_id)
                .eq("invoice_number", invoice_number)
                .execute()
            )
            for inv in result.data:
                if inv["id"] not in seen_ids:
                    candidates.append(inv)
                    seen_ids.add(inv["id"])

        if not candidates:
            return {
                "verdict": "new",
                "matched_invoice_id": None,
                "reason": "No matching invoices found",
            }

        # Fetch thread context for each candidate
        if _inbox_id:
            for cand in candidates:
                threads = (
                    supabase.table("invoice_threads")
                    .select("thread_id")
                    .eq("invoice_id", cand["id"])
                    .execute()
                )
                thread_messages = []
                for t in threads.data:
                    thread_messages.extend(
                        _fetch_thread_messages(_inbox_id, t["thread_id"])
                    )
                cand["thread_history"] = thread_messages

        # Layer 3: LLM verdict
        new_invoice = {
            "vendor_name": vendor_name,
            "total": total,
            "invoice_date": invoice_date,
            "invoice_number": invoice_number,
            "email_context": email_context,
        }

        llm = get_llm(temperature=0, max_tokens=256)
        response = llm.invoke([
            SystemMessage(content=_DEDUP_SYSTEM),
            HumanMessage(
                content=(
                    f"New invoice:\n{json.dumps(new_invoice)}\n\n"
                    f"Existing candidates:\n{json.dumps(candidates, default=str)}"
                )
            ),
        ])

        try:
            verdict_match = re.search(r"\{.*\}", response.content, re.DOTALL)
            if verdict_match:
                return json.loads(verdict_match.group(0))
        except (json.JSONDecodeError, AttributeError):
            pass

        return {
            "verdict": "new",
            "matched_invoice_id": None,
            "reason": "Could not determine — treating as new",
        }

    # ---- create_invoice -------------------------------------------------

    REQUIRED_SENDER_FIELDS = {"vendor_name", "total", "invoice_date", "currency"}

    @tool
    def create_invoice(
        vendor_name: str | None = None,
        total: float | None = None,
        invoice_date: str | None = None,
        currency: str | None = None,
        invoice_number: str | None = None,
        subtotal: float | None = None,
        vat: float | None = None,
        due_date: str | None = None,
        description: str | None = None,
        line_items: list | None = None,
        document_path: str | None = None,
        document_hash: str | None = None,
        thread_id: str | None = None,
    ) -> dict:
        """Create a new invoice with whatever fields were extracted.

        Pass all fields you have — missing ones stay null and can be
        filled later. Pass thread_id to link the invoice to the email
        thread it came from. Returns the full created invoice including its id.
        Always call check_duplicate before this tool.
        """
        row = {
            "user_id": user_id,
            "vendor_name": vendor_name,
            "total": total,
            "invoice_date": invoice_date,
            "currency": currency,
            "invoice_number": invoice_number,
            "subtotal": subtotal,
            "vat": vat,
            "due_date": due_date,
            "description": description,
            "line_items": line_items,
            "document_path": document_path,
            "document_hash": document_hash,
        }

        # processing_status is set automatically by DB trigger

        result = (
            supabase.table("invoices")
            .insert(row)
            .execute()
        )
        invoice = result.data[0]

        # Link to thread if provided (ignore if already linked)
        if thread_id:
            try:
                supabase.table("invoice_threads").insert({
                    "invoice_id": invoice["id"],
                    "thread_id": thread_id,
                }).execute()
            except Exception:
                pass

        return invoice

    # ---- update_invoice -------------------------------------------------

    UPDATABLE_FIELDS = {
        "vendor_name", "total", "invoice_date", "currency",
        "invoice_number", "subtotal", "vat", "due_date",
        "description", "line_items", "document_path", "document_hash",
        "payment_status",
    }

    @tool
    def update_invoice(
        invoice_id: str,
        updates: dict,
        thread_id: str | None = None,
    ) -> dict:
        """Update specific fields on an existing invoice.

        Only pass the fields that changed — existing values are preserved.
        Used for corrections (e.g., sender replies with the correct total)
        or filling in fields that were null. Pass thread_id to link an
        additional email thread to the invoice.
        """
        # Only allow known updatable fields
        clean = {k: v for k, v in updates.items() if k in UPDATABLE_FIELDS}

        if not clean:
            return {"error": "No valid fields to update"}

        clean["updated_at"] = "now()"

        # Apply the update
        result = (
            supabase.table("invoices")
            .update(clean)
            .eq("id", invoice_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return {"error": "Invoice not found or access denied"}

        # processing_status is updated automatically by DB trigger
        updated = result.data[0]

        # Link to thread if provided (ignore if already linked)
        if thread_id:
            try:
                supabase.table("invoice_threads").insert({
                    "invoice_id": invoice_id,
                    "thread_id": thread_id,
                }).execute()
            except Exception:
                pass

        return updated

    # ---- assign_invoice -------------------------------------------------

    @tool
    def assign_invoice(
        invoice_id: str,
        project_id: str,
        category_id: str,
    ) -> dict:
        """Assign an invoice to a project and expense category.

        Sets project_id and category_id on the invoice. If the invoice has
        a document, moves it in storage from unassigned/ to the project folder.
        Call this after reasoning about which project and category fit best
        using get_projects, get_categories, get_project_documents, and
        get_invoices_by_vendor.
        """
        # Update the invoice row
        result = (
            supabase.table("invoices")
            .update({
                "project_id": project_id,
                "category_id": category_id,
                "updated_at": "now()",
            })
            .eq("id", invoice_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return {"error": "Invoice not found or access denied"}

        invoice = result.data[0]

        # Move document in storage if it exists and is in unassigned/
        doc_path = invoice.get("document_path")
        if doc_path and "/unassigned/" in doc_path:
            new_path = doc_path.replace("/unassigned/", f"/{project_id}/")
            bucket = supabase.storage.from_("invoices-bucket")
            try:
                bucket.move(doc_path, new_path)
                # Update the path on the invoice
                result = (
                    supabase.table("invoices")
                    .update({"document_path": new_path})
                    .eq("id", invoice_id)
                    .eq("user_id", user_id)
                    .execute()
                )
                invoice = result.data[0]
            except Exception:
                # File move failed — invoice is still assigned, just not moved
                invoice["_storage_move_error"] = True

        return invoice

    # ---- create_project -------------------------------------------------

    @tool
    def create_project(
        name: str,
        budget: float | None = None,
        description: str | None = None,
    ) -> dict:
        """Create a new project for the user.

        Use this when the user asks to create a new project, e.g.
        'create a project called Brighton Shoot with a £20k budget'.
        Returns the created project including its id.
        """
        row = {
            "user_id": user_id,
            "name": name,
            "status": "Active",
        }
        if budget is not None:
            row["budget"] = budget
        if description:
            row["description"] = description

        result = (
            supabase.table("projects")
            .insert(row)
            .execute()
        )
        return result.data[0]

    # ---- send_reply -----------------------------------------------------

    @tool
    def send_reply(
        message_id: str,
        body: str,
        invoice_ids_with_follow_up: list[str] | None = None,
    ) -> dict:
        """Send a reply on an existing email thread via AgentMail.

        Replies to the specified message. If invoice_ids_with_follow_up is
        provided, atomically increments follow_up_count and sets
        last_followed_up_at on each of those invoices.

        Returns the AgentMail response (message_id, thread_id) plus a
        follow_up_updated flag.
        """
        if not _inbox_id:
            return {"error": "No AgentMail inbox configured for this user"}

        # Send the reply via AgentMail
        try:
            reply_result = agentmail_post(
                f"/inboxes/{_inbox_id}/messages/{message_id}/reply",
                {"text": body},
            )
        except Exception as e:
            return {"error": f"Failed to send reply: {e}"}

        # Update follow-up tracking on invoices if needed
        follow_up_updated = False
        if invoice_ids_with_follow_up:
            for inv_id in invoice_ids_with_follow_up:
                try:
                    inv_result = (
                        supabase.table("invoices")
                        .select("follow_up_count")
                        .eq("id", inv_id)
                        .eq("user_id", user_id)
                        .execute()
                    )
                    if inv_result.data:
                        current_count = inv_result.data[0].get("follow_up_count", 0)
                        supabase.table("invoices").update({
                            "follow_up_count": current_count + 1,
                            "last_followed_up_at": "now()",
                            "updated_at": "now()",
                        }).eq("id", inv_id).eq("user_id", user_id).execute()
                        follow_up_updated = True
                except Exception:
                    pass

        return {
            **reply_result,
            "follow_up_updated": follow_up_updated,
        }

    return [
        create_or_update_contact,
        extract_invoice_data,
        check_duplicate,
        create_invoice,
        update_invoice,
        assign_invoice,
        create_project,
        send_reply,
    ]
