"""Maintains the `players` collection: a stable, cross-game identity for
every colonist.io player (human or bot) seen across ingested games, plus the
link from an app `users` account to its matching `players` doc.

Humans are deduped by colonist.io's own `userId` (stable even if they rename),
bots have no `userId` so they're deduped by name instead.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


async def upsert_players_from_game(db: AsyncIOMotorDatabase, players: List[Dict[str, Any]]) -> None:
    now = datetime.now(timezone.utc)
    for player in players:
        colonist_user_id = player.get("user_id")
        username = player["name"]
        is_bot = bool(player.get("is_bot"))

        set_on_insert: Dict[str, Any] = {"player_id": uuid.uuid4().hex, "first_seen_at": now}
        if colonist_user_id:
            query = {"colonist_user_id": colonist_user_id}
        else:
            # No stable colonist.io id to key on -- fall back to (is_bot, username).
            query = {"is_bot": True, "username": username}
            set_on_insert["colonist_user_id"] = None

        await db.players.update_one(
            query,
            {
                "$set": {"username": username, "is_bot": is_bot, "last_seen_at": now},
                "$setOnInsert": set_on_insert,
            },
            upsert=True,
        )


async def find_player_by_username(db: AsyncIOMotorDatabase, username: str) -> Optional[Dict[str, Any]]:
    """Case-insensitive exact match against a human player's username."""
    return await db.players.find_one(
        {"username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}, "is_bot": False}
    )


async def relink_users_to_players(db: AsyncIOMotorDatabase) -> None:
    """Fills in `player_id` for any `users` doc that doesn't have one yet,
    now that the `players` collection may have caught up. Cheap at this
    project's scale (a handful of users), so it's just re-run after every
    ingest rather than tracked incrementally.
    """
    async for user in db.users.find({"player_id": None}, {"user_id": 1, "username": 1}):
        player = await find_player_by_username(db, user["username"])
        if player:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"player_id": player["player_id"]}})
