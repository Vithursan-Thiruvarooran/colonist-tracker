#!/usr/bin/env python3
"""Rebuild the derived `games` collection from `raw_games`.

`raw_games` is the durable source of truth -- every document there holds the
exact payload a manual paste or the Chrome extension originally submitted.
Whenever the schema in server/services/game_documents.py changes, re-run
this instead of re-fetching anything from colonist.io.

Usage:
    python -m server.scripts.rebuild_games
"""
from __future__ import annotations

from server.scripts._rebuild_runner import run_rebuild
from server.services.game_ingest import rebuild_all_games

if __name__ == "__main__":
    run_rebuild(rebuild_all_games, "game(s)")
