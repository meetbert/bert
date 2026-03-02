# app/db/database.py
#
# Supabase client singleton — server-side only (service role key).
# Import `supabase` from here wherever you need a DB connection.

import os
import logging
from functools import lru_cache

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a cached Supabase client using the service role key."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )

    return create_client(url, key)


# Convenience alias used throughout the app
supabase: Client = get_supabase()
