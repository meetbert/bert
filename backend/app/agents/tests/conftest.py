import sys
import os
from dotenv import load_dotenv

# Add agent/ to path so tools/ and config are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Load env so config.py can create the real Supabase client
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

# Dedicated test user — all test data is written under this user_id.
# Must be a real user in the DB with no production data.
USER_ID = "cf08829b-9f8a-4448-b3b3-666391e469c0"
