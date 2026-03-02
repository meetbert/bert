# app/db/crud.py
#
# All Supabase CRUD operations.
# Business logic (Gemini, Gmail) lives in services/.
# This layer only talks to the database.

import logging
import os
from typing import Optional

from app.db.database import supabase

logger = logging.getLogger(__name__)

# Single-user deployment: every insert is attributed to this user.
# Set SUPABASE_USER_ID in .env (find your UUID in Supabase Dashboard → Auth → Users).
_USER_ID = os.getenv("SUPABASE_USER_ID", "")

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

def get_project_id(project_name: str) -> Optional[str]:
    response = (
        supabase.table("projects")
        .select("id")
        .eq("name", project_name)
        .execute()
    )
    return response.data[0]["id"] if response.data else None


def get_projects() -> list[dict]:
    """Return all projects ordered by name, including AI-matching hints."""
    response = (
        supabase.table("projects")
        .select("id, name, budget, status, description, known_vendors, known_locations")
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


def add_project(name: str, budget: float, status: str = "Active") -> dict:
    if not _USER_ID:
        raise ValueError(
            "SUPABASE_USER_ID is not set in .env — "
            "find your UUID in Supabase Dashboard → Authentication → Users."
        )
    response = (
        supabase.table("projects")
        .insert({"name": name, "budget": budget, "status": status, "user_id": _USER_ID})
        .execute()
    )
    logger.info("Added project: %s (budget=%s)", name, budget)
    return response.data[0] if response.data else {}


def update_project(project_id: str, name: str, budget: float, status: str) -> dict:
    response = (
        supabase.table("projects")
        .update({"name": name, "budget": budget, "status": status})
        .eq("id", project_id)
        .execute()
    )
    logger.info("Updated project %s", project_id)
    return response.data[0] if response.data else {}


def delete_project(project_id: str) -> None:
    supabase.table("projects").delete().eq("id", project_id).execute()
    logger.info("Deleted project: %s", project_id)


# ── Invoices ────────────────────────────────────────────────────────────────

def is_duplicate(data: dict) -> bool:
    """Check whether this invoice already exists (vendor + invoice# + total)."""
    vendor     = str(data.get("vendor", "")).strip()
    inv_number = str(data.get("invoice_number", "")).strip()

    if not vendor or not inv_number:
        return False

    response = (
        supabase.table("invoices")
        .select("total")
        .ilike("vendor_name", vendor)
        .eq("invoice_number", inv_number)
        .execute()
    )
    if not response.data:
        return False

    total = _to_float(data.get("total"))
    if total is None:
        return True  # same vendor+invoice# with no total → treat as duplicate

    for row in response.data:
        row_total = _to_float(row.get("total"))
        if row_total is not None and abs(row_total - total) < 0.01:
            return True

    return False


def insert_invoice(data: dict) -> Optional[dict]:
    """
    Insert one invoice into Supabase.
    Maps the flat dict from invoice_processor to DB column names.
    Returns the inserted row, or None if duplicate.
    """
    if not _USER_ID:
        raise ValueError(
            "SUPABASE_USER_ID is not set in .env — "
            "find your UUID in Supabase Dashboard → Authentication → Users."
        )

    if is_duplicate(data):
        logger.info(
            "Duplicate skipped: vendor=%s inv=%s",
            data.get("vendor"), data.get("invoice_number"),
        )
        return None

    # Resolve foreign keys
    project_name = data.get("project", "Unassigned")
    project_id = (
        get_project_id(project_name)
        if project_name and project_name != "Unassigned"
        else None
    )
    category_id = get_category_id(data.get("category", "Other"))

    raw_status = data.get("payment_status", "Unpaid")
    db_status  = _STATUS_TO_DB.get(raw_status, "unpaid")

    row = {
        "user_id":           _USER_ID,
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
        "processing_status": "processed",
    }

    try:
        response = supabase.table("invoices").insert(row).execute()
        logger.info(
            "Inserted invoice: vendor=%s total=%s", data.get("vendor"), data.get("total")
        )
        return response.data[0] if response.data else row
    except Exception as e:
        logger.error("Insert failed: %s", e)
        raise


def get_invoices(
    project_id: Optional[str] = None,
    category: Optional[str] = None,
    payment_status: Optional[str] = None,
) -> list[dict]:
    """Fetch invoices from Supabase, optionally filtered."""
    query = (
        supabase.table("invoices")
        .select("*, projects(name), invoice_categories(name)")
        .order("invoice_date", desc=True)
    )

    if project_id:
        query = query.eq("project_id", project_id)
    if payment_status:
        db_status = _STATUS_TO_DB.get(payment_status, payment_status.lower())
        query = query.eq("payment_status", db_status)

    response = query.execute()

    rows = []
    for r in (response.data or []):
        db_status = r.get("payment_status") or "unpaid"

        # Filter by category name (post-fetch since it's a join)
        cat_name = (r.get("invoice_categories") or {}).get("name") or "Other"
        if category and cat_name != category:
            continue

        rows.append({
            "id":             r["id"],
            "vendor":         r.get("vendor_name") or "",
            "date":           r.get("invoice_date") or "",
            "invoice_number": r.get("invoice_number") or "",
            "currency":       r.get("currency") or "",
            "subtotal":       r.get("subtotal"),
            "vat":            r.get("vat"),
            "total":          r.get("total"),
            "due_date":       r.get("due_date") or "",
            "description":    r.get("description") or "",
            "line_items":     r.get("line_items"),
            "project":        (r.get("projects") or {}).get("name") or "Unassigned",
            "category":       cat_name,
            "document_path":  r.get("document_path") or "",
            "payment_status": _STATUS_FROM_DB.get(db_status, db_status.title()),
        })
    return rows


def get_invoice_by_id(invoice_id: str) -> Optional[dict]:
    """Fetch a single invoice by UUID."""
    response = (
        supabase.table("invoices")
        .select("*, projects(name), invoice_categories(name)")
        .eq("id", invoice_id)
        .execute()
    )
    if not response.data:
        return None

    r = response.data[0]
    db_status = r.get("payment_status") or "unpaid"
    return {
        "id":             r["id"],
        "vendor":         r.get("vendor_name") or "",
        "date":           r.get("invoice_date") or "",
        "invoice_number": r.get("invoice_number") or "",
        "currency":       r.get("currency") or "",
        "subtotal":       r.get("subtotal"),
        "vat":            r.get("vat"),
        "total":          r.get("total"),
        "due_date":       r.get("due_date") or "",
        "description":    r.get("description") or "",
        "line_items":     r.get("line_items"),
        "project":        (r.get("projects") or {}).get("name") or "Unassigned",
        "category":       (r.get("invoice_categories") or {}).get("name") or "Other",
        "document_path":  r.get("document_path") or "",
        "payment_status": _STATUS_FROM_DB.get(db_status, db_status.title()),
    }


def update_invoice(invoice_id: str, fields: dict) -> dict:
    """
    Update project, category, and/or payment_status on an invoice by UUID.
    Accepts app-level field names: "project", "category", "payment_status".
    """
    update_data: dict = {}

    if "project" in fields:
        pname = fields["project"]
        update_data["project_id"] = (
            get_project_id(pname)
            if pname and pname != "Unassigned"
            else None
        )

    if "category" in fields:
        update_data["category_id"] = get_category_id(fields["category"])

    if "payment_status" in fields:
        update_data["payment_status"] = _STATUS_TO_DB.get(
            fields["payment_status"], "unpaid"
        )

    if not update_data:
        return {}

    response = (
        supabase.table("invoices")
        .update(update_data)
        .eq("id", invoice_id)
        .execute()
    )
    logger.info("Updated invoice %s: %s", invoice_id, list(update_data.keys()))
    return response.data[0] if response.data else {}


def delete_invoice(invoice_id: str) -> None:
    supabase.table("invoices").delete().eq("id", invoice_id).execute()
    logger.info("Deleted invoice: %s", invoice_id)


# ── Vendor mappings ─────────────────────────────────────────────────────────
# vendor_mappings is not in the current Supabase schema.
# These functions fail gracefully until the table is added.

def get_vendor_map() -> dict[str, str]:
    """Return {vendor_name_lower: project_name}."""
    try:
        response = (
            supabase.table("vendor_mappings")
            .select("vendor_name, projects(name)")
            .execute()
        )
        mapping = {}
        for row in (response.data or []):
            vendor  = (row.get("vendor_name") or "").strip().lower()
            project = (row.get("projects") or {}).get("name", "")
            if vendor and project:
                mapping[vendor] = project
        return mapping
    except Exception as e:
        logger.debug("vendor_mappings not available: %s", e)
        return {}


def set_vendor_project(vendor: str, project: str) -> None:
    """Upsert a vendor → project mapping."""
    project_id = get_project_id(project)
    if not project_id:
        logger.warning("Cannot set vendor mapping: project '%s' not found", project)
        return
    try:
        supabase.table("vendor_mappings").upsert(
            {"vendor_name": vendor.strip(), "project_id": project_id},
            on_conflict="vendor_name",
        ).execute()
        logger.info("Vendor mapping: %s → %s", vendor.strip(), project)
    except Exception as e:
        logger.warning("vendor_mappings not available: %s", e)


# ── Dashboard stats ─────────────────────────────────────────────────────────

def get_dashboard_stats() -> dict:
    """Return aggregate KPI data for the dashboard."""
    invoices = get_invoices()
    projects = get_projects()

    total_spend = sum(float(inv.get("total") or 0) for inv in invoices)
    unpaid = [i for i in invoices if i.get("payment_status") == "Unpaid"]
    overdue = [
        i for i in unpaid
        if i.get("due_date") and i["due_date"] < _today_str()
    ]
    active_projects = [p for p in projects if p.get("status") == "Active"]

    spend_by_category: dict[str, float] = {}
    spend_by_project: dict[str, float] = {}
    for inv in invoices:
        cat = inv.get("category") or "Other"
        proj = inv.get("project") or "Unassigned"
        amount = float(inv.get("total") or 0)
        spend_by_category[cat] = spend_by_category.get(cat, 0) + amount
        spend_by_project[proj] = spend_by_project.get(proj, 0) + amount

    return {
        "total_invoices":    len(invoices),
        "total_spend":       round(total_spend, 2),
        "active_projects":   len(active_projects),
        "unpaid_count":      len(unpaid),
        "overdue_count":     len(overdue),
        "spend_by_category": spend_by_category,
        "spend_by_project":  spend_by_project,
    }


def _today_str() -> str:
    from datetime import date
    return date.today().isoformat()
