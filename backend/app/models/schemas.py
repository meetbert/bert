# app/models/schemas.py
#
# Pydantic request/response models for all API endpoints.

from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Shared enums ─────────────────────────────────────────────────────────────

VALID_CATEGORIES = [
    "Travel", "Accommodation", "Contributor Fees", "Location Rental",
    "Crew/Freelance", "Equipment", "Post-Production", "Insurance",
    "Music/Licensing", "Office/Admin", "Other",
]

VALID_PAYMENT_STATUSES = ["Unpaid", "Paid", "Overdue", "Partially Paid"]

VALID_DOC_TYPES = ["Invoice", "Receipt", "Booking Confirmation", "Credit Card Receipt"]

VALID_PROJECT_STATUSES = ["Active", "Completed"]


# ── Invoice schemas ──────────────────────────────────────────────────────────

class InvoiceResponse(BaseModel):
    """Flat invoice object returned to the frontend."""
    id: str
    vendor: str
    date: Optional[str] = None
    invoice_number: Optional[str] = None
    currency: Optional[str] = None
    subtotal: Optional[float] = None
    vat: Optional[float] = None
    total: Optional[float] = None
    due_date: Optional[str] = None
    payment_terms: Optional[str] = None
    description: Optional[str] = None
    line_items: Optional[list] = None
    project: str = "Unassigned"
    category: str = "Other"
    document_path: Optional[str] = None
    processed_at: Optional[str] = None
    payment_status: str = "Unpaid"
    document_type: str = "Invoice"


class InvoiceUpdateRequest(BaseModel):
    """Fields the frontend can update on an invoice."""
    project: Optional[str] = None
    category: Optional[str] = None
    payment_status: Optional[str] = None


class GmailFetchRequest(BaseModel):
    """
    Optional overrides for the Gmail fetch endpoint.
    If omitted, values fall back to environment variables.
    """
    max_emails: int = Field(default=50, ge=1, le=200,
                            description="Maximum number of unread emails to process")


class GmailFetchResult(BaseModel):
    """Summary returned after a Gmail fetch run."""
    emails_processed: int
    attachments_found: int
    invoices_detected: int
    invoices_inserted: int
    errors: int
    invoices: list[InvoiceResponse] = []


# ── Project schemas ──────────────────────────────────────────────────────────

class ProjectResponse(BaseModel):
    id: str
    name: str
    budget: float = 0.0
    status: str = "Active"


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    budget: float = Field(default=0.0, ge=0)
    status: str = Field(default="Active")


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    budget: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = None


# ── Dashboard schemas ────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_invoices: int
    total_spend: float
    active_projects: int
    unpaid_count: int
    overdue_count: int
    spend_by_category: dict[str, float]
    spend_by_project: dict[str, float]


# ── Chat schemas ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    response: str


# ── Vendor mapping schemas ───────────────────────────────────────────────────

class VendorMappingRequest(BaseModel):
    vendor: str = Field(..., min_length=1)
    project: str = Field(..., min_length=1)


# ── Generic responses ────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str

class ErrorResponse(BaseModel):
    detail: str
