"""Orchestrates getting a game's replay data into Mongo, from either source
(the "fetch my N most recent games" flow, or a manually-pasted payload): the
raw payload always lands in `raw_games` first (the durable, reprocessable
source of truth), then `build_game_document()` derives the queryable `games`
document from it. `rebuild_all_games()` re-runs that second step for every
stored game, without touching colonist.io, whenever game_documents.py's
schema changes.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from functools import partial
from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from server.extractor.fetch_game import fetch_game
from server.models.game import FetchGamesResponse, FetchResult
from server.services.colonist_history import fetch_profile_history
from server.services.game_documents import build_game_document
from server.services.player_registry import relink_users_to_players, upsert_players_from_game

# Firing many replay-endpoint requests back-to-back with no gap appears to
# trip a colonist.io rate limit/cooldown on that endpoint specifically
# (observed: a burst of 30 rapid requests made every subsequent replay fetch
# -- even with a fresh, valid JWT -- return 403, while the unauthenticated
# history endpoint kept working throughout). Pace requests to avoid that.
REPLAY_FETCH_DELAY_SECONDS = 1.5


async def _to_thread(func, *args):
    """Backport of asyncio.to_thread (Python 3.9+) for this project's Python 3.8 venv."""
    return await asyncio.get_event_loop().run_in_executor(None, partial(func, *args))


def _select_games(history: dict, count: int) -> List[dict]:
    """Most recent `count` finished games with a replay available, newest first."""
    eligible = [g for g in history.get("gameDatas", []) if g.get("finished") and g.get("hasReplay")]
    eligible.sort(key=lambda g: int(g["startTime"]), reverse=True)
    return eligible[:count]


def _own_player_color(game: dict, profile_user_id: str) -> Optional[int]:
    for player in game.get("players", []):
        if player.get("userId") == profile_user_id:
            return player.get("playerColor")
    return None


def _unwrap_raw(raw: dict) -> dict:
    """Accept either fetch_game.py's unwrapped output or the raw Network-tab
    response ({"data": {...}}), matching decode_game.py's CLI behavior."""
    if "data" in raw and "eventHistory" not in raw:
        return raw["data"]
    return raw


async def _store_game(
    db: AsyncIOMotorDatabase, game_id: str, raw: dict, source_username: str, player_color: Optional[int]
) -> None:
    fetched_at = datetime.now(timezone.utc)
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


async def fetch_and_store_games(
    db: AsyncIOMotorDatabase, count: int, username: str, jwt: str
) -> FetchGamesResponse:
    history = await _to_thread(fetch_profile_history, username)
    profile_user_id = history.get("profileUserId")

    results: List[FetchResult] = []
    for game in _select_games(history, count):
        game_id = game["id"]

        if await db.raw_games.find_one({"game_id": game_id}, {"_id": 1}):
            results.append(FetchResult(game_id=game_id, status="skipped", reason="already_stored"))
            continue

        player_color = _own_player_color(game, profile_user_id)
        if player_color is None:
            results.append(FetchResult(game_id=game_id, status="skipped", reason="player_not_found"))
            continue

        await asyncio.sleep(REPLAY_FETCH_DELAY_SECONDS)
        try:
            raw = await _to_thread(fetch_game, game_id, player_color, jwt)
        except Exception as exc:  # noqa: BLE001 -- surfaced to the caller per-game, not raised
            results.append(FetchResult(game_id=game_id, status="skipped", reason=f"fetch_error: {exc}"))
            continue

        await _store_game(db, game_id, raw, username, player_color)
        results.append(FetchResult(game_id=game_id, status="stored"))

    stored_count = sum(1 for r in results if r.status == "stored")
    return FetchGamesResponse(
        requested_count=count,
        stored_count=stored_count,
        skipped_count=len(results) - stored_count,
        results=results,
    )


async def ingest_raw_game(db: AsyncIOMotorDatabase, raw: dict) -> FetchResult:
    """Store a manually-pasted raw replay payload, as a workaround when the
    replay endpoint itself is inaccessible (e.g. Cloudflare blocking).
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
