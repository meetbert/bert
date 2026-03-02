# app/services/inbox_service.py
#
# Generates and resolves meetbert.uk inbox addresses.

import logging
import re

from app.db import crud

log = logging.getLogger(__name__)

DOMAIN = "meetbert.uk"


def _slug_from_email(email: str) -> str:
    """Derive a clean alphanumeric slug from an email local-part."""
    local = email.split("@")[0]
    slug = re.sub(r"[^a-z0-9]", "", local.lower())
    return slug or "user"


def generate_inbox_address(user_email: str) -> str:
    """
    Generate a unique <slug>@meetbert.uk address for the user.

    Strategy (Option A with collision fallback):
      1. Try   <slug>@meetbert.uk
      2. On collision try <slug>2@meetbert.uk, <slug>3@meetbert.uk, …
    """
    base = _slug_from_email(user_email)

    candidate = f"{base}@{DOMAIN}"
    if not crud.inbox_address_taken(candidate):
        return candidate

    for i in range(2, 10_000):
        candidate = f"{base}{i}@{DOMAIN}"
        if not crud.inbox_address_taken(candidate):
            return candidate

    raise RuntimeError(f"Could not find an available inbox slug for {user_email}")
