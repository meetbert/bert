# app/db.py
#
# Supabase client + all CRUD operations.

import logging
import os
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logger = logging.getLogger(__name__)


# ── Supabase client ───────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a cached Supabase client using the service role key."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )

    return create_client(url, key)


# Convenience alias used throughout the app
supabase: Client = get_supabase()


# ── Status normalisation ────────────────────────────────────────────────────

_STATUS_TO_DB = {"Unpaid": "unpaid", "Paid": "paid", "Overdue": "overdue"}
_STATUS_FROM_DB = {
    "unpaid": "Unpaid",
    "paid": "Paid",
    "overdue": "Overdue",
    "partially_paid": "Partially Paid",
}

CATEGORIES = [
    "Travel", "Accommodation", "Contributor Fees", "Location Rental",
    "Crew/Freelance", "Equipment", "Post-Production", "Insurance",
    "Music/Licensing", "Office/Admin", "Other",
]


# ── Internal helpers ────────────────────────────────────────────────────────

def _to_float(v) -> Optional[float]:
    try:
        return float(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def _to_date(v) -> Optional[str]:
    """Return YYYY-MM-DD string or None."""
    return str(v).strip() if v and str(v).strip() else None


# ── Categories ──────────────────────────────────────────────────────────────

def seed_categories() -> None:
    """Ensure all fixed categories exist in the invoice_categories table."""
    for name in CATEGORIES:
        try:
            supabase.table("invoice_categories").upsert(
                {"name": name}, on_conflict="name"
            ).execute()
        except Exception as e:
            logger.warning("Could not seed category '%s': %s", name, e)


def get_category_id(category_name: str) -> Optional[str]:
    response = (
        supabase.table("invoice_categories")
        .select("id")
        .eq("name", category_name)
        .execute()
    )
    return response.data[0]["id"] if response.data else None


# ── Projects ────────────────────────────────────────────────────────────────

def get_project_id(project_name: str, user_id: str) -> Optional[str]:
    response = (
        supabase.table("projects")
        .select("id")
        .eq("name", project_name)
        .eq("user_id", user_id)
        .execute()
    )
    return response.data[0]["id"] if response.data else None


def get_projects(user_id: str) -> list[dict]:
    """Return all projects for a user, ordered by name."""
    response = (
        supabase.table("projects")
        .select("id, name, budget, status, description, known_vendors, known_locations")
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )
    return [
        {
            "id":              row["id"],
            "name":            row["name"],
            "budget":          float(row.get("budget") or 0),
            "status":          row.get("status") or "Active",
            "description":     row.get("description") or "",
            "known_vendors":   row.get("known_vendors") or [],
            "known_locations": row.get("known_locations") or [],
        }
        for row in (response.data or [])
    ]


# ── Invoices ────────────────────────────────────────────────────────────────

def is_duplicate(data: dict, user_id: str) -> bool:
    """Check whether this invoice already exists for this user."""
    vendor     = str(data.get("vendor", "")).strip()
    inv_number = str(data.get("invoice_number", "")).strip()

    if not vendor or not inv_number:
        return False

    response = (
        supabase.table("invoices")
        .select("total")
        .eq("user_id", user_id)
        .ilike("vendor_name", vendor)
        .eq("invoice_number", inv_number)
        .execute()
    )
    if not response.data:
        return False

    total = _to_float(data.get("total"))
    if total is None:
        return True

    for row in response.data:
        row_total = _to_float(row.get("total"))
        if row_total is not None and abs(row_total - total) < 0.01:
            return True

    return False


def insert_invoice(data: dict, user_id: str) -> Optional[dict]:
    """
    Insert one invoice into Supabase for a specific user.
    Returns the inserted row, or None if duplicate.
    """
    if is_duplicate(data, user_id):
        logger.info(
            "Duplicate skipped: vendor=%s inv=%s",
            data.get("vendor"), data.get("invoice_number"),
        )
        return None

    project_name = data.get("project", "Unassigned")
    project_id = (
        get_project_id(project_name, user_id)
        if project_name and project_name != "Unassigned"
        else None
    )
    category_id = get_category_id(data.get("category", "Other"))

    raw_status = data.get("payment_status", "Unpaid")
    db_status  = _STATUS_TO_DB.get(raw_status, "unpaid")

    row = {
        "user_id":           user_id,
        "vendor_name":       data.get("vendor") or None,
        "invoice_date":      _to_date(data.get("date")),
        "invoice_number":    data.get("invoice_number") or None,
        "currency":          data.get("currency") or None,
        "subtotal":          _to_float(data.get("subtotal")),
        "vat":               _to_float(data.get("vat")),
        "total":             _to_float(data.get("total")),
        "due_date":          _to_date(data.get("due_date")),
        "description":       data.get("description") or None,
        "line_items":        data.get("line_items") or None,
        "project_id":        project_id,
        "category_id":       category_id,
        "document_path":     data.get("source_file") or None,
        "payment_status":    db_status,
    }

    try:
        response = supabase.table("invoices").insert(row).execute()
        logger.info(
            "Inserted invoice: vendor=%s total=%s user=%s",
            data.get("vendor"), data.get("total"), user_id,
        )
        return response.data[0] if response.data else row
    except Exception as e:
        logger.error("Insert failed: %s", e)
        raise


