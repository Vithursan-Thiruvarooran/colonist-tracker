"""Builds the `game_timelines` collection document from a raw colonist.io
replay payload -- the playback counterpart to game_documents.py's `games`
document, deliberately kept in its own collection and its own module.

A per-event timeline is an order of magnitude bigger than anything else on a
game document, is never touched by a cross-game aggregation pipeline (only
ever fetched whole, for one game, when someone opens its replay), and
iterates on its own schema cadence as the replay UI evolves -- letting it
ride along on the `games` document would bloat the working set every
`$group`/`$unwind` correlation query has to scan, even with a field
projection that only trims bytes over the wire, not bytes scanned. So it
gets its own collection, its own rebuild path (`rebuild_all_timelines`, see
game_ingest.py), and this own file, all independent of game_documents.py's.
`raw_games` stays the one shared source of truth both derive from.
"""
from __future__ import annotations

from datetime import datetime

from server.extractor.decode_game import build_timeline, resolve_players


def build_timeline_document(raw: dict, fetched_at: datetime) -> dict:
    players = resolve_players(raw)
    color_to_name = {p.color: p.name for p in players}
    eh = raw.get("eventHistory", {})
    timeline = build_timeline(eh, players, color_to_name)

    return {
        "game_id": str(raw.get("databaseGameId")),
        "built_at": fetched_at,
        "player_colors": timeline["player_colors"],
        "initial_board": timeline["initial_board"],
        "steps": timeline["steps"],
    }
