"""Builds the derived, queryable `games` collection document from a raw
colonist.io replay payload -- the single place the `raw_games` -> `games`
schema mapping lives, so it can be re-run (via game_ingest.rebuild_all_games)
whenever this shape changes, without re-fetching anything from colonist.io.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from server.extractor.decode_game import decode


def _parse_iso8601(timestamp: Optional[str]) -> Optional[datetime]:
    if not timestamp:
        return None
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))


def _dice_distribution_by_roll(distribution: Optional[list]) -> dict:
    """decode()'s dice_roll_distribution is an 11-element list indexed by
    (roll - 2) -- index 0 is the count of 2s, index 10 the count of 12s.
    Relabel it as a {"<roll>": count} dict so it's self-describing once it's
    a standalone document field."""
    if not distribution:
        return {}
    return {str(roll): count for roll, count in zip(range(2, 13), distribution)}


def build_game_document(raw: dict, source_username: str, player_color: Optional[int], fetched_at: datetime) -> dict:
    decoded = decode(raw)

    resource_stats_by_name = decoded.get("resource_stats_by_player", {})
    activity_stats_by_name = decoded.get("activity_stats_by_player", {})

    players = []
    winner = None
    for player in decoded.get("players", []):
        name = player["name"]
        merged_player = dict(player)
        merged_player["resource_stats"] = resource_stats_by_name.get(name, {})
        merged_player["activity_stats"] = activity_stats_by_name.get(name, {})
        players.append(merged_player)
        if player.get("is_winner"):
            winner = {"user_id": player.get("user_id"), "name": name, "color": player.get("color")}

    settings = decoded.get("settings", {})

    return {
        "game_id": str(decoded.get("game_id")),
        "source_username": source_username,
        "player_color": player_color,
        "fetched_at": fetched_at,
        "played_at": _parse_iso8601(raw.get("eventHistory", {}).get("startTime")),
        "duration_ms": decoded.get("duration_ms"),
        "total_turns": decoded.get("total_turns"),
        "victory_points_to_win": settings.get("victory_points_to_win"),
        "is_ranked": settings.get("is_ranked"),
        "play_order": decoded.get("play_order", []),
        "winner": winner,
        "dice_roll_distribution": _dice_distribution_by_roll(decoded.get("dice_roll_distribution")),
        "players": players,
        "log": [
            {"index": entry["index"], "type": entry["type"], "player": entry["player"], "text": entry["text"]}
            for entry in decoded.get("log", [])
        ],
    }
