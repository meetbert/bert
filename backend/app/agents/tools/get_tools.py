"""Read-only tools for querying Supabase.

All tools are created via ``create_get_tools(user_id)`` which captures
``user_id`` in a closure so the LLM never sees it.

Note: Tool docstrings are sent to the LLM as tool descriptions.
      Keep them concise and written for the model, not developers.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone

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
    def search_invoices(
        vendor_name: str = "",
        keyword: str = "",
        payment_status: str = "",
        date_from: str = "",
        date_to: str = "",
        min_amount: float = 0,
        max_amount: float = 0,
        currency: str = "",
    ) -> list[dict]:
        """Search invoices with optional filters. All parameters are optional.
        vendor_name: partial match on vendor name (e.g. 'Tom Brown').
        keyword: search term matched against description and line items (e.g. 'paint', 'camera').
        payment_status: filter by status — 'unpaid', 'paid', or 'overdue'.
        date_from / date_to: YYYY-MM-DD, filter by invoice_date.
        min_amount / max_amount: filter by total amount (0 = no limit).
        currency: 3-letter ISO code to filter by currency (e.g. 'GBP', 'USD').
        Returns matching invoices sorted newest-first."""
        query = (
            supabase.table("invoices")
            .select("id, vendor_name, total, invoice_date, due_date, currency, invoice_number, payment_status, project_id, description, line_items")
            .eq("user_id", user_id)
        )
        if vendor_name:
            query = query.ilike("vendor_name", f"%{vendor_name}%")
        if payment_status:
            query = query.eq("payment_status", payment_status)
        if date_from:
            query = query.gte("invoice_date", date_from)
        if date_to:
            query = query.lte("invoice_date", date_to)
        if min_amount > 0:
            query = query.gte("total", min_amount)
        if max_amount > 0:
            query = query.lte("total", max_amount)
        if currency:
            query = query.eq("currency", currency.upper())
        result = query.order("invoice_date", desc=True).execute()
        invoices = result.data or []

        if keyword:
            kw = keyword.lower()
            invoices = [
                inv for inv in invoices
                if kw in str(inv.get("description") or "").lower()
                or kw in str(inv.get("line_items") or "").lower()
            ]

        return invoices

    @tool
    def get_invoices_by_project(project_id: str, payment_status: str = "") -> list[dict]:
        """Get all invoices for a specific project UUID.
        Optionally filter by payment_status ('unpaid', 'paid', 'overdue').
        Returns id, vendor_name, total, invoice_date, currency, invoice_number, payment_status."""
        query = (
            supabase.table("invoices")
            .select("id, vendor_name, total, invoice_date, due_date, currency, invoice_number, payment_status")
            .eq("user_id", user_id)
            .eq("project_id", project_id)
        )
        if payment_status:
            query = query.eq("payment_status", payment_status)
        result = query.order("invoice_date", desc=True).execute()
        return result.data or []

    @tool
    def get_vendor_summary(vendor_name: str) -> dict:
        """Get a financial summary for a vendor — total invoiced, total paid, and total outstanding.
        Use this when the user asks how much they owe a vendor, or for an overview of a vendor relationship.
        vendor_name: partial match (e.g. 'Tom Brown', 'Arri')."""
        result = (
            supabase.table("invoices")
            .select("id, invoice_number, total, payment_status, invoice_date, currency")
            .eq("user_id", user_id)
            .ilike("vendor_name", f"%{vendor_name}%")
            .order("invoice_date", desc=True)
            .execute()
        )
        invoices = result.data or []
        if not invoices:
            return {"found": False, "vendor_name": vendor_name}

        total_invoiced = sum(float(inv.get("total") or 0) for inv in invoices)
        total_paid = sum(float(inv.get("total") or 0) for inv in invoices if inv.get("payment_status") == "paid")
        total_outstanding = sum(float(inv.get("total") or 0) for inv in invoices if inv.get("payment_status") in ("unpaid", "overdue"))

        return {
            "found": True,
            "vendor_name": vendor_name,
            "invoice_count": len(invoices),
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
            "invoices": [
                {
                    "id": inv["id"],
                    "invoice_number": inv.get("invoice_number"),
                    "total": inv.get("total"),
                    "payment_status": inv.get("payment_status"),
                    "invoice_date": inv.get("invoice_date"),
                    "currency": inv.get("currency"),
                }
                for inv in invoices
            ],
        }

    @tool
    def get_spend_summary(date_from: str = "", date_to: str = "") -> dict:
        """Summarise total spend across all invoices in a date range.
        date_from / date_to: YYYY-MM-DD. Leave blank for all time.
        Returns total_spend, total_paid, total_outstanding, spend_by_project
        (list of project name + total), and top_vendors (top 5 by spend).
        Use this for questions like 'what did I spend last month?' or 'how much have I spent this year?'"""
        query = (
            supabase.table("invoices")
            .select("total, payment_status, project_id, vendor_name, currency")
            .eq("user_id", user_id)
        )
        if date_from:
            query = query.gte("invoice_date", date_from)
        if date_to:
            query = query.lte("invoice_date", date_to)
        result = query.execute()
        invoices = result.data or []

        if not invoices:
            return {"found": False, "total_spend": 0}

        total_spend = sum(float(inv.get("total") or 0) for inv in invoices)
        total_paid = sum(float(inv.get("total") or 0) for inv in invoices if inv.get("payment_status") == "paid")
        total_outstanding = sum(float(inv.get("total") or 0) for inv in invoices if inv.get("payment_status") in ("unpaid", "overdue"))

        # Spend by project
        project_ids = list({inv["project_id"] for inv in invoices if inv.get("project_id")})
        project_names: dict[str, str] = {}
        if project_ids:
            proj_result = (
                supabase.table("projects")
                .select("id, name")
                .in_("id", project_ids)
                .execute()
            )
            project_names = {p["id"]: p["name"] for p in (proj_result.data or [])}

        by_project: dict[str, float] = defaultdict(float)
        for inv in invoices:
            pid = inv.get("project_id")
            name = project_names.get(pid, "Unassigned") if pid else "Unassigned"
            by_project[name] += float(inv.get("total") or 0)

        # Top vendors
        by_vendor: dict[str, float] = defaultdict(float)
        for inv in invoices:
            vendor = inv.get("vendor_name") or "Unknown"
            by_vendor[vendor] += float(inv.get("total") or 0)
        top_vendors = sorted(by_vendor.items(), key=lambda x: x[1], reverse=True)[:5]

        # Spend by currency
        by_currency: dict[str, float] = defaultdict(float)
        for inv in invoices:
            curr = inv.get("currency") or "Unknown"
            by_currency[curr] += float(inv.get("total") or 0)

        return {
            "found": True,
            "invoice_count": len(invoices),
            "total_spend": total_spend,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
            "spend_by_project": [{"project": k, "total": v} for k, v in sorted(by_project.items(), key=lambda x: x[1], reverse=True)],
            "top_vendors": [{"vendor": k, "total": v} for k, v in top_vendors],
            "spend_by_currency": [{"currency": k, "total": v} for k, v in sorted(by_currency.items(), key=lambda x: x[1], reverse=True)],
        }

    @tool
    def get_due_soon(days: int = 7) -> dict:
        """Get all unpaid and overdue invoices due within the next N days (default 7).
        Use this for 'what do I need to pay this week/month?' or 'what's coming up?'
        Returns a list of invoices with vendor, total, due_date, and payment_status,
        plus a grand total of what's owed."""
        today = datetime.now(timezone.utc).date()
        cutoff = today + timedelta(days=days)
        result = (
            supabase.table("invoices")
            .select("id, vendor_name, total, due_date, currency, invoice_number, payment_status, project_id")
            .eq("user_id", user_id)
            .in_("payment_status", ["unpaid", "overdue"])
            .lte("due_date", cutoff.isoformat())
            .order("due_date")
            .execute()
        )
        invoices = result.data or []
        total_due = sum(float(inv.get("total") or 0) for inv in invoices)
        return {
            "days_window": days,
            "invoice_count": len(invoices),
            "total_due": total_due,
            "invoices": invoices,
        }

    @tool
    def get_project_spend(project_id: str) -> dict:
        """Get budget vs actual spend for a project.
        Returns project name, budget, total_invoiced, total_paid, total_outstanding,
        and whether the project is over budget.
        Use this for 'am I over budget on X?' or 'what did project X cost in total?'"""
        proj_result = (
            supabase.table("projects")
            .select("id, name, budget, status")
            .eq("id", project_id)
            .eq("user_id", user_id)
            .execute()
        )
        project = proj_result.data[0] if proj_result.data else None
        if not project:
            return {"error": "Project not found"}

        inv_result = (
            supabase.table("invoices")
            .select("total, payment_status")
            .eq("user_id", user_id)
            .eq("project_id", project_id)
            .execute()
        )
        invoices = inv_result.data or []

        total_invoiced = sum(float(inv.get("total") or 0) for inv in invoices)
        total_paid = sum(float(inv.get("total") or 0) for inv in invoices if inv.get("payment_status") == "paid")
        total_outstanding = sum(float(inv.get("total") or 0) for inv in invoices if inv.get("payment_status") in ("unpaid", "overdue"))
        budget = float(project.get("budget") or 0)

        return {
            "project_name": project["name"],
            "budget": budget,
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
            "remaining_budget": budget - total_invoiced,
            "over_budget": total_invoiced > budget if budget > 0 else False,
            "invoice_count": len(invoices),
        }

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
        search_invoices,
        get_invoices_by_project,
        get_vendor_summary,
        get_spend_summary,
        get_due_soon,
        get_project_spend,
        get_projects,
        get_categories,
        get_project_documents,
        get_user_settings,
        get_follow_up_state,
    ]
