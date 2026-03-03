import sys
import os
from dotenv import load_dotenv

# Add agent/ to path so tools/ and config are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Load env so config.py can create the real Supabase client
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))
