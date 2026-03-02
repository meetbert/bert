# app/services/currency_service.py
#
# Currency conversion helpers.
# The existing app stores raw currency codes and amounts; this service
# provides conversion utilities for display and reporting.
#
# TODO: Integrate a live exchange-rate API (e.g. Open Exchange Rates,
#       Frankfurter, or European Central Bank) to replace the static
#       fallback rates below.

import logging
import os
from functools import lru_cache

log = logging.getLogger(__name__)

# ── Fallback static rates (base = EUR) ──────────────────────────────────────
# Replace with a live API call when available.
_STATIC_RATES: dict[str, float] = {
    "EUR": 1.0,
    "GBP": 0.86,
    "USD": 1.09,
    "CHF": 0.96,
    "CAD": 1.48,
    "AUD": 1.65,
    "JPY": 161.0,
    "SEK": 11.4,
    "NOK": 11.7,
    "DKK": 7.46,
}

CURRENCY_SYMBOLS: dict[str, str] = {
    "EUR": "€",
    "GBP": "£",
    "USD": "$",
    "CHF": "Fr",
    "JPY": "¥",
    "SEK": "kr",
    "NOK": "kr",
    "DKK": "kr",
}


def get_rates(base: str = "EUR") -> dict[str, float]:
    """
    Return exchange rates relative to `base`.

    TODO: Replace the static fallback with a real API call, e.g.:
        import httpx
        resp = httpx.get(
            "https://api.frankfurter.app/latest",
            params={"base": base},
            timeout=5,
        )
        resp.raise_for_status()
        return resp.json()["rates"]
    """
    base = base.upper()
    base_rate = _STATIC_RATES.get(base)
    if base_rate is None:
        log.warning("Unknown base currency '%s', defaulting to EUR", base)
        return {k: v for k, v in _STATIC_RATES.items()}

    return {
        code: round(rate / base_rate, 6)
        for code, rate in _STATIC_RATES.items()
    }


def convert(amount: float, from_currency: str, to_currency: str) -> float:
    """Convert `amount` from one currency to another using current rates."""
    from_currency = from_currency.upper()
    to_currency   = to_currency.upper()

    if from_currency == to_currency:
        return round(amount, 2)

    rates = get_rates(base=from_currency)
    rate  = rates.get(to_currency)

    if rate is None:
        log.warning(
            "No rate for %s → %s, returning unconverted amount",
            from_currency, to_currency,
        )
        return round(amount, 2)

    return round(amount * rate, 2)


def format_amount(amount: float, currency: str) -> str:
    """Return a human-readable currency string, e.g. '€1,234.56'."""
    symbol = CURRENCY_SYMBOLS.get(currency.upper(), currency)
    return f"{symbol}{amount:,.2f}"


def convert_invoice_list(
    invoices: list[dict],
    to_currency: str,
) -> list[dict]:
    """
    Return a copy of the invoice list with `total_converted` added to each
    row, expressed in `to_currency`.  Original values are not mutated.
    """
    result = []
    for inv in invoices:
        copy       = dict(inv)
        from_cur   = (inv.get("currency") or "EUR").upper()
        raw_total  = inv.get("total")
        try:
            amount = float(raw_total) if raw_total not in (None, "") else 0.0
        except (ValueError, TypeError):
            amount = 0.0

        copy["total_converted"] = convert(amount, from_cur, to_currency)
        copy["display_currency"] = to_currency.upper()
        result.append(copy)
    return result
