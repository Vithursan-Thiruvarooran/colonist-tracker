#!/usr/bin/env python3
"""Rebuild the derived `games` collection from `raw_games`.

`raw_games` is the durable source of truth -- every document there holds the
exact payload fetch_game.py (or a manual paste) originally returned. Whenever
the schema in server/services/game_documents.py changes, re-run this instead
of re-fetching anything from colonist.io.

Usage:
    python -m server.scripts.rebuild_games
"""
from __future__ import annotations

import asyncio

from motor.motor_asyncio import AsyncIOMotorClient

from server.config import MONGODB_DB, MONGODB_URI
from server.services.game_ingest import rebuild_all_games


async def main() -> None:
    client = AsyncIOMotorClient(MONGODB_URI)
    try:
        count = await rebuild_all_games(client[MONGODB_DB])
        print(f"Rebuilt {count} game(s) from raw_games")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
