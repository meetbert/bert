# app/api/routes/dashboard.py

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.db import crud
from app.models.schemas import DashboardStats
from app.services.currency_service import convert_invoice_list

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
log    = logging.getLogger(__name__)


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    _user = Depends(get_current_user),
):
    """
    Return KPI aggregates for the dashboard overview:
      - total_invoices
      - total_spend
      - active_projects
      - unpaid_count
      - overdue_count
      - spend_by_category  (dict)
      - spend_by_project   (dict)
    """
    return crud.get_dashboard_stats()


@router.get("/invoices-by-project")
async def invoices_by_project(
    project_id: Optional[str] = Query(default=None),
    currency:   Optional[str] = Query(default=None,
                                      description="Convert totals to this currency (e.g. EUR)"),
    _user = Depends(get_current_user),
):
    """
    Return invoices for a specific project (or all projects if omitted),
    optionally with totals converted to a single currency.
    """
    invoices = crud.get_invoices(project_id=project_id)

    if currency:
        invoices = convert_invoice_list(invoices, to_currency=currency.upper())

    return {"invoices": invoices, "count": len(invoices)}


@router.get("/upcoming-payments")
async def upcoming_payments(
    days: int = Query(default=30, ge=1, le=365),
    _user = Depends(get_current_user),
):
    """
    Return unpaid invoices with due dates within the next `days` days.
    Also returns separately overdue invoices (due date in the past).
    """
    from datetime import date, timedelta

    today    = date.today()
    cutoff   = today + timedelta(days=days)
    today_s  = today.isoformat()
    cutoff_s = cutoff.isoformat()

    all_invoices = crud.get_invoices(payment_status="Unpaid")

    upcoming = []
    overdue  = []
    for inv in all_invoices:
        due = inv.get("due_date")
        if not due:
            continue
        if due < today_s:
            overdue.append(inv)
        elif due <= cutoff_s:
            upcoming.append(inv)

    # Sort chronologically
    upcoming.sort(key=lambda i: i.get("due_date") or "")
    overdue.sort(key=lambda i: i.get("due_date") or "")

    return {
        "upcoming": upcoming,
        "overdue":  overdue,
    }
