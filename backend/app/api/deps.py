# app/api/deps.py
#
# FastAPI dependency injectors.
# Provides the Supabase client and a (currently placeholder) auth dependency.

import os
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Header, status
from supabase import Client

from app.db.database import get_supabase

log = logging.getLogger(__name__)


# ── Supabase client dependency ───────────────────────────────────────────────

def get_db() -> Client:
    """Inject the Supabase service-role client into route handlers."""
    return get_supabase()


# ── Auth dependency (placeholder) ───────────────────────────────────────────
#
# The frontend sends a Supabase JWT in the Authorization header.
# This dependency validates it via the Supabase client.
#
# TODO: Implement full JWT validation once auth is wired up end-to-end:
#   1. Extract the Bearer token from the Authorization header.
#   2. Call supabase.auth.get_user(token) to verify it.
#   3. Return the user object so routes can gate on user identity.
#   4. Replace the Optional[str] stub below with a real User model.

async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Client = Depends(get_db),
) -> Optional[dict]:
    """
    Placeholder auth dependency.

    Currently accepts any request (returns None when no token is present).
    Swap the body below for real validation before going to production.
    """
    if not authorization:
        # TODO: Enforce auth by uncommenting:
        # raise HTTPException(
        #     status_code=status.HTTP_401_UNAUTHORIZED,
        #     detail="Missing Authorization header",
        # )
        return None

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        response = db.auth.get_user(token)
        if response and response.user:
            return {"id": response.user.id, "email": response.user.email}
    except Exception as e:
        log.warning("Token validation failed: %s", e)

    # TODO: Raise 401 here in production instead of returning None
    return None


# ── Optional strict auth (use for protected endpoints) ──────────────────────

async def require_auth(
    user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """
    Use this dependency on endpoints that must require a logged-in user.

    Currently a no-op to allow unauthenticated development.
    TODO: Remove the early-return once auth is enforced.
    """
    # TODO: Uncomment when auth is enforced:
    # if user is None:
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED,
    #         detail="Authentication required",
    #     )
    return user or {}
