# app/api/routes/auth.py
#
# Gmail OAuth2 authorisation flow — per-user, multi-tenant.
#
# Flow:
#   1. User clicks "Connect Gmail" in the frontend.
#   2. Frontend links to GET /api/auth/gmail/authorize?user_id=<UUID>
#   3. Backend generates a random state, maps it to the user_id, redirects to Google.
#   4. User approves on Google's consent screen.
#   5. Google redirects to GET /auth/google/callback?code=...&state=...
#   6. Backend looks up user_id from state, exchanges code for tokens,
#      saves the refresh_token to the user_gmail_tokens table.
#   7. Browser is redirected to the frontend settings page.
#
# The redirect_uri registered in Google Cloud Console is:
#   http://localhost:8000/auth/google/callback
# This route is intentionally outside the /api prefix to match exactly.

import logging
import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.api.deps import require_auth
from app.models.schemas import MessageResponse

from app.db import crud

log = logging.getLogger(__name__)

GMAIL_SCOPE  = "https://www.googleapis.com/auth/gmail.modify"
REDIRECT_URI = "http://localhost:8000/auth/google/callback"
AUTH_URI     = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI    = "https://oauth2.googleapis.com/token"

router = APIRouter(tags=["auth"])

# In-memory mapping of state → user_id for the duration of the OAuth handshake.
# Entries are consumed (popped) on use, so they can't be replayed.
_oauth_states: dict[str, str] = {}


def _client_creds() -> tuple[str, str]:
    client_id     = os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env.",
        )
    return client_id, client_secret


# ── Step 1: Authorize ─────────────────────────────────────────────────────────

@router.get("/api/auth/gmail/authorize")
async def gmail_authorize(user_id: str = Query(..., description="Supabase user UUID")):
    """
    Redirect the user to Google's OAuth2 consent screen.

    Called directly from the frontend as a browser navigation (not fetch),
    so the user_id is passed as a query parameter rather than a JWT header.
    A random state token is generated and mapped to the user_id server-side.
    """
    client_id, _ = _client_creds()

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = user_id

    params = {
        "client_id":     client_id,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         GMAIL_SCOPE,
        "access_type":   "offline",   # request a refresh_token
        "prompt":        "consent",   # always return refresh_token
        "state":         state,
    }
    return RedirectResponse(f"{AUTH_URI}?{urlencode(params)}")


# ── Step 2: Callback ──────────────────────────────────────────────────────────

@router.get("/auth/google/callback", response_class=HTMLResponse)
async def gmail_callback(request: Request):
    """
    Google redirects here after the user approves access.
    Exchanges the code for tokens and stores the refresh_token per user.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    # Consume the state — single use only
    user_id = _oauth_states.pop(state, None)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state. Please start the connection again.",
        )

    client_id, client_secret = _client_creds()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URI,
            data={
                "code":          code,
                "client_id":     client_id,
                "client_secret": client_secret,
                "redirect_uri":  REDIRECT_URI,
                "grant_type":    "authorization_code",
            },
        )

    if resp.status_code != 200:
        log.error("Token exchange failed: %s", resp.text)
        raise HTTPException(
            status_code=502,
            detail=f"Google token exchange failed: {resp.text}",
        )

    token_data    = resp.json()
    refresh_token = token_data.get("refresh_token")

    if not refresh_token:
        return HTMLResponse(
            content="""
            <h2>No refresh token returned</h2>
            <p>This usually means you have already authorized the app.
            To force a new token:</p>
            <ol>
                <li>Visit <a href="https://myaccount.google.com/permissions">
                    myaccount.google.com/permissions</a></li>
                <li>Revoke access for <strong>Bert.</strong></li>
                <li>Try connecting again from the Settings page.</li>
            </ol>
            """,
            status_code=200,
        )

    # Persist the token in the database for this user
    crud.save_gmail_token(user_id=user_id, refresh_token=refresh_token)
    log.info("Gmail OAuth2 complete — token stored for user %s", user_id)

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(f"{frontend_url}/settings?gmail_connected=true")


# ── Disconnect Gmail ───────────────────────────────────────────────────────────

@router.delete("/api/auth/gmail", response_model=MessageResponse)
async def disconnect_gmail(user: dict = Depends(require_auth)):
    """Remove the user's stored Gmail refresh token, disconnecting Gmail integration."""
    crud.delete_gmail_token(user["id"])
    return {"message": "Gmail disconnected."}
