"""Read-only tools for querying Supabase.

All tools are created via ``create_get_tools(user_id)`` which captures
``user_id`` in a closure so the LLM never sees it.

Note: Tool docstrings are sent to the LLM as tool descriptions.
      Keep them concise and written for the model, not developers.
"""

from datetime import datetime, timezone

from langchain_core.tools import tool

from app.agents.config import supabase

# Fields the sender can be asked about — used by get_follow_up_state.
SENDER_FIELDS = ["vendor_name", "total", "invoice_date", "currency"]

# Minimum hours between follow-up emails to the same sender.
FOLLOW_UP_COOLDOWN_HOURS = 24


def create_get_tools(user_id: str) -> list:
    """Factory that returns all get tools scoped to a user.

    Args:
        user_id: UUID of the authenticated user. Baked into every
                 tool via closure so the LLM cannot override it.

    Returns:
        List of LangChain @tool-decorated functions.
    """

    # ------------------------------------------------------------------
    # Invoice tools
    # ------------------------------------------------------------------

    @tool
    def get_invoice(invoice_id: str) -> dict | None:
        """Fetch a single invoice by its database UUID (not the invoice_number).
        The invoice_id must be a UUID like '3f2a...'. Do NOT pass the
        human-readable invoice number (e.g. 'CI2023-001') — use
        get_invoices_by_vendor to find invoices by other fields.
        Returns all columns as a dict, or null if not found."""
        try:
            result = (
                supabase.table("invoices")
                .select("*")
                .eq("id", invoice_id)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception:
            return None
        return result.data[0] if result.data else None

    @tool
    def get_invoices_by_vendor(vendor_name: str) -> list[dict]:
        """Find all invoices from a given vendor (case-insensitive match).
        Useful for checking vendor history and past project assignments.
        Returns a list of invoice dicts, or an empty list if none match."""
        result = (
            supabase.table("invoices")
            .select("*")
            .eq("user_id", user_id)
            .ilike("vendor_name", vendor_name)
            .execute()
        )
        return result.data

    # ------------------------------------------------------------------
    # Project tools
    # ------------------------------------------------------------------

    @tool
    def get_projects() -> list[dict]:
        """List all active projects. Each project includes its category
        budgets (nested project_categories with category names)."""
        result = (
            supabase.table("projects")
            .select("*, project_categories(*, invoice_categories(name))")
            .eq("user_id", user_id)
            .eq("status", "Active")
            .execute()
        )
        return result.data

    @tool
    def get_categories(project_id: str) -> list[dict]:
        """List all categories and their budgets for a specific project.
        Each entry includes the category name and allocated budget."""
        result = (
            supabase.table("project_categories")
            .select("*, invoice_categories(name)")
            .eq("project_id", project_id)
            .execute()
        )
        return result.data

    @tool
    def get_project_documents(project_id: str) -> list[dict]:
        """List all onboarding documents (briefs, budgets, scripts) uploaded
        for a project. Use these to understand project context when deciding
        how to assign an invoice."""
        result = (
            supabase.table("project_documents")
            .select("*")
            .eq("project_id", project_id)
            .execute()
        )
        return result.data

    # ------------------------------------------------------------------
    # User tools
    # ------------------------------------------------------------------

    @tool
    def get_user_settings() -> dict | None:
        """Get the current user's settings including max_followups,
        base_currency, and notification preferences. Returns null if
        no settings exist."""
        result = (
            supabase.table("user_settings")
            .select("*")
            .eq("id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None

    # ------------------------------------------------------------------
    # Follow-up tools
    # ------------------------------------------------------------------

    @tool
    def get_follow_up_state(invoice_id: str, sender_email: str) -> dict:
        """Check whether a follow-up email to the sender is needed for an
        invoice. A follow-up is needed when invoice fields that the sender
        can answer (vendor_name, total, invoice_date, currency) are still
        missing.

        Pass the sender's email address so reachability can be checked
        against the email_contacts table.

        Returns should_follow_up (true only when ALL conditions are met):
        missing sender fields exist, sender is reachable, follow-up limit
        not reached, and at least 24h since the last follow-up.

        Also returns: missing_sender_fields, follow_up_count, max_followups,
        sender_reachable, cooldown_ok."""
        # Fetch the invoice
        result = (
            supabase.table("invoices")
            .select("*")
            .eq("id", invoice_id)
            .eq("user_id", user_id)
            .execute()
        )
        invoice = result.data[0] if result.data else None

        if not invoice:
            return {"error": "Invoice not found"}

        # Fetch user's max_followups (default 3)
        settings_result = (
            supabase.table("user_settings")
            .select("max_followups")
            .eq("id", user_id)
            .execute()
        )
        settings = settings_result.data[0] if settings_result.data else None
        max_followups = settings["max_followups"] if settings else 3

        # Look up sender reachability from email_contacts
        contact_result = (
            supabase.table("email_contacts")
            .select("reachable")
            .eq("user_id", user_id)
            .eq("email", sender_email.lower())
            .execute()
        )
        sender_reachable = (
            contact_result.data[0]["reachable"]
            if contact_result.data
            else True  # default reachable if contact not yet classified
        )

        # Which sender-askable fields are still NULL?
        missing_sender = [f for f in SENDER_FIELDS if invoice.get(f) is None]

        # Cooldown: don't follow up if last one was < 24 h ago
        last_followed_up = invoice.get("last_followed_up_at")
        cooldown_ok = True
        if last_followed_up:
            last_dt = datetime.fromisoformat(last_followed_up)
            hours_since = (
                (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
            )
            cooldown_ok = hours_since >= FOLLOW_UP_COOLDOWN_HOURS

        should_follow_up = (
            len(missing_sender) > 0
            and sender_reachable
            and invoice.get("follow_up_count", 0) < max_followups
            and cooldown_ok
        )

        return {
            "should_follow_up": should_follow_up,
            "missing_sender_fields": missing_sender,
            "follow_up_count": invoice.get("follow_up_count", 0),
            "max_followups": max_followups,
            "sender_reachable": sender_reachable,
            "cooldown_ok": cooldown_ok,
        }

    return [
        get_invoice,
        get_invoices_by_vendor,
        get_projects,
        get_categories,
        get_project_documents,
        get_user_settings,
        get_follow_up_state,
    ]
