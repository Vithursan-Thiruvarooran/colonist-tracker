"""Orchestrates getting a manually-pasted or extension-captured game replay
payload into Mongo: the raw payload always lands in `raw_games` first (the
durable, reprocessable source of truth), then `build_game_document()`
derives the queryable `games` document from it. `rebuild_all_games()`
re-runs that second step for every stored game, without touching
colonist.io, whenever game_documents.py's schema changes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from server.models.game import FetchResult, ImportResult
from server.services.game_documents import build_game_document
from server.services.player_registry import relink_users_to_players, upsert_players_from_game
from server.services.timeline_documents import build_timeline_document


def _unwrap_raw(raw: dict) -> dict:
    """Accept either the unwrapped replay payload or the raw Network-tab
    response ({"data": {...}}), matching decode_game.py's CLI behavior."""
    if "data" in raw and "eventHistory" not in raw:
        return raw["data"]
    return raw


async def _store_game(
    db: AsyncIOMotorDatabase,
    game_id: str,
    raw: dict,
    source_username: str,
    player_color: Optional[int],
    fetched_at: Optional[datetime] = None,
) -> None:
    fetched_at = fetched_at or datetime.now(timezone.utc)
    await db.raw_games.update_one(
        {"game_id": game_id},
        {
            "$set": {
                "game_id": game_id,
                "raw": raw,
                "source_username": source_username,
                "player_color": player_color,
                "fetched_at": fetched_at,
            }
        },
        upsert=True,
    )
    document = build_game_document(raw, source_username, player_color, fetched_at)
    await db.games.update_one({"game_id": game_id}, {"$set": document}, upsert=True)
    await upsert_players_from_game(db, document["players"])
    await relink_users_to_players(db)

    timeline_document = build_timeline_document(raw, fetched_at)
    await db.game_timelines.update_one({"game_id": game_id}, {"$set": timeline_document}, upsert=True)


async def ingest_raw_game(db: AsyncIOMotorDatabase, raw: dict) -> FetchResult:
    """Store a manually-pasted or extension-captured raw replay payload.
    `player_color` comes from the payload's own `playerPerspective` field
    rather than a caller-supplied argument.
    """
    raw = _unwrap_raw(raw)

    game_id = raw.get("databaseGameId")
    if not game_id:
        raise ValueError("Payload is missing 'databaseGameId' -- is this a valid replay payload?")
    game_id = str(game_id)

    if await db.raw_games.find_one({"game_id": game_id}, {"_id": 1}):
        return FetchResult(game_id=game_id, status="skipped", reason="already_stored")

    try:
        await _store_game(db, game_id, raw, "manual", raw.get("playerPerspective"))
    except Exception as exc:  # noqa: BLE001 -- surfaced to the caller as a 400
        raise ValueError(f"Failed to decode payload: {exc}") from exc

    return FetchResult(game_id=game_id, status="stored")


async def rebuild_all_games(db: AsyncIOMotorDatabase) -> int:
    """Regenerate every `games` document from `raw_games`, without touching
    colonist.io. Run this after changing game_documents.py's schema."""
    count = 0
    async for raw_doc in db.raw_games.find({}):
        document = build_game_document(
            raw_doc["raw"], raw_doc["source_username"], raw_doc.get("player_color"), raw_doc["fetched_at"]
        )
        await db.games.update_one({"game_id": raw_doc["game_id"]}, {"$set": document}, upsert=True)
        await upsert_players_from_game(db, document["players"])
        count += 1
    await relink_users_to_players(db)
    return count


async def export_raw_games(db: AsyncIOMotorDatabase) -> list:
    """Dump every `raw_games` document verbatim for backup -- the durable
    source of truth, sufficient on its own to rebuild `games` and
    `game_timelines` via import_raw_games() below."""
    return [doc async for doc in db.raw_games.find({}, {"_id": 0})]


async def import_raw_games(db: AsyncIOMotorDatabase, entries: list) -> ImportResult:
    """Restore raw payloads from an export produced by export_raw_games().
    Unlike ingest_raw_game(), preserves each entry's original
    source_username/player_color/fetched_at rather than stamping them as a
    fresh "manual" ingest happening now -- this is a restore, not a new
    capture. Games already present (by game_id) are skipped, so re-running
    an import (e.g. a partial restore that errored partway through) is
    safe."""
    stored = 0
    skipped = 0
    errors: list = []
    for entry in entries:
        raw = entry.get("raw")
        if not isinstance(raw, dict):
            errors.append(f"{entry.get('game_id', '?')}: entry has no 'raw' payload")
            continue
        raw = _unwrap_raw(raw)

        game_id = entry.get("game_id") or raw.get("databaseGameId")
        if not game_id:
            errors.append("Entry missing 'game_id'/'databaseGameId'")
            continue
        game_id = str(game_id)

        if await db.raw_games.find_one({"game_id": game_id}, {"_id": 1}):
            skipped += 1
            continue

        fetched_at = entry.get("fetched_at")
        if isinstance(fetched_at, str):
            fetched_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        elif not isinstance(fetched_at, datetime):
            fetched_at = None

        try:
            await _store_game(
                db,
                game_id,
                raw,
                entry.get("source_username") or "manual",
                entry.get("player_color"),
                fetched_at=fetched_at,
            )
            stored += 1
        except Exception as exc:  # noqa: BLE001 -- one bad entry shouldn't abort the whole import
            errors.append(f"{game_id}: {exc}")

    return ImportResult(stored=stored, skipped=skipped, errors=errors)


async def rebuild_all_timelines(db: AsyncIOMotorDatabase) -> int:
    """Regenerate every `game_timelines` document from `raw_games`. Kept
    separate from rebuild_all_games -- a game_documents.py-only schema tweak
    (e.g. a new stat) shouldn't force every timeline to reprocess too, and a
    timeline_documents.py-only tweak shouldn't force every games document to
    reprocess either."""
    count = 0
    async for raw_doc in db.raw_games.find({}):
        timeline_document = build_timeline_document(raw_doc["raw"], raw_doc["fetched_at"])
        await db.game_timelines.update_one({"game_id": raw_doc["game_id"]}, {"$set": timeline_document}, upsert=True)
        count += 1
    return count
