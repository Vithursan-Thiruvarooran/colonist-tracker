"""Shared CLI runner for the rebuild_*.py scripts: connect to Mongo, run one
rebuild coroutine against it, print how many documents it touched,
disconnect. Kept generic over which collection is being rebuilt so
rebuild_games.py / rebuild_timelines.py stay one-line callers instead of each
repeating the same connect/run/print/close sequence.
"""
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from server.config import MONGODB_DB, MONGODB_URI


def run_rebuild(rebuild: Callable[[AsyncIOMotorDatabase], Awaitable[int]], label: str) -> None:
    async def _main() -> None:
        client = AsyncIOMotorClient(MONGODB_URI)
        try:
            count = await rebuild(client[MONGODB_DB])
            print(f"Rebuilt {count} {label} from raw_games")
        finally:
            client.close()

    asyncio.run(_main())
