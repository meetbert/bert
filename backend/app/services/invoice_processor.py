# app/services/invoice_processor.py
#
# Gemini-powered invoice extraction.
# Unchanged business logic from the original invoice_processor.py —
# only import paths have been updated.

import json
import logging
import os
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import ClientError

load_dotenv()

log = logging.getLogger(__name__)

# Support multiple API keys (comma-separated in .env) for rate limit rotation
_raw_keys = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_KEYS = [k.strip() for k in _raw_keys.split(",") if k.strip()]
_current_key_idx = 0
MODEL = "gemini-2.5-flash-lite"

MIME_TYPES = {
    ".pdf":  "application/pdf",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
}


def _read_file(file_path: Path) -> tuple[bytes, str]:
    suffix = file_path.suffix.lower()
    mime_type = MIME_TYPES.get(suffix)
    if not mime_type:
        raise ValueError(f"Unsupported file type: {suffix}")
    return file_path.read_bytes(), mime_type


def _call_gemini(
    file_bytes: bytes,
    mime_type: str,
    prompt: str,
    system: str,
    max_retries: int = 3,
) -> str:
    """Send a file + prompt to Gemini with automatic retry and key rotation."""
    global _current_key_idx

    if not GEMINI_API_KEYS:
        raise ValueError("No GEMINI_API_KEY set in .env")

    num_keys = len(GEMINI_API_KEYS)
    total_attempts = max_retries * num_keys

    for attempt in range(1, total_attempts + 1):
        api_key   = GEMINI_API_KEYS[_current_key_idx % num_keys]
        key_label = f"key {(_current_key_idx % num_keys) + 1}/{num_keys}"
        client    = genai.Client(api_key=api_key)

        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=[
                    types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=0.2,
                    max_output_tokens=2048,
                ),
            )
            return resp.text
        except (ClientError, Exception) as e:
            error_msg   = str(e)
            is_rate_lim = "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg

            if is_rate_lim and attempt < total_attempts:
                _current_key_idx += 1
                next_label = f"key {(_current_key_idx % num_keys) + 1}/{num_keys}"
                if num_keys > 1:
                    log.warning(
                        "Rate limited on %s (attempt %d/%d). Switching to %s...",
                        key_label, attempt, total_attempts, next_label,
                    )
                    time.sleep(1)
                else:
                    wait = 15 * attempt
                    if "retryDelay" in error_msg:
                        try:
                            import re
                            match = re.search(r"retryDelay.*?(\d+)", error_msg)
                            if match:
                                wait = int(match.group(1)) + 2
                        except (ValueError, AttributeError):
                            pass
                    log.warning("Rate limited (attempt %d/%d). Waiting %ds...",
                                attempt, total_attempts, wait)
                    time.sleep(wait)
            elif is_rate_lim:
                log.error("Rate limit exceeded on all %d key(s) after %d attempts.",
                          num_keys, total_attempts)
                raise
            else:
                raise


def _parse_json(raw: str) -> dict | None:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end   = text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
    return None


def _format_line_items(line_items: list | None) -> str:
    """Convert line items array into readable text."""
    if not line_items or not isinstance(line_items, list):
        return ""
    lines = []
    for item in line_items:
        name  = item.get("item", "Unknown")
        qty   = item.get("quantity", 1)
        price = item.get("unit_price", 0)
        lines.append(f"{name} x{qty} @ {price}")
    return "; ".join(lines)


def _to_number(val) -> str:
    if val is None:
        return ""
    try:
        num = float(val)
        return str(int(num)) if num == int(num) else f"{num:.2f}"
    except (ValueError, TypeError):
        cleaned = (
            str(val)
            .replace("$", "").replace("€", "").replace("£", "")
            .replace(",", "").strip()
        )
        try:
            num = float(cleaned)
            return str(int(num)) if num == int(num) else f"{num:.2f}"
        except (ValueError, TypeError):
            return str(val)


def process_document(
    file_path: Path,
    email_subject: str = "",
    email_body: str = "",
    project_names: list[str] | None = None,
    active_projects: list[dict] | None = None,
) -> dict | None:
    """
    Single Gemini call: detect if a document is an invoice and extract data.
    Returns a cleaned dict ready for DB insertion, or None if not an invoice.
    """
    file_bytes, mime_type = _read_file(file_path)

    # Build context block from email metadata
    context_parts = []
    if email_subject:
        context_parts.append(f"Email subject: {email_subject}")
    if email_body:
        context_parts.append(f"Email body: {email_body[:500].strip()}")
    context_block = "\n".join(context_parts)

    # Build project matching instructions
    if project_names and active_projects:
        project_details = []
        for p in active_projects:
            detail = f'"{p["name"]}"'
            hints  = []
            if p.get("known_vendors"):
                hints.append(f'known vendors: {p["known_vendors"]}')
            if p.get("known_locations"):
                hints.append(f'known locations: {p["known_locations"]}')
            if p.get("description"):
                hints.append(f'description: {p["description"]}')
            if hints:
                detail += f' ({"; ".join(hints)})'
            project_details.append(detail)
        project_list = "\n  ".join(project_details)
        project_instruction = (
            '- "project": assign to one of these active projects:\n'
            f'  {project_list}\n'
            'Match based on vendor name, location, email subject/body, and invoice content. '
            'If none match, use "Unassigned" (string)\n'
        )
    elif project_names:
        project_list = ", ".join(f'"{p}"' for p in project_names)
        project_instruction = (
            f'- "project": assign to one of these active projects: {project_list}. '
            'Use email subject, body, vendor name, and invoice content to decide. '
            'If none match, use "Unassigned" (string)\n'
        )
    else:
        project_instruction = (
            '- "project": guess the project this relates to based on vendor, '
            'description, and line items. If unclear, use "Unassigned" (string)\n'
        )

    prompt = (
        "Look at this document. If it is NOT an invoice, receipt, or booking "
        "confirmation (e.g. a personal letter, general report, or unrelated photo), "
        'return exactly: {"not_invoice": true}\n\n'
        "If it IS an invoice, receipt, credit card receipt, or booking confirmation "
        "(flights, hotels, etc.), extract all data and return a JSON object with "
        "these exact keys:\n"
        '- "vendor": company or service name (string)\n'
        '- "date": invoice/receipt date in YYYY-MM-DD format (string)\n'
        '- "invoice_number": invoice/reference/booking number (string)\n'
        '- "currency": 3-letter ISO code like USD, EUR, GBP (string)\n'
        '- "subtotal": amount before tax as a number (float)\n'
        '- "vat": tax/VAT amount as a number (float)\n'
        '- "total": total amount as a number (float)\n'
        '- "due_date": payment due date in YYYY-MM-DD format (string)\n'
        '- "payment_terms": payment terms (string)\n'
        '- "description": brief description or notes (string)\n'
        '- "line_items": array of {"item": string, "quantity": number, "unit_price": number}\n'
        + project_instruction
        + '- "category": classify the expense into exactly one of: '
        "Travel, Accommodation, Contributor Fees, Location Rental, Crew/Freelance, "
        "Equipment, Post-Production, Insurance, Music/Licensing, Office/Admin, Other (string)\n"
        '- "doc_type": classify as one of: "Invoice", "Receipt", '
        '"Booking Confirmation", "Credit Card Receipt" (string)\n'
        "Use null for any field you cannot determine. "
        "Dates MUST be YYYY-MM-DD. Currency MUST be a 3-letter code. "
        "Monetary values MUST be numbers, not strings."
    )

    if context_block:
        prompt += f"\n\nAdditional context from the email:\n{context_block}"

    system = (
        "You are a precise document classifier and invoice extraction engine. "
        "Return ONLY valid JSON, no markdown fences, no extra text."
    )

    raw  = _call_gemini(file_bytes, mime_type, prompt, system)
    data = _parse_json(raw)

    if data is None:
        log.error("Failed to parse Gemini response for %s: %s",
                  file_path.name, raw[:200])
        return None

    if data.get("not_invoice"):
        log.info("Not an invoice: %s", file_path.name)
        return None

    VALID_CATEGORIES = {
        "Travel", "Accommodation", "Contributor Fees", "Location Rental",
        "Crew/Freelance", "Equipment", "Post-Production", "Insurance",
        "Music/Licensing", "Office/Admin", "Other",
    }

    category = str(data.get("category") or "Other")
    if category not in VALID_CATEGORIES:
        category = "Other"

    # Validate project with fuzzy matching
    project = str(data.get("project") or "Unassigned")
    if project_names and project not in project_names and project != "Unassigned":
        best_match = None
        best_score = 0.0
        for name in project_names:
            score = SequenceMatcher(None, project.lower(), name.lower()).ratio()
            if score > best_score:
                best_score = score
                best_match = name
        if best_score >= 0.7 and best_match:
            log.info("Fuzzy matched project '%s' → '%s' (%.0f%%) for %s",
                     project, best_match, best_score * 100, file_path.name)
            project = best_match
        else:
            log.info("Unknown project '%s' for %s (best: '%s' %.0f%%), → Unassigned",
                     project, file_path.name, best_match, best_score * 100)
            project = "Unassigned"

    doc_type = str(data.get("doc_type") or "Invoice")
    if doc_type not in ("Invoice", "Receipt", "Booking Confirmation", "Credit Card Receipt"):
        doc_type = "Invoice"

    result = {
        "vendor":          str(data.get("vendor") or ""),
        "date":            str(data.get("date") or ""),
        "invoice_number":  str(data.get("invoice_number") or ""),
        "currency":        str(data.get("currency") or "").upper()[:3],
        "subtotal":        _to_number(data.get("subtotal")),
        "vat":             _to_number(data.get("vat")),
        "total":           _to_number(data.get("total")),
        "due_date":        str(data.get("due_date") or ""),
        "payment_terms":   str(data.get("payment_terms") or ""),
        "description":     str(data.get("description") or ""),
        "line_items":      data.get("line_items") or None,
        "project":         project,
        "category":        category,
        "source_file":     file_path.name,
        "processed_at":    datetime.now().strftime("%Y-%m-%d %H:%M"),
        "approval_status": "Pending",
        "doc_type":        doc_type,
    }

    log.info(
        "Extracted invoice from %s: vendor=%s, total=%s %s, project=%s",
        file_path.name, result["vendor"], result["total"],
        result["currency"], result["project"],
    )
    return result
