"""Server configuration, loaded from `server/.env`."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} must be set in server/.env (see server/.env.example)")
    return value


# No dev-mode fallback for these: an unset MONGODB_URI silently pointing at
# localhost, or an unset SECRET_KEY silently signing tokens with an empty
# key, are the kind of thing you only notice after deploying.
MONGODB_URI = _require("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "colonist_tracker")

# Signing key for the bearer tokens issued on login (see
# server/services/auth.py) -- not tied to any one user's password, since the
# only auth scheme left is per-person accounts.
SECRET_KEY = _require("SECRET_KEY")

# The one app account that self-approves on signup (see server/services/user_auth.py)
# instead of needing an existing admin to approve it -- solves the bootstrapping
# problem for the single admin account.
ADMIN_EMAIL = _require("ADMIN_EMAIL")

_cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = (
    [origin.strip() for origin in _cors_raw.split(",") if origin.strip()]
    if _cors_raw
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)
