"""Server configuration, loaded from `server/.env` (the same file
`extractor/fetch_game.py`'s CLI already reads) -- the server and extractor
share one Python environment and one set of colonist.io credentials.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "colonist_tracker")

COLONIST_JWT = os.getenv("COLONIST_JWT")
COLONIST_USERNAME = os.getenv("COLONIST_USERNAME")

# Signing key for the bearer tokens issued on login (see
# server/services/auth.py) -- not tied to any one user's password, since the
# only auth scheme left is per-person accounts.
SECRET_KEY = os.getenv("SECRET_KEY")

# The one app account that self-approves on signup (see server/services/user_auth.py)
# instead of needing an existing admin to approve it -- solves the bootstrapping
# problem for the single admin account.
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")

_cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = (
    [origin.strip() for origin in _cors_raw.split(",") if origin.strip()]
    if _cors_raw
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)
