# app/deps.py
#
# FastAPI dependency injectors.

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Header, status
from supabase import Client

from app.db import get_supabase

log = logging.getLogger(__name__)


def get_db() -> Client:
    """Inject the Supabase service-role client into route handlers."""
    return get_supabase()


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Client = Depends(get_db),
) -> Optional[dict]:
    """
    Validate the Bearer JWT from the Authorization header.
    Returns {"id": uuid, "email": str} or None if no token provided.
    """
    if not authorization:
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

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


async def require_auth(
    user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """Enforce authentication — raises 401 if no valid token provided."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user
