"""Per-person app accounts (signup/login/admin-approval, see
server/services/user_auth.py) plus the single shared ingest API token used by
the Chrome capture extension (server/services/api_tokens.py), which can't do
an interactive login. Both ride on the same HMAC-signed, time-limited token
format for user sessions (no third-party auth library, no JWT dependency):
`SECRET_KEY` (server/.env) is the signing key for every user token issued.

`require_admin_or_ingest_token` is the one place these two mechanisms meet:
it accepts either a logged-in admin's user token or the static ingest token,
since `POST /api/games/ingest` is called both from the dashboard (a logged-in
admin) and from the extension (no session, just the static token).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional

from fastapi import Depends, Header, HTTPException

from server import config
from server.db import get_db
from server.services.api_tokens import verify_ingest_token

TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def _signing_key() -> bytes:
    return hashlib.sha256((config.SECRET_KEY or "").encode()).digest()


def _b64_no_pad(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _create_signed_token(claims: Dict[str, Any]) -> str:
    payload = _b64_no_pad(json.dumps({**claims, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    signature = _b64_no_pad(hmac.new(_signing_key(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def _verify_signed_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload, signature = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = _b64_no_pad(hmac.new(_signing_key(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        claims = json.loads(_b64_decode(payload))
    except Exception:
        return None

    if claims.get("exp", 0) <= time.time():
        return None
    return claims


def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization[len("Bearer ") :]


def create_user_token(user_id: str) -> str:
    return _create_signed_token({"typ": "user", "uid": user_id})


async def _resolve_user(db, authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    claims = _verify_signed_token(_bearer_token(authorization))
    user_id = claims.get("uid") if claims and claims.get("typ") == "user" else None
    if not user_id:
        return None
    return await db.users.find_one({"user_id": user_id})


async def get_current_user(authorization: Optional[str] = Header(default=None), db=Depends(get_db)) -> Dict[str, Any]:
    """FastAPI dependency for the per-person account system -- resolves the
    bearer token to its `users` document."""
    user = await _resolve_user(db, authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_admin_or_ingest_token(authorization: Optional[str] = Header(default=None), db=Depends(get_db)) -> None:
    """FastAPI dependency -- attach to routes the extension's static ingest
    token should be able to call without an interactive admin session."""
    token = _bearer_token(authorization)

    claims = _verify_signed_token(token)
    if claims and claims.get("typ") == "user":
        user = await db.users.find_one({"user_id": claims.get("uid")})
        if user and user.get("is_admin"):
            return

    if await verify_ingest_token(db, token):
        return

    raise HTTPException(status_code=401, detail="Invalid or expired token")
