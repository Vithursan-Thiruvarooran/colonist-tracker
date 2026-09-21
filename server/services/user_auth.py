"""Email/username/password app accounts -- the sole auth mechanism for the
dashboard. Signup is gated behind a single admin's approval (the `ADMIN_EMAIL`
account self-approves to solve bootstrapping), and every account is per-person
identity, linked by username to a colonist.io player where one matches.

No new dependency for hashing (this project hand-rolls its own token signing
in auth.py rather than pulling pyjwt, so this matches that): PBKDF2-HMAC-SHA256
via the stdlib, with a random salt per user.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from server import config
from server.models.user import DEFAULT_PLAYER_COLOR
from server.services.player_registry import find_player_by_username

_PBKDF2_ITERATIONS = 200_000
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS).hex()


def _new_password_hash(password: str) -> Dict[str, str]:
    salt = secrets.token_bytes(16)
    return {"password_hash": _hash_password(password, salt), "password_salt": salt.hex()}


def _verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    return secrets.compare_digest(_hash_password(password, bytes.fromhex(salt_hex)), hash_hex)


async def signup(db: AsyncIOMotorDatabase, email: str, username: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    username = username.strip()

    if not _EMAIL_RE.match(email):
        raise ValueError("Invalid email address")
    if not username:
        raise ValueError("Username is required")

    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise ValueError("An account with this email already exists")

    is_admin = bool(config.ADMIN_EMAIL) and email == config.ADMIN_EMAIL.strip().lower()
    now = datetime.now(timezone.utc)
    player = await find_player_by_username(db, username)

    doc: Dict[str, Any] = {
        "user_id": uuid.uuid4().hex,
        "email": email,
        "username": username,
        **_new_password_hash(password),
        "player_id": player["player_id"] if player else None,
        "status": "approved" if is_admin else "pending",
        "is_admin": is_admin,
        "created_at": now,
        "decided_at": now if is_admin else None,
        "color": DEFAULT_PLAYER_COLOR,
    }
    await db.users.insert_one(doc)
    return doc


async def login(db: AsyncIOMotorDatabase, email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not _verify_password(password, user["password_salt"], user["password_hash"]):
        raise ValueError("Incorrect email or password")
    if user["status"] != "approved":
        raise ValueError(
            "Account pending admin approval" if user["status"] == "pending" else "Account was rejected"
        )
    return user


async def update_profile(
    db: AsyncIOMotorDatabase,
    user_id: str,
    email: Optional[str] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    color: Optional[str] = None,
) -> Dict[str, Any]:
    user = await db.users.find_one({"user_id": user_id})
    if user is None:
        raise ValueError("User not found")

    update: Dict[str, Any] = {}

    if email is not None:
        email = email.strip().lower()
        if not _EMAIL_RE.match(email):
            raise ValueError("Invalid email address")
        if email != user["email"] and await db.users.find_one({"email": email}, {"_id": 1}):
            raise ValueError("An account with this email already exists")
        update["email"] = email

    if username is not None:
        username = username.strip()
        if not username:
            raise ValueError("Username is required")
        if username != user["username"]:
            update["username"] = username
            player = await find_player_by_username(db, username)
            update["player_id"] = player["player_id"] if player else None

    if password is not None:
        update.update(_new_password_hash(password))

    if color is not None:
        update["color"] = color

    if update:
        await db.users.update_one({"user_id": user_id}, {"$set": update})
        user.update(update)
    return user


async def set_user_status(db: AsyncIOMotorDatabase, user_id: str, status: str) -> Dict[str, Any]:
    user = await db.users.find_one({"user_id": user_id})
    if user is None:
        raise ValueError("User not found")

    update: Dict[str, Any] = {"status": status, "decided_at": datetime.now(timezone.utc)}
    if status == "approved" and not user.get("player_id"):
        player = await find_player_by_username(db, user["username"])
        if player:
            update["player_id"] = player["player_id"]

    await db.users.update_one({"user_id": user_id}, {"$set": update})
    user.update(update)
    return user
