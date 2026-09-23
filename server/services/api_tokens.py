"""The single shared bearer token the Chrome capture extension uses to call
`POST /colonist/api/games/ingest` -- the extension can't do an interactive login (see
extension/README.md), so instead of a user session it holds this one static
token, admin-managed via `GET/POST /colonist/api/admin/ingest-token*`.

Stored as a singleton document (`_id: "ingest"`) rather than per-user, since
there's exactly one extension install to authorize (see the plan discussion:
a single shared token, regenerable, not per-device named tokens).
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict

from motor.motor_asyncio import AsyncIOMotorDatabase

_DOC_ID = "ingest"


def _new_token_doc() -> Dict[str, Any]:
    return {"_id": _DOC_ID, "token": secrets.token_urlsafe(32), "created_at": datetime.now(timezone.utc)}


async def get_or_create_ingest_token(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    doc = await db.api_tokens.find_one({"_id": _DOC_ID})
    if doc is None:
        doc = _new_token_doc()
        await db.api_tokens.insert_one(doc)
    return doc


async def regenerate_ingest_token(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    doc = _new_token_doc()
    await db.api_tokens.replace_one({"_id": _DOC_ID}, doc, upsert=True)
    return doc


async def verify_ingest_token(db: AsyncIOMotorDatabase, token: str) -> bool:
    doc = await db.api_tokens.find_one({"_id": _DOC_ID})
    return doc is not None and secrets.compare_digest(token, doc["token"])
