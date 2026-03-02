# app/api/routes/dashboard.py

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_auth
from app.db import crud
from app.models.schemas import DashboardStats
from app.services.currency_service import convert_invoice_list

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
log    = logging.getLogger(__name__)


@router.get("/stats", response_model=DashboardStats)
async def get_stats(user: dict = Depends(require_auth)):
    return crud.get_dashboard_stats(user["id"])


@router.get("/invoices-by-project")
async def invoices_by_project(
    project_id: Optional[str] = Query(default=None),
    currency:   Optional[str] = Query(default=None),
    user: dict = Depends(require_auth),
):
    invoices = crud.get_invoices(user_id=user["id"], project_id=project_id)

    if currency:
        invoices = convert_invoice_list(invoices, to_currency=currency.upper())

    return {"invoices": invoices, "count": len(invoices)}


@router.get("/upcoming-payments")
async def upcoming_payments(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(require_auth),
):
    from datetime import date, timedelta

    today    = date.today()
    cutoff   = today + timedelta(days=days)
    today_s  = today.isoformat()
    cutoff_s = cutoff.isoformat()

    all_invoices = crud.get_invoices(user_id=user["id"], payment_status="Unpaid")

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

    upcoming.sort(key=lambda i: i.get("due_date") or "")
    overdue.sort(key=lambda i: i.get("due_date") or "")

    return {"upcoming": upcoming, "overdue": overdue}
