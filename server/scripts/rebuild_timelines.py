#!/usr/bin/env python3
"""Rebuild the derived `game_timelines` collection from `raw_games`.

Kept as a separate script from rebuild_games.py -- see rebuild_all_timelines's
docstring for why the two rebuild paths are independent.

Usage:
    python -m server.scripts.rebuild_timelines
"""
from __future__ import annotations

from server.scripts._rebuild_runner import run_rebuild
from server.services.game_ingest import rebuild_all_timelines

if __name__ == "__main__":
    run_rebuild(rebuild_all_timelines, "game timeline(s)")
