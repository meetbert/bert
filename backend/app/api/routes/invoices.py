# app/api/routes/invoices.py

import io
import logging
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.db import crud
from app.models.schemas import (
    GmailFetchRequest,
    GmailFetchResult,
    InvoiceResponse,
    InvoiceUpdateRequest,
    MessageResponse,
    VendorMappingRequest,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])
log    = logging.getLogger(__name__)

# Attachments directory (same location gmail_service saves to)
ATTACHMENTS_DIR = Path(__file__).resolve().parents[3] / "attachments"


# ── List & detail ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[InvoiceResponse])
async def list_invoices(
    project_id:     Optional[str] = Query(default=None),
    category:       Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    _user = Depends(get_current_user),
):
    """
    Return all invoices, optionally filtered by project, category,
    or payment status.
    """
    rows = crud.get_invoices(
        project_id=project_id,
        category=category,
        payment_status=payment_status,
    )
    return rows


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    _user = Depends(get_current_user),
):
    row = crud.get_invoice_by_id(invoice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return row


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdateRequest,
    _user = Depends(get_current_user),
):
    """
    Update editable fields on an invoice (project, category, payment_status).
    """
    existing = crud.get_invoice_by_id(invoice_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")

    fields = body.model_dump(exclude_none=True)
    if not fields:
        return existing

    crud.update_invoice(invoice_id, fields)
    return crud.get_invoice_by_id(invoice_id)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{invoice_id}", response_model=MessageResponse)
async def delete_invoice(
    invoice_id: str,
    _user = Depends(get_current_user),
):
    existing = crud.get_invoice_by_id(invoice_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")

    crud.delete_invoice(invoice_id)
    return {"message": f"Invoice {invoice_id} deleted"}


# ── Gmail fetch ───────────────────────────────────────────────────────────────

@router.post("/fetch-from-gmail", response_model=GmailFetchResult)
async def fetch_from_gmail(
    body: GmailFetchRequest = GmailFetchRequest(),
    _user = Depends(get_current_user),
):
    """
    Trigger a Gmail IMAP fetch:
      1. Connect to Gmail with EMAIL + APP_PASSWORD env vars.
      2. Download unread email attachments (PDF / images).
      3. Run each through Gemini invoice extraction.
      4. Insert new (non-duplicate) invoices into Supabase.
      5. Return a summary with inserted invoice objects.

    This is a synchronous operation — consider running it as a background
    task for large mailboxes (see the /fetch-from-gmail/async variant below).
    """
    from app.services.gmail_service import fetch_invoices_from_gmail

    try:
        result = fetch_invoices_from_gmail(max_emails=body.max_emails)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Gmail fetch failed")
        raise HTTPException(status_code=500, detail=f"Gmail fetch failed: {e}")

    # Re-fetch full invoice objects from DB so IDs and joins are populated
    inserted_ids = [inv.get("id") for inv in result["invoices"] if inv.get("id")]
    full_invoices = [
        crud.get_invoice_by_id(iid)
        for iid in inserted_ids
        if crud.get_invoice_by_id(iid)
    ]

    return GmailFetchResult(
        emails_processed  = result["emails_processed"],
        attachments_found = result["attachments_found"],
        invoices_detected = result["invoices_detected"],
        invoices_inserted = result["invoices_inserted"],
        errors            = result["errors"],
        invoices          = full_invoices,
    )


# ── Document streaming ────────────────────────────────────────────────────────

@router.get("/{invoice_id}/document")
async def get_invoice_document(
    invoice_id: str,
    _user = Depends(get_current_user),
):
    """
    Stream the original attached document (PDF or image) for an invoice.

    The frontend can use this URL directly in an <iframe> or <img> tag,
    or trigger a download via the Content-Disposition header.
    """
    invoice = crud.get_invoice_by_id(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    doc_path = invoice.get("document_path")
    if not doc_path:
        raise HTTPException(status_code=404, detail="No document attached to this invoice")

    file_path = ATTACHMENTS_DIR / doc_path
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Document file not found on disk: {doc_path}",
        )

    media_type, _ = mimetypes.guess_type(str(file_path))
    media_type = media_type or "application/octet-stream"

    def _stream():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _stream(),
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{file_path.name}"',
            "Content-Length": str(file_path.stat().st_size),
        },
    )


@router.get("/{invoice_id}/export-pdf")
async def export_invoice_pdf(
    invoice_id: str,
    _user = Depends(get_current_user),
):
    """
    Generate and stream a PDF summary of a single invoice.

    If the original attachment is already a PDF, it is returned directly.
    Otherwise a simple summary PDF is generated using reportlab.

    TODO: Build a proper branded PDF template with reportlab or weasyprint.
    """
    invoice = crud.get_invoice_by_id(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # If the original file is a PDF, serve it directly
    doc_path = invoice.get("document_path")
    if doc_path:
        file_path = ATTACHMENTS_DIR / doc_path
        if file_path.exists() and file_path.suffix.lower() == ".pdf":
            def _stream():
                with open(file_path, "rb") as f:
                    while chunk := f.read(65536):
                        yield chunk

            return StreamingResponse(
                _stream(),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": (
                        f'attachment; filename="invoice_{invoice_id}.pdf"'
                    ),
                },
            )

    # Fallback: generate a minimal PDF summary
    # TODO: Replace with a properly styled template
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buf = io.BytesIO()
        c   = canvas.Canvas(buf, pagesize=A4)
        w, h = A4

        c.setFont("Helvetica-Bold", 18)
        c.drawString(50, h - 60, "Invoice Summary")

        c.setFont("Helvetica", 12)
        y = h - 100
        fields = [
            ("Vendor",          invoice.get("vendor")),
            ("Invoice #",       invoice.get("invoice_number")),
            ("Date",            invoice.get("date")),
            ("Due Date",        invoice.get("due_date")),
            ("Currency",        invoice.get("currency")),
            ("Subtotal",        invoice.get("subtotal")),
            ("VAT",             invoice.get("vat")),
            ("Total",           invoice.get("total")),
            ("Project",         invoice.get("project")),
            ("Category",        invoice.get("category")),
            ("Payment Status",  invoice.get("payment_status")),
            ("Description",     invoice.get("description")),
        ]
        for label, value in fields:
            if value not in (None, ""):
                c.drawString(50, y, f"{label}: {value}")
                y -= 20

        c.save()
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="invoice_{invoice_id}.pdf"'
                )
            },
        )

    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="PDF generation requires reportlab. Install it: pip install reportlab",
        )


# ── Vendor mappings ───────────────────────────────────────────────────────────

@router.post("/vendor-mappings", response_model=MessageResponse)
async def set_vendor_mapping(
    body: VendorMappingRequest,
    _user = Depends(get_current_user),
):
    """Map a vendor name to a project for future auto-assignment."""
    crud.set_vendor_project(body.vendor, body.project)
    return {"message": f"Mapped '{body.vendor}' → '{body.project}'"}


@router.get("/vendor-mappings", response_model=dict)
async def get_vendor_mappings(
    _user = Depends(get_current_user),
):
    """Return all vendor → project mappings."""
    return crud.get_vendor_map()
