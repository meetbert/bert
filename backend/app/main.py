# app/main.py
#
# FastAPI application entrypoint.
#
# Run with:
#   uvicorn app.main:app --reload
# from the /backend directory.

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, chat, dashboard, email_inbound, inbox, invoices, projects

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Bert API",
    description="Invoice processing and project management backend for Bert.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── CORS ──────────────────────────────────────────────────────────────────────
#
# Allow the Lovable/Vite dev server and any deployed frontend URL.
# Update BACKEND_CORS_ORIGINS in .env to lock this down in production.

_raw_origins = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://localhost:8080",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Also accept any localhost / 127.0.0.1 port so the dev server always works
    # regardless of which port Vite binds to.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ───────────────────────────────────────────────────────────────────

API_PREFIX = "/api"

app.include_router(invoices.router,       prefix=API_PREFIX)
app.include_router(projects.router,       prefix=API_PREFIX)
app.include_router(dashboard.router,      prefix=API_PREFIX)
app.include_router(chat.router,           prefix=API_PREFIX)
app.include_router(inbox.router,          prefix=API_PREFIX)
app.include_router(email_inbound.router,  prefix=API_PREFIX)
# Auth router has its own paths (must match Google Cloud Console redirect URI exactly)
app.include_router(auth.router)


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health():
    """Simple liveness probe."""
    return {"status": "ok"}


# ── Startup events ────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    """Seed fixed reference data on first boot."""
    from app.db.crud import seed_categories
    try:
        seed_categories()
        logging.getLogger(__name__).info("Categories seeded.")
    except Exception as e:
        logging.getLogger(__name__).warning("Could not seed categories: %s", e)
