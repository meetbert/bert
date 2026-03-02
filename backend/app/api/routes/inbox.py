# app/api/routes/inbox.py
#
# Endpoints for managing a user's meetbert.uk dedicated inbox.

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_auth
from app.db import crud
from app.models.schemas import InboxResponse, MessageResponse
from app.services.inbox_service import generate_inbox_address

router = APIRouter(prefix="/inbox", tags=["inbox"])
log    = logging.getLogger(__name__)


@router.get("", response_model=Optional[InboxResponse])
async def get_inbox(user: dict = Depends(require_auth)):
    """Return the user's current meetbert.uk inbox, or null if not yet created."""
    inbox = crud.get_user_inbox(user["id"])
    if not inbox:
        return None
    return {**inbox, "is_new": False}


@router.post("", response_model=InboxResponse, status_code=201)
async def create_inbox(user: dict = Depends(require_auth)):
    """
    Provision a dedicated meetbert.uk inbox for the user.
    Idempotent — if the user already has one, the existing address is returned
    with is_new=False and a 200 status.
    """
    existing = crud.get_user_inbox(user["id"])
    if existing:
        return {**existing, "is_new": False}

    try:
        address = generate_inbox_address(user["email"])
    except RuntimeError as e:
        log.error("Inbox generation failed for user %s: %s", user["id"], e)
        raise HTTPException(status_code=500, detail="Could not generate inbox address.")

    inbox = crud.create_user_inbox(user_id=user["id"], address=address)
    log.info("Inbox provisioned: %s for user %s", address, user["id"])
    return {**inbox, "is_new": True}


@router.delete("", response_model=MessageResponse)
async def disconnect_inbox(user: dict = Depends(require_auth)):
    """Deactivate the user's meetbert.uk inbox (address is preserved for reactivation)."""
    existing = crud.get_user_inbox(user["id"])
    if not existing:
        raise HTTPException(status_code=404, detail="No inbox found.")
    crud.deactivate_user_inbox(user["id"])
    return {"message": "Inbox disconnected."}
