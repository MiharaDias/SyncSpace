import os
import sys
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

# ── Fail fast on missing critical secrets ────────────────────────────────────
_jwt_secret = os.getenv("JWT_SECRET")
if not _jwt_secret:
    print(
        "FATAL: JWT_SECRET environment variable is not set. "
        "Generate one with:  python -c \"import secrets; print(secrets.token_hex(64))\""
    )
    sys.exit(1)

class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

    # FIX C1 + H4: Tokens expire after 24 h; no hardcoded fallback.
    JWT_SECRET_KEY = _jwt_secret
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)

    GOOGLE_CALENDAR_CREDENTIALS_PATH = os.getenv("GOOGLE_CALENDAR_CREDENTIALS_PATH", "credentials.json")
    SYSTEM_EMAIL = os.getenv("SYSTEM_EMAIL", "")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    # Google OAuth (Web Application credentials for per-user calendar connection)
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/api/auth/google/callback")
    GOOGLE_SIGNIN_REDIRECT_URI = os.getenv(
        "GOOGLE_SIGNIN_REDIRECT_URI",
        "http://localhost:5000/api/auth/google/signin-callback"
    )
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
