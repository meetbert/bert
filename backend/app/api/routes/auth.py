# app/api/routes/auth.py
#
# Gmail OAuth2 authorisation flow.
#
# One-time setup process:
#   1. Start the server: uvicorn app.main:app --reload
#   2. Open in your browser: http://localhost:8000/api/auth/gmail/authorize
#   3. You'll be redirected to Google's consent screen — approve it.
#   4. Google redirects back to http://localhost:8000/auth/google/callback
#   5. The page shows your GMAIL_REFRESH_TOKEN — copy it into your .env file.
#   6. You never need to repeat this unless you revoke access.
#
# The redirect_uri registered in Google Cloud Console is:
#   http://localhost:8000/auth/google/callback
# This route is intentionally outside the /api prefix to match exactly.

import logging
import os
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

log = logging.getLogger(__name__)

# gmail.modify = read + mark as read (minimum needed)
GMAIL_SCOPE   = "https://www.googleapis.com/auth/gmail.modify"
REDIRECT_URI  = "http://localhost:8000/auth/google/callback"
AUTH_URI      = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI     = "https://oauth2.googleapis.com/token"

router = APIRouter(tags=["auth"])


def _client_creds() -> tuple[str, str]:
    client_id     = os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail=(
                "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env. "
                "Copy the values from your client_secret_*.json file."
            ),
        )
    return client_id, client_secret


# ── Step 1: Authorize ─────────────────────────────────────────────────────────

@router.get("/api/auth/gmail/authorize")
async def gmail_authorize():
    """
    Redirect the user to Google's OAuth2 consent screen.
    Open this URL in your browser during the one-time setup.

    The authorization URL is built manually — no PKCE — so the token exchange
    in the callback is a plain code-for-token POST with no code_verifier needed.
    """
    client_id, _ = _client_creds()

    params = {
        "client_id":     client_id,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         GMAIL_SCOPE,
        "access_type":   "offline",   # request a refresh_token
        "prompt":        "consent",   # force consent so Google always returns refresh_token
    }
    return RedirectResponse(f"{AUTH_URI}?{urlencode(params)}")


# ── Step 2: Callback ──────────────────────────────────────────────────────────
# Must match the redirect_uri registered in Google Cloud Console exactly.

@router.get("/auth/google/callback", response_class=HTMLResponse)
async def gmail_callback(request: Request):
    """
    Google redirects here after the user approves access.
    Exchanges the authorization code for tokens and displays the refresh_token.
    """
    code  = request.query_params.get("code")
    error = request.query_params.get("error")

    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

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
            <p>This usually means you have already authorized the app and Google
            didn't return a new refresh token. To force a new one:</p>
            <ol>
                <li>Visit <a href="https://myaccount.google.com/permissions">
                    myaccount.google.com/permissions</a></li>
                <li>Revoke access for <strong>Bert</strong></li>
                <li>Return to <a href="/api/auth/gmail/authorize">/api/auth/gmail/authorize</a></li>
            </ol>
            """,
            status_code=200,
        )

    log.info("Gmail OAuth2 successful — refresh token obtained.")

    return HTMLResponse(
        content=f"""
        <!DOCTYPE html>
        <html>
        <head><title>Bert — Gmail Authorised</title>
        <style>
            body {{ font-family: system-ui, sans-serif; max-width: 640px;
                   margin: 60px auto; padding: 0 20px; }}
            code {{ background: #f4f4f4; padding: 12px 16px; display: block;
                   border-radius: 6px; word-break: break-all; font-size: 13px; }}
            .success {{ color: #16a34a; }}
            .step {{ background: #fafafa; border: 1px solid #e5e7eb;
                    border-radius: 8px; padding: 16px; margin: 16px 0; }}
        </style>
        </head>
        <body>
        <h1 class="success">Gmail authorised ✓</h1>
        <p>Copy the refresh token below and add it to your <code>.env</code> file.</p>

        <div class="step">
            <strong>GMAIL_REFRESH_TOKEN</strong>
            <code>{refresh_token}</code>
        </div>

        <p>Add this line to <code>bert/backend/.env</code>:</p>
        <code>GMAIL_REFRESH_TOKEN={refresh_token}</code>

        <p style="margin-top:32px; color:#6b7280; font-size:14px;">
            You only need to do this once. The refresh token does not expire
            unless you revoke access in your Google account.
        </p>
        </body>
        </html>
        """,
        status_code=200,
    )
