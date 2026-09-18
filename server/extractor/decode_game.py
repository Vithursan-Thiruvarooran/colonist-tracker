#!/usr/bin/env python3
"""Decode colonist.io's raw replay API JSON into clean, human-readable
structured game data.

All of colonist.io's numeric codes (resource/piece/achievement/dev-card/tile
enums, message types, and victory-point sources) are defined as IntEnums
below -- ResourceCard, PieceType, Achievement, DevCard, DistributionType,
TileType, MessageType, VictoryPointSource -- rather than hardcoded inline,
since colonist.io doesn't publish them and they were reverse-engineered by
cross-referencing the DOM-rendered log text (icon alt attributes like
"Lumber"/"Brick") against the API's gameLogState entries in a real game. If
colonist.io's payload shape changes or a new code turns up, only these enum
definitions (and their matching *_NAMES dict, where one exists) need
updating -- see each enum's docstring for what's confirmed vs. still
unknown.

Usage:
    python3 server/extractor/decode_game.py game_data.json [-o decoded.json]
"""
from __future__ import annotations

import argparse
import copy
import dataclasses
import enum
import json
import math
import sys
from pathlib import Path
from typing import Optional


class ResourceCard(enum.IntEnum):
    """cardEnum values for resource cards (trades, discards, robbery, distribution)."""

    LUMBER = 1
    BRICK = 2
    WOOL = 3
    GRAIN = 4
    ORE = 5
    ANY = 9  # wildcard, e.g. a discard/steal placeholder


class PieceType(enum.IntEnum):
    """pieceEnum values. ROAD/SETTLEMENT/CITY are buildable pieces; ROBBER is
    not buildable -- it's what every MessageType.ROBBER_MOVED entry carries."""

    ROAD = 0
    SETTLEMENT = 2
    CITY = 3
    ROBBER = 5


class Achievement(enum.IntEnum):
    """achievementEnum values."""

    LONGEST_ROAD = 0
    LARGEST_ARMY = 1


class DevCard(enum.IntEnum):
    """cardEnum values for development cards, on MessageType.DEV_CARD_PLAYED.

    All five confirmed by checking what immediately follows each play:
    KNIGHT precedes a robber move; MONOPOLY precedes a monopoly effect
    (MessageType.MONOPOLY_PLAYED); ROAD_BUILDING precedes two consecutive
    free MessageType.FREE_PLACEMENT road placements by the same player;
    YEAR_OF_PLENTY precedes a MessageType.YEAR_OF_PLENTY_RESOURCES grant of
    exactly 2 chosen resources; VICTORY_POINT is never played (no "used"
    action) -- it sits unplayed in a player's hand and is confirmed by
    matching an unplayed card's count against that player's final
    VictoryPointSource.VICTORY_POINT_CARDS count.
    """

    KNIGHT = 11
    VICTORY_POINT = 12
    MONOPOLY = 13
    ROAD_BUILDING = 14
    YEAR_OF_PLENTY = 15


class DistributionType(enum.IntEnum):
    """distributionType values on a MessageType.RESOURCE_DISTRIBUTION entry.

    Both confirmed: STARTING on setup-phase resource grants, ROLL on every
    regular dice-roll production grant.
    """

    STARTING = 0
    ROLL = 1


class TileType(enum.IntEnum):
    """Terrain `type` on a mapState.tileHexStates hex, and the numerically
    identical `resourceType` carried on a tileInfo payload (e.g. on
    MessageType.ROBBER_MOVED/TILE_EVENT) for any producing tile. Confirmed
    by cross-referencing the board's initial tileHexStates (dice number +
    terrain type) against tileInfo entries sharing the same dice number.
    DESERT never carries a resourceType (nothing to produce)."""

    DESERT = 0
    FOREST = 1  # produces ResourceCard.LUMBER
    HILLS = 2  # produces ResourceCard.BRICK
    PASTURE = 3  # produces ResourceCard.WOOL
    FIELDS = 4  # produces ResourceCard.GRAIN
    MOUNTAINS = 5  # produces ResourceCard.ORE


class BuildingType(enum.IntEnum):
    """buildingType values on a mapState.tileCornerStates corner, once
    something is built there. Distinct from PieceType's pieceEnum (2/3) --
    this is a separate, smaller enum specific to corner occupancy. Confirmed
    by observing a corner's buildingType go 1 -> 2 on the same corner index
    between a settlement's initial placement and its later city upgrade
    (the upgrade's stateChange only repeats buildingType, not owner --
    see build_merged_map_state's deep-merge requirement)."""

    SETTLEMENT = 1
    CITY = 2


class PortType(enum.IntEnum):
    """type values on a mapState.portEdgeStates port. NOT independently
    confirmed against a real port trade -- inferred by elimination from a
    real board's 9 ports: type 1 appears 4 times (the four generic 3:1
    ports) while 2-6 each appear exactly once (the five resource-specific
    2:1 ports), so 2-6 are assumed to map onto ResourceCard.LUMBER..ORE
    (1-5) offset by 1 to leave room for GENERIC. Treat the specific
    resource assignment here as a best guess pending confirmation."""

    GENERIC = 1
    LUMBER = 2
    BRICK = 3
    WOOL = 4
    GRAIN = 5
    ORE = 6


class MessageType(enum.IntEnum):
    """The gameLogState entry's "type" field -- one value per kind of game event.

    Reverse-engineered and cross-validated against a real game: the
    DOM-rendered log text (icon alt attributes like "Lumber"/"Brick") was
    matched against the API's gameLogState entries in sequence to confirm
    each code.
    """

    CHAT = 0
    DEV_CARD_BOUGHT = 1
    GAME_START = 2
    FREE_PLACEMENT = 4  # setup-phase placement, and each Road Building road
    PLACEMENT = 5
    DICE_ROLL = 10
    ROBBER_MOVED = 11
    ROBBERY_PRIVATE_THIEF = 14  # sent only to the thief; playerColor is the victim
    ROBBERY_PRIVATE_VICTIM = 15  # sent only to the victim; playerColor is the thief
    ROBBERY_PUBLIC = 16  # visible to everyone, no resource type shown
    DEV_CARD_PLAYED = 20
    YEAR_OF_PLENTY_RESOURCES = 21  # the 2 resources granted by a Year of Plenty play
    PLAYER_DISCONNECTED = 24  # is10SecondRuleDisabled:true; reconnect follows as a bare CHAT (no "message")
    SEPARATOR = 44
    WIN = 45
    RESOURCE_DISTRIBUTION = 47
    TILE_EVENT = 49
    DISCARD = 55
    ACHIEVEMENT_NEW = 66
    ACHIEVEMENT_TRANSFERRED = 68
    MONOPOLY_PLAYED = 86
    TRADE_PLAYER = 115
    TRADE_BANK = 116
    TRADE_COUNTER_OFFER = 117
    TRADE_OFFER_OPEN = 118
    BANK_RESOURCE_SHORTAGE = 146  # a roll produced more of cardEnum than bankCount had -- distributedCount stays 0 for playerColors


class VictoryPointSource(enum.IntEnum):
    """Keys of endGameState.players[color].victoryPoints -- how a player's
    final VP total breaks down by source. Confirmed directly (not
    reverse-engineered): settlements/cities/VP-dev-cards are always present
    (defaulting to 0 unheld), while LARGEST_ARMY/LONGEST_ROAD only appear for
    whichever player holds each bonus.
    """

    SETTLEMENTS = 0
    CITIES = 1
    VICTORY_POINT_CARDS = 2
    LARGEST_ARMY = 3
    LONGEST_ROAD = 4


# NOT YET CONFIRMED (each observed only once, always right after a robber
# move with no theft following -- plausibly related to how many players are
# eligible to be robbed, but the exact semantics aren't nailed down):
#   - MessageType 58: {playerColor, pieceEnum: 5} -- immediately precedes a
#     ROBBER_MOVED with the same playerColor/pieceEnum
#   - MessageType 139: {playerCount} -- immediately follows a ROBBER_MOVED

RESOURCE_NAMES = {
    ResourceCard.LUMBER: "Lumber",
    ResourceCard.BRICK: "Brick",
    ResourceCard.WOOL: "Wool",
    ResourceCard.GRAIN: "Grain",
    ResourceCard.ORE: "Ore",
    ResourceCard.ANY: "Any Resource",
}
PIECE_NAMES = {
    PieceType.ROAD: "Road",
    PieceType.SETTLEMENT: "Settlement",
    PieceType.CITY: "City",
}
ACHIEVEMENT_NAMES = {
    Achievement.LONGEST_ROAD: "Longest Road",
    Achievement.LARGEST_ARMY: "Largest Army",
}
DEV_CARD_NAMES = {
    DevCard.KNIGHT: "Knight",
    DevCard.VICTORY_POINT: "Victory Point",
    DevCard.MONOPOLY: "Monopoly",
    DevCard.ROAD_BUILDING: "Road Building",
    DevCard.YEAR_OF_PLENTY: "Year of Plenty",
}
# snake_case keys for dev_cards_by_player()'s output, one per DevCard plus the
# "unknown" bucket below.
DEV_CARD_STAT_NAMES = {
    DevCard.KNIGHT: "knight",
    DevCard.VICTORY_POINT: "victory_point",
    DevCard.MONOPOLY: "monopoly",
    DevCard.ROAD_BUILDING: "road_building",
    DevCard.YEAR_OF_PLENTY: "year_of_plenty",
}
TILE_TYPE_NAMES = {
    TileType.DESERT: "Desert",
    TileType.FOREST: "Forest",
    TileType.HILLS: "Hills",
    TileType.PASTURE: "Pasture",
    TileType.FIELDS: "Fields",
    TileType.MOUNTAINS: "Mountains",
}
BUILDING_TYPE_NAMES = {
    BuildingType.SETTLEMENT: "settlement",
    BuildingType.CITY: "city",
}
PORT_TYPE_NAMES = {
    PortType.GENERIC: "3:1",
    PortType.LUMBER: "Lumber 2:1",
    PortType.BRICK: "Brick 2:1",
    PortType.WOOL: "Wool 2:1",
    PortType.GRAIN: "Grain 2:1",
    PortType.ORE: "Ore 2:1",
}
VICTORY_POINT_SOURCE_NAMES = {
    VictoryPointSource.SETTLEMENTS: "settlements",
    VictoryPointSource.CITIES: "cities",
    VictoryPointSource.VICTORY_POINT_CARDS: "victory_point_cards",
    VictoryPointSource.LARGEST_ARMY: "largest_army",
    VictoryPointSource.LONGEST_ROAD: "longest_road",
}
# Per-unit VP each source's raw count is worth. SETTLEMENTS/VICTORY_POINT_CARDS
# are already a 1-VP-each count; CITIES is a *city count* (each city is worth
# 2 VP, not 1); LARGEST_ARMY/LONGEST_ROAD are a boolean-ish "1 = held" flag
# worth a flat 2 VP. Confirmed by reconstructing settlement/city counts from
# the game log's PLACEMENT entries and checking the weighted sum against each
# player's `rank` and the game's victoryPointsToWin.
VICTORY_POINT_WEIGHTS = {
    VictoryPointSource.SETTLEMENTS: 1,
    VictoryPointSource.CITIES: 2,
    VictoryPointSource.VICTORY_POINT_CARDS: 1,
    VictoryPointSource.LARGEST_ARMY: 2,
    VictoryPointSource.LONGEST_ROAD: 2,
}


def dev_card_name(code: Optional[int]) -> str:
    if code is None:
        return "?"
    return DEV_CARD_NAMES.get(code, f"card#{code}")


def resource_name(code: Optional[int]) -> str:
    if code is None:
        return "?"
    return RESOURCE_NAMES.get(code, f"resource#{code}")


def resource_names(codes) -> list:
    return [resource_name(c) for c in (codes or [])]


def piece_name(code: Optional[int]) -> str:
    if code is None:
        return "?"
    return PIECE_NAMES.get(code, f"piece#{code}")


def tile_type_name(code: Optional[int]) -> str:
    if code is None:
        return "?"
    return TILE_TYPE_NAMES.get(code, f"tile#{code}")


def building_type_name(code: Optional[int]) -> Optional[str]:
    if code is None:
        return None
    return BUILDING_TYPE_NAMES.get(code, f"building#{code}")


def port_type_name(code: Optional[int]) -> str:
    if code is None:
        return "?"
    return PORT_TYPE_NAMES.get(code, f"port#{code}")


def victory_points_by_source(vp_by_source: dict) -> dict:
    """endGameState.players[color].victoryPoints, with its numeric-string keys
    (e.g. "0", "1") renamed to VICTORY_POINT_SOURCE_NAMES and its raw
    per-source counts converted to the actual VP each source contributes via
    VICTORY_POINT_WEIGHTS (e.g. a raw CITIES count of 1 becomes 2) -- so this
    dict's values always sum to the player's true final VP total. LARGEST_ARMY/
    LONGEST_ROAD are only present in the raw dict for whoever holds them, so
    the result likewise omits a source a player doesn't have (rather than
    reporting it as 0)."""
    result = {}
    for key, value in vp_by_source.items():
        try:
            source = VictoryPointSource(int(key))
        except ValueError:
            result[f"source#{key}"] = value
            continue
        result[VICTORY_POINT_SOURCE_NAMES[source]] = value * VICTORY_POINT_WEIGHTS[source]
    return result


@dataclasses.dataclass
class Player:
    color: int
    user_id: Optional[str]
    name: str
    country_code: Optional[str]
    is_bot: bool
    is_winner: bool
    rank: Optional[int]
    final_victory_points: Optional[int]
    victory_points_by_source: dict


@dataclasses.dataclass
class LogEntry:
    index: int
    type: int
    player: Optional[str]
    text: str
    raw: dict


def build_merged_gamelog(event_history: dict) -> dict:
    log = dict(event_history.get("initialState", {}).get("gameLogState", {}))
    for event in event_history.get("events", []):
        log.update(event.get("stateChange", {}).get("gameLogState", {}))
    return log


def _deep_merge(base: dict, updates: dict) -> None:
    """Recursively merge updates into base in place.

    Unlike gameLogState (where each event is a complete, standalone new
    entry, so a shallow per-key update is correct), a mapState delta only
    carries the fields that changed for a given corner/edge index -- e.g. a
    city upgrade's delta is `{"buildingType": 2}`, it does not repeat
    "owner". A shallow update would silently erase whatever isn't repeated,
    so every level down to the leaf property has to merge, not replace.
    """
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value


def build_merged_map_state(event_history: dict) -> dict:
    map_state = copy.deepcopy(event_history.get("initialState", {}).get("mapState", {}))
    for event in event_history.get("events", []):
        update = event.get("stateChange", {}).get("mapState")
        if update:
            _deep_merge(map_state, update)
    return map_state


def build_merged_robber_state(event_history: dict) -> dict:
    # Flat (isActive/locationTileIndex only), so a shallow update is fine.
    state = dict(event_history.get("initialState", {}).get("mechanicRobberState", {}))
    for event in event_history.get("events", []):
        update = event.get("stateChange", {}).get("mechanicRobberState")
        if update:
            state.update(update)
    return state


# --- corner/edge pixel geometry -------------------------------------------
# Ported from app/app/lib/boardGeometry.ts's hexCenter/cornerPosition -- see
# that file's docstrings for exactly how these angles were reverse-engineered
# (settlement+road adjacency ground truth, cross-checked against colonist's
# own resource-grant events) and then validated exhaustively (zero duplicate
# edge segments, every corner at degree 2 or 3, every port on a real edge
# midpoint) across every stored game. This is only what's needed here --
# resolving which real hexes a corner touches -- not full edge/port pixel
# placement, which stays a frontend-only concern. If boardGeometry.ts's
# angles ever change, mirror the change here too; there's no shared module
# across the Python/TypeScript boundary.
_SQRT3 = math.sqrt(3)
_HEX_V1 = (1.0, 0.0)
_HEX_V2 = (-0.5, _SQRT3 / 2)
_HEX_V3 = (-0.5, -_SQRT3 / 2)
_ROTATION_RAD = math.radians(-30)
_CORNER_ANGLE_BY_Z = {0: 300, 1: 120}


def _hex_center(x: int, y: int) -> tuple:
    z = -x - y
    raw = (x * _HEX_V1[0] + y * _HEX_V2[0] + z * _HEX_V3[0], x * _HEX_V1[1] + y * _HEX_V2[1] + z * _HEX_V3[1])
    c, s = math.cos(_ROTATION_RAD), math.sin(_ROTATION_RAD)
    return (raw[0] * c - raw[1] * s, raw[0] * s + raw[1] * c)


def _corner_pixel(corner_x: int, corner_y: int, corner_z: int) -> tuple:
    cx, cy = _hex_center(corner_x, corner_y)
    angle = math.radians(_CORNER_ANGLE_BY_Z[corner_z])
    c, s = math.cos(_ROTATION_RAD), math.sin(_ROTATION_RAD)
    dx, dy = math.cos(angle), math.sin(angle)
    dx, dy = (dx * c - dy * s, dx * s + dy * c)
    return (cx + dx, cy + dy)


def _corner_hex_indices(corner_x: int, corner_y: int, corner_z: int, hexes: list) -> list:
    """Which of the board's real hexes this corner touches (1-3 -- fewer on
    the coastline), by exact pixel-distance match: a corner sits exactly 1
    unit (the hex circumradius) from the center of every hex it's a vertex
    of."""
    px, py = _corner_pixel(corner_x, corner_y, corner_z)
    indices = []
    for hex_state in hexes:
        hx, hy = _hex_center(hex_state["x"], hex_state["y"])
        if math.isclose(math.hypot(px - hx, py - hy), 1.0, abs_tol=1e-6):
            indices.append(hex_state["index"])
    return indices


PIP_COUNTS = {2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1}


def pip_count(dice_number: Optional[int]) -> int:
    """Standard Catan dice-frequency weight for a hex's number token -- 0 for
    the desert (dice_number is None) or any other absent/unknown number."""
    return PIP_COUNTS.get(dice_number, 0) if dice_number is not None else 0


def _sorted_by_numeric_key(d: dict) -> list:
    """dict.items(), ordered by each (numeric-string) key as an int. Every
    mapState/gameLogState sub-dict from colonist.io uses string keys that are
    really integer indices, so plain string sort order would put "10" before
    "2" -- this is the one place that knows to correct for that, reused
    everywhere such a dict gets iterated in index order."""
    return sorted(d.items(), key=lambda kv: int(kv[0]))


def _board_from_map_state(map_state: dict, robber_state: dict, color_to_name: dict) -> dict:
    """Shared by build_board (the final, fully-merged board) and
    build_initial_board (the board exactly as dealt, before any event is
    applied) -- same per-hex/corner/edge/port dict construction either way,
    just fed a different map_state.

    Confirmed against a real 4-player game: 19 hexes, 54 corners, 72 edges,
    9 ports -- exactly the standard Catan board's counts. Hex-hex adjacency
    (cube-coordinate distance, z = -x - y) gives exactly 42 internal + 30
    boundary edges, matching the board's real topology exactly (72 edges =
    19*6 hex-sides minus double-counted internal ones), so the hex x/y
    coordinates are trustworthy as-is.

    Corner/edge x/y/z are NOT a simple transform of the hex x/y coordinate
    system (tried: scaling, a hidden axis offset, axis permutation/sign
    flips, optimal bipartite matching against the geometrically-correct hex
    layout -- none converge), so edge/port pixel placement stays a
    frontend-only concern (see boardGeometry.ts) and edges/ports are passed
    through here as opaque raw x/y/z. Corners are the exception: each one
    additionally gets `hex_indices`, resolved via the same geometry, since
    cross-game analytics (pip count, resource diversity of a starting
    placement) need real hex adjacency, not just a pixel position.
    """
    hexes = [
        {
            "index": int(idx),
            "terrain": tile_type_name(hex_state.get("type")),
            # The desert carries diceNumber: 0 (nothing to roll for), not
            # None/absent -- normalize so "no dice number" is unambiguous.
            "dice_number": hex_state.get("diceNumber") or None,
            "x": hex_state.get("x"),
            "y": hex_state.get("y"),
        }
        for idx, hex_state in _sorted_by_numeric_key(map_state.get("tileHexStates", {}))
    ]
    ports = [
        {
            "index": int(idx),
            "port_type": port_type_name(port.get("type")),
            "x": port.get("x"),
            "y": port.get("y"),
            "z": port.get("z"),
        }
        for idx, port in _sorted_by_numeric_key(map_state.get("portEdgeStates", {}))
    ]
    corners = [
        {
            "index": int(idx),
            "x": corner.get("x"),
            "y": corner.get("y"),
            "z": corner.get("z"),
            "building_type": building_type_name(corner.get("buildingType")),
            "owner": color_to_name.get(corner.get("owner")),
            "hex_indices": _corner_hex_indices(corner.get("x"), corner.get("y"), corner.get("z"), hexes),
        }
        for idx, corner in _sorted_by_numeric_key(map_state.get("tileCornerStates", {}))
    ]
    edges = [
        {
            "index": int(idx),
            "x": edge.get("x"),
            "y": edge.get("y"),
            "z": edge.get("z"),
            "owner": color_to_name.get(edge.get("owner")),
        }
        for idx, edge in _sorted_by_numeric_key(map_state.get("tileEdgeStates", {}))
    ]
    for hex_dict in hexes:
        hex_dict["pips"] = pip_count(hex_dict["dice_number"])

    return {
        "hexes": hexes,
        "ports": ports,
        "corners": corners,
        "edges": edges,
        "robber_tile_index": robber_state.get("locationTileIndex"),
    }


def build_board(event_history: dict, color_to_name: dict) -> dict:
    """Reconstructs the physical board from eventHistory.initialState.mapState
    -- a sibling of gameLogState that this module didn't previously read at
    all -- merged with each event's stateChange deltas the same way the game
    log is merged, but with a deep merge (see _deep_merge) since corner/edge
    occupancy deltas are partial. See _board_from_map_state for the per-item
    shape."""
    map_state = build_merged_map_state(event_history)
    robber_state = build_merged_robber_state(event_history)
    return _board_from_map_state(map_state, robber_state, color_to_name)


def build_initial_board(event_history: dict, color_to_name: dict) -> dict:
    """The board exactly as dealt, before any event is applied -- same shape
    as build_board (see _board_from_map_state), but read from initialState
    alone rather than merged forward. Every corner/edge here is unbuilt
    (building_type/owner both None) since colonist deals the board before
    any placement happens; terrain/dice/port layout matches build_board's
    exactly, since that never changes mid-game, only ownership does. This is
    the timeline's fold base -- see build_timeline."""
    initial_state = event_history.get("initialState", {})
    return _board_from_map_state(
        initial_state.get("mapState", {}), initial_state.get("mechanicRobberState", {}), color_to_name
    )


def dev_cards_by_player(merged_log: dict, players: list) -> dict:
    """Per-player dev card counts by type, keyed by player name.

    A dev card's type is public once played (MessageType.DEV_CARD_PLAYED
    carries cardEnum), but colonist.io never reveals a bought card's type
    while it sits unplayed in a hand -- MessageType.DEV_CARD_BOUGHT carries
    no cardEnum (confirmed: every such entry in a real game omits it,
    including the perspective player's own purchases). So a still-unplayed
    card's type is only knowable for VICTORY_POINT (it's never played, and
    victory_points_by_source's count for a player is exactly their unplayed
    VICTORY_POINT holdings); any remaining bought-but-unaccounted-for cards
    go to "unknown" rather than being guessed at.
    """
    bought_by_color: dict = {}
    played_by_color: dict = {}
    for entry in merged_log.values():
        entry_text = entry.get("text", {})
        color = entry_text.get("playerColor")
        if entry_text.get("type") == MessageType.DEV_CARD_BOUGHT:
            bought_by_color[color] = bought_by_color.get(color, 0) + 1
        elif entry_text.get("type") == MessageType.DEV_CARD_PLAYED:
            card = entry_text.get("cardEnum")
            played_by_color.setdefault(color, {})
            played_by_color[color][card] = played_by_color[color].get(card, 0) + 1

    result = {}
    for player in players:
        counts = {name: 0 for name in DEV_CARD_STAT_NAMES.values()}
        counts["unknown"] = 0
        played = played_by_color.get(player.color, {})
        for card, count in played.items():
            counts[DEV_CARD_STAT_NAMES.get(card, "unknown")] += count
        vp_cards = player.victory_points_by_source.get("victory_point_cards", 0)
        counts["victory_point"] += vp_cards
        unaccounted = bought_by_color.get(player.color, 0) - sum(played.values()) - vp_cards
        if unaccounted > 0:
            counts["unknown"] += unaccounted
        result[player.name] = counts
    return result


def _pairwise_counts(merged_log: dict, message_type: MessageType, row_key: str, col_key: str, color_to_name: dict) -> dict:
    """{row_name: {col_name: count}} for every merged_log entry of a given
    message type, resolving two of its color fields to player names --
    shared by robbery_matrix and trade_matrix, which differ only in which
    message type and which two fields name the pair."""
    matrix: dict = {}
    for entry in merged_log.values():
        entry_text = entry.get("text", {})
        if entry_text.get("type") != message_type:
            continue
        row = color_to_name.get(entry_text.get(row_key))
        col = color_to_name.get(entry_text.get(col_key))
        if row is None or col is None:
            continue
        row_counts = matrix.setdefault(row, {})
        row_counts[col] = row_counts.get(col, 0) + 1
    return matrix


def robbery_matrix(merged_log: dict, color_to_name: dict) -> dict:
    """Who robbed whom -- {thief_name: {victim_name: count}}, from every
    MessageType.ROBBERY_PUBLIC entry, the one form that names both thief and
    victim directly. The two private forms (ROBBERY_PRIVATE_THIEF/VICTIM)
    only exist to reveal the stolen card's type to the two people involved
    -- perspective-dependent duplicates of the same event -- so aren't
    counted here too (confirmed 1:1:1 with the public form in a real game:
    20 of each, no public robbery missing its private pair or vice versa)."""
    return _pairwise_counts(merged_log, MessageType.ROBBERY_PUBLIC, "playerColorThief", "playerColorVictim", color_to_name)


def trade_matrix(merged_log: dict, color_to_name: dict) -> dict:
    """Who traded with whom -- {proposer_name: {accepter_name: count}}, from
    every MessageType.TRADE_PLAYER entry: a *completed* player-to-player
    trade. MessageType.TRADE_BANK is excluded (that's not between two
    players); TRADE_COUNTER_OFFER/TRADE_OFFER_OPEN are proposals that may
    never be accepted, not a trade that happened."""
    return _pairwise_counts(merged_log, MessageType.TRADE_PLAYER, "playerColor", "acceptingPlayerColor", color_to_name)


def rejected_trade_matrix(event_history: dict, color_to_name: dict) -> dict:
    """Who rejected whose trade offer -- {proposer_name: {rejecter_name:
    count}}, the same row/column orientation as trade_matrix (row is who
    proposed) so an offer's accept vs. reject rate is directly comparable
    between the two matrices.

    Colonist doesn't log a "trade rejected" message type -- this is derived
    from eventHistory.events[*].stateChange.tradeState instead, a sibling of
    gameLogState/mapState this module didn't previously read. Each trade
    offer gets an id; unlike gameLogState (one complete entry per action),
    tradeState.activeOffers[id] carries only what changed about that offer
    since the last event -- creation (`creator`, the offered/wanted cards),
    then a delta as each other player's response comes in
    (`playerResponses: {colorAsString: code}`, 0=pending/1=accepted/
    2=declined -- confirmed by cross-referencing a real game's completed
    trades against which player's response was 1 right before that offer
    closed), then finally `null` once the offer closes for any reason
    (accepted, declined by everyone, or superseded). A rejection is counted
    for every player whose *final* recorded response on a now-closed offer
    was 2 (declined) -- evaluated at closure so a response that was updated
    more than once only counts once, in its last known state.

    This needs its own running per-offer merge, not build_merged_map_state's
    `_deep_merge`: there, a field set to `None` really means "this field is
    now null" (never happens for corner/edge deltas in practice), whereas
    here `null` means "this offer is gone, stop tracking it and use what you
    already know about it" -- a materially different meaning that a generic
    deep-merge would get wrong (it would just overwrite the offer's
    accumulated state with `None` and lose the very data this needs).
    """
    active_offers: dict = {}
    matrix: dict = {}

    for event in event_history.get("events", []):
        offers_delta = event.get("stateChange", {}).get("tradeState", {}).get("activeOffers", {})
        for offer_id, delta in offers_delta.items():
            if delta is None:
                offer = active_offers.pop(offer_id, None)
                if offer is None:
                    continue
                proposer = color_to_name.get(offer.get("creator"))
                if proposer is None:
                    continue
                row = None
                for player_color, response in offer["player_responses"].items():
                    if response != 2:
                        continue
                    rejecter = color_to_name.get(int(player_color))
                    if rejecter is None:
                        continue
                    row = row if row is not None else matrix.setdefault(proposer, {})
                    row[rejecter] = row.get(rejecter, 0) + 1
                continue
            offer = active_offers.setdefault(offer_id, {"player_responses": {}})
            if "creator" in delta:
                offer["creator"] = delta["creator"]
            if "playerResponses" in delta:
                offer["player_responses"].update(delta["playerResponses"])

    return matrix


def iter_decoded_events(event_history: dict, color_to_name: dict):
    """Walks eventHistory["events"] in order, yielding one record per raw
    event with its gameLogState entries and mapState/robber deltas decoded --
    unlike build_merged_gamelog/build_merged_map_state, nothing here is
    merged into a running snapshot, so this is the one place that can pair a
    log entry with the corner/edge delta from the *same* event that produced
    it. That pairing matters because a gameLogState entry carries no
    corner/edge index of its own (confirmed directly against raw events: a
    FREE_PLACEMENT settlement entry is exactly `{pieceEnum, playerColor,
    type}` -- the corner index only exists in that event's sibling
    `stateChange.mapState.tileCornerStates` key) -- see starting_placements
    below, the reason this generator exists. Shared with build_timeline
    (server/services/timeline_documents.py) so there's exactly one
    event-walking implementation, not two that could drift apart.
    """
    for step_index, event in enumerate(event_history.get("events", [])):
        state_change = event.get("stateChange", {})
        log_state = state_change.get("gameLogState", {})
        map_state = state_change.get("mapState", {})
        robber_state = state_change.get("mechanicRobberState", {})

        log_entries = []
        for log_idx, raw_entry in _sorted_by_numeric_key(log_state):
            entry_text = dict(raw_entry.get("text", {}))
            entry_text.setdefault("from", raw_entry.get("from"))
            entry_text.setdefault("specificRecipients", raw_entry.get("specificRecipients"))
            player_color = entry_text.get("playerColor") or entry_text.get("from")
            log_entries.append(
                {
                    "index": int(log_idx),
                    "type": entry_text.get("type"),
                    "player": color_to_name.get(player_color) if player_color else None,
                    "text": describe(entry_text, color_to_name),
                }
            )

        corner_deltas = [
            {
                "index": int(idx),
                "building_type": building_type_name(delta["buildingType"]) if "buildingType" in delta else None,
                "owner": color_to_name.get(delta["owner"]) if "owner" in delta else None,
            }
            for idx, delta in map_state.get("tileCornerStates", {}).items()
        ]
        edge_deltas = [
            {"index": int(idx), "owner": color_to_name.get(delta["owner"]) if "owner" in delta else None}
            for idx, delta in map_state.get("tileEdgeStates", {}).items()
        ]

        yield {
            "step_index": step_index,
            "log_entries": log_entries,
            "corner_deltas": corner_deltas,
            "edge_deltas": edge_deltas,
            "robber_tile_index": robber_state.get("locationTileIndex"),
        }


# Terrain name -> resource name, e.g. "Forest" -> "Lumber". Derived from
# TileType/ResourceCard rather than hand-maintained separately: every
# resource-producing TileType member shares its underlying int with the
# ResourceCard it produces (see TileType's docstring, e.g. FOREST=1 ->
# ResourceCard.LUMBER=1), so this stays correct automatically if either enum
# or its *_NAMES dict ever changes.
_TERRAIN_RESOURCE_NAMES = {
    TILE_TYPE_NAMES[terrain]: RESOURCE_NAMES[ResourceCard(terrain.value)]
    for terrain in TileType
    if terrain != TileType.DESERT
}


def starting_placements(event_history: dict, color_to_name: dict, board: dict) -> dict:
    """Each player's two setup-phase settlements -- combined pip count and
    resource diversity of every hex they touch, keyed by player name, for
    cross-game correlation against final score.

    A settlement's corner index only exists in the raw event stream (see
    iter_decoded_events), so this walks events looking for
    MessageType.FREE_PLACEMENT log entries whose *same* event also carries a
    corner delta (the road half of the round -- also FREE_PLACEMENT -- has an
    edge delta instead, and is skipped by the empty-corner_deltas check;
    FREE_PLACEMENT is exclusively setup placements and Road Building's free
    roads, so no later paid build is ever seen here). Takes the first two
    such settlements per player -- there are ever only two, from Catan's
    standard setup phase.
    """
    hexes_by_index = {h["index"]: h for h in board["hexes"]}
    corners_by_index = {c["index"]: c for c in board["corners"]}

    settlement_corners_by_player: dict = {}
    for step in iter_decoded_events(event_history, color_to_name):
        if not step["corner_deltas"]:
            continue
        for log_entry in step["log_entries"]:
            if log_entry["type"] != MessageType.FREE_PLACEMENT or log_entry["player"] is None:
                continue
            seen = settlement_corners_by_player.setdefault(log_entry["player"], [])
            if len(seen) < 2:
                seen.append(step["corner_deltas"][0]["index"])
            break

    result = {}
    for player, corner_indices in settlement_corners_by_player.items():
        touched_hexes = []
        seen_hex_indices = set()
        for corner_idx in corner_indices:
            corner = corners_by_index.get(corner_idx)
            if not corner:
                continue
            for hex_idx in corner["hex_indices"]:
                if hex_idx in seen_hex_indices:
                    continue
                seen_hex_indices.add(hex_idx)
                hex_state = hexes_by_index.get(hex_idx)
                if hex_state:
                    touched_hexes.append(hex_state)

        resources: dict = {}
        for hex_state in touched_hexes:
            resource = _TERRAIN_RESOURCE_NAMES.get(hex_state["terrain"])
            if resource:
                resources[resource] = resources.get(resource, 0) + 1

        result[player] = {
            "starting_placement_pips": sum(h["pips"] for h in touched_hexes),
            "starting_placement_resource_diversity": len(resources),
            "starting_placement_resources": resources,
        }
    return result


def build_timeline(event_history: dict, players: list, color_to_name: dict) -> dict:
    """The full per-event timeline for playback: the board's pre-game state
    (initial_board) plus every step iter_decoded_events yields. A frontend
    reducer folds steps[0..k] onto initial_board to reconstruct the board at
    step k (see app/app/lib/timelineFold.ts) -- the same idea as
    _deep_merge's final-state reconstruction, just stopped partway instead of
    run to completion. This is a separate, opt-in entry point from decode()
    (called only by server/services/timeline_documents.py) rather than
    folded into decode()'s own return, so decode()'s existing CLI/debugging
    contract doesn't balloon for callers that don't need per-event detail.
    """
    return {
        # String keys -- MongoDB documents can't have int keys, and
        # GameTimeline's Dict[int, str] Pydantic field coerces them back on
        # read, the same way dice_roll_distribution's "2".."12" keys work.
        "player_colors": {str(p.color): p.name for p in players},
        "initial_board": build_initial_board(event_history, color_to_name),
        "steps": list(iter_decoded_events(event_history, color_to_name)),
    }


def resolve_players(data: dict) -> list:
    end_players = data.get("eventHistory", {}).get("endGameState", {}).get("players", {})
    players = []
    for user in data.get("playerUserStates", []):
        color = user["selectedColor"]
        end_info = end_players.get(str(color), {})
        vp_by_source = victory_points_by_source(end_info.get("victoryPoints", {}))
        players.append(
            Player(
                color=color,
                user_id=user.get("userId"),
                name=user.get("username", f"player-{color}"),
                country_code=user.get("countryCode"),
                is_bot=user.get("isBot", False),
                is_winner=end_info.get("winningPlayer", False),
                rank=end_info.get("rank"),
                final_victory_points=sum(vp_by_source.values()) if vp_by_source else None,
                victory_points_by_source=vp_by_source,
            )
        )
    return players


def describe(entry_text: dict, color_to_name: dict) -> str:
    def name(color):
        return color_to_name.get(color, f"player#{color}")

    t = entry_text.get("type")

    if t == MessageType.CHAT:
        return f"{name(entry_text.get('from'))}: {entry_text.get('message', '')}"
    if t == MessageType.DEV_CARD_BOUGHT:
        return f"{name(entry_text.get('playerColor'))} bought a development card"
    if t == MessageType.GAME_START:
        return "Game started"
    if t == MessageType.FREE_PLACEMENT:
        return f"{name(entry_text.get('playerColor'))} placed a {piece_name(entry_text.get('pieceEnum'))} (free)"
    if t == MessageType.PLACEMENT:
        vp_note = " (+1 VP)" if entry_text.get("isVp") else ""
        return f"{name(entry_text.get('playerColor'))} built a {piece_name(entry_text.get('pieceEnum'))}{vp_note}"
    if t == MessageType.DICE_ROLL:
        d1, d2 = entry_text.get("firstDice"), entry_text.get("secondDice")
        return f"{name(entry_text.get('from'))} rolled {d1} + {d2} = {d1 + d2}"
    if t == MessageType.ROBBER_MOVED:
        tile_info = entry_text.get("tileInfo") or {}
        tile = tile_type_name(tile_info.get("tileType"))
        return f"{name(entry_text.get('playerColor'))} moved the robber onto a {tile} tile"
    if t == MessageType.ROBBERY_PRIVATE_THIEF:
        recipients = entry_text.get("specificRecipients") or []
        thief = name(recipients[0]) if recipients else "someone"
        return f"{thief} stole a {resource_name(entry_text.get('cardEnums', [None])[0])} from {name(entry_text.get('playerColor'))}"
    if t == MessageType.ROBBERY_PRIVATE_VICTIM:
        recipients = entry_text.get("specificRecipients") or []
        victim = name(recipients[0]) if recipients else "someone"
        return f"{name(entry_text.get('playerColor'))} stole a {resource_name(entry_text.get('cardEnums', [None])[0])} from {victim}"
    if t == MessageType.ROBBERY_PUBLIC:
        return f"{name(entry_text.get('playerColorThief'))} stole a card from {name(entry_text.get('playerColorVictim'))}"
    if t == MessageType.DEV_CARD_PLAYED:
        return f"{name(entry_text.get('playerColor'))} played {dev_card_name(entry_text.get('cardEnum'))}"
    if t == MessageType.YEAR_OF_PLENTY_RESOURCES:
        cards = resource_names(entry_text.get("cardEnums"))
        return f"{name(entry_text.get('playerColor'))} took {', '.join(cards)} (Year of Plenty)"
    if t == MessageType.PLAYER_DISCONNECTED:
        return f"{name(entry_text.get('playerColor'))} disconnected"
    if t == MessageType.SEPARATOR:
        return "---"
    if t == MessageType.WIN:
        return f"{name(entry_text.get('playerColor'))} won the game!"
    if t == MessageType.RESOURCE_DISTRIBUTION:
        cards = resource_names(entry_text.get("cardsToBroadcast"))
        kind = "starting resources" if entry_text.get("distributionType") == DistributionType.STARTING else "resources"
        return f"{name(entry_text.get('playerColor'))} received {kind}: {', '.join(cards)}"
    if t == MessageType.TILE_EVENT:
        tile_info = entry_text.get("tileInfo") or {}
        tile = tile_type_name(tile_info.get("tileType"))
        dice = tile_info.get("diceNumber")
        return f"a {tile} tile (rolled {dice}) produced resources"
    if t == MessageType.DISCARD:
        cards = resource_names(entry_text.get("cardEnums"))
        return f"{name(entry_text.get('playerColor'))} discarded: {', '.join(cards)}"
    if t == MessageType.ACHIEVEMENT_NEW:
        return f"{name(entry_text.get('playerColor'))} received {ACHIEVEMENT_NAMES.get(entry_text.get('achievementEnum'), '?')} (+2 VP)"
    if t == MessageType.ACHIEVEMENT_TRANSFERRED:
        achievement = ACHIEVEMENT_NAMES.get(entry_text.get("achievementEnum"), "?")
        return f"{achievement} passed from {name(entry_text.get('playerColorOld'))} to {name(entry_text.get('playerColorNew'))}"
    if t == MessageType.MONOPOLY_PLAYED:
        resource = resource_name(entry_text.get("cardEnum"))
        return f"{name(entry_text.get('playerColor'))} played Monopoly on {resource}, stealing {entry_text.get('amountStolen')}"
    if t == MessageType.TRADE_PLAYER:
        given = resource_names(entry_text.get("givenCardEnums"))
        received = resource_names(entry_text.get("receivedCardEnums"))
        return (
            f"{name(entry_text.get('acceptingPlayerColor'))} accepted a trade with "
            f"{name(entry_text.get('playerColor'))}: gave {', '.join(given)}, got {', '.join(received)}"
        )
    if t == MessageType.TRADE_BANK:
        given = resource_names(entry_text.get("givenCardEnums"))
        received = resource_names(entry_text.get("receivedCardEnums"))
        return f"{name(entry_text.get('playerColor'))} traded with the bank: gave {', '.join(given)}, got {', '.join(received)}"
    if t == MessageType.TRADE_COUNTER_OFFER:
        offered = resource_names(entry_text.get("offeredCardEnums"))
        wanted = resource_names(entry_text.get("wantedCardEnums"))
        return (
            f"{name(entry_text.get('playerColorCreator'))} proposed a counter-offer to "
            f"{name(entry_text.get('playerColorOffered'))}: offering {', '.join(offered)} for {', '.join(wanted)}"
        )
    if t == MessageType.TRADE_OFFER_OPEN:
        offered = resource_names(entry_text.get("offeredCardEnums"))
        wanted = resource_names(entry_text.get("wantedCardEnums"))
        return f"{name(entry_text.get('playerColor'))} wants to give {', '.join(offered)} for {', '.join(wanted)}"
    if t == MessageType.BANK_RESOURCE_SHORTAGE:
        resource = resource_name(entry_text.get("cardEnum"))
        affected = ", ".join(name(c) for c in entry_text.get("playerColors") or [])
        return (
            f"bank couldn't cover {entry_text.get('count')} {resource} (only "
            f"{entry_text.get('bankCount')} left) -- {affected} received none"
        )

    return f"[unrecognized type {t}] {entry_text}"


# Every key colonist.io uses to refer to a player by color code, across all
# gameLogState message types.
PLAYER_COLOR_KEYS = {
    "playerColor",
    "playerColorOld",
    "playerColorNew",
    "playerColorThief",
    "playerColorVictim",
    "playerColorCreator",
    "playerColorOffered",
    "acceptingPlayerColor",
    "from",
}
PLAYER_COLOR_LIST_KEYS = {"specificRecipients", "playerColors"}


def resolve_colors(value, color_to_name: dict):
    """Replace player color codes with usernames wherever they appear.

    The color->name mapping itself is never discarded: it's kept in the
    top-level "players" list (and "color" is still present inside the
    by-player stats dicts), so nothing here is a lossy conversion.
    """
    if isinstance(value, dict):
        resolved = {}
        for key, val in value.items():
            if key in PLAYER_COLOR_KEYS and isinstance(val, int) and val in color_to_name:
                resolved[key] = color_to_name[val]
            elif key in PLAYER_COLOR_LIST_KEYS and isinstance(val, list):
                resolved[key] = [color_to_name.get(c, c) for c in val]
            else:
                resolved[key] = resolve_colors(val, color_to_name)
        return resolved
    if isinstance(value, list):
        return [resolve_colors(v, color_to_name) for v in value]
    return value


def by_player(stats_by_color: dict, color_to_name: dict) -> dict:
    if not stats_by_color:
        return {}
    return {color_to_name.get(int(color), color): stats for color, stats in stats_by_color.items()}


def decode(data: dict) -> dict:
    players = resolve_players(data)
    color_to_name = {p.color: p.name for p in players}

    eh = data.get("eventHistory", {})
    merged_log = build_merged_gamelog(eh)
    dev_cards_by_name = dev_cards_by_player(merged_log, players)
    board = build_board(eh, color_to_name)
    starting_placements_by_name = starting_placements(eh, color_to_name, board)
    robbery_matrix_by_name = robbery_matrix(merged_log, color_to_name)
    trade_matrix_by_name = trade_matrix(merged_log, color_to_name)
    rejected_trade_matrix_by_name = rejected_trade_matrix(eh, color_to_name)

    log_entries = []
    for idx, raw_entry in _sorted_by_numeric_key(merged_log):
        entry_text = dict(raw_entry.get("text", {}))
        # "from" is a sibling of "text" in most gameLogState entries (chat
        # messages are the exception and nest it inside "text" already).
        entry_text.setdefault("from", raw_entry.get("from"))
        entry_text.setdefault("specificRecipients", raw_entry.get("specificRecipients"))
        player_color = entry_text.get("playerColor") or entry_text.get("from")
        log_entries.append(
            LogEntry(
                index=int(idx),
                type=entry_text.get("type"),
                player=color_to_name.get(player_color) if player_color else None,
                text=describe(entry_text, color_to_name),
                raw=resolve_colors(raw_entry, color_to_name),
            )
        )

    end_state = eh.get("endGameState", {})
    settings = data.get("gameSettings", {})

    return {
        "game_id": data.get("databaseGameId"),
        "play_order": [color_to_name.get(c, c) for c in data.get("playOrder", [])],
        "players": [dataclasses.asdict(p) for p in players],
        "settings": {
            "victory_points_to_win": settings.get("victoryPointsToWin"),
            "is_ranked": data.get("gameDetails", {}).get("isRanked"),
        },
        "duration_ms": end_state.get("gameDurationInMS"),
        "total_turns": end_state.get("totalTurnCount"),
        "dice_roll_distribution": end_state.get("diceStats"),
        "resource_stats_by_player": by_player(end_state.get("resourceStats"), color_to_name),
        "activity_stats_by_player": by_player(end_state.get("activityStats"), color_to_name),
        "dev_cards_by_player": dev_cards_by_name,
        "starting_placements": starting_placements_by_name,
        "robbery_matrix": robbery_matrix_by_name,
        "trade_matrix": trade_matrix_by_name,
        "rejected_trade_matrix": rejected_trade_matrix_by_name,
        "board": board,
        "log": [dataclasses.asdict(e) for e in log_entries],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("raw_json", type=Path, help="Raw replay JSON (the 'data' object), e.g. from the Chrome extension's 'Download JSON'")
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()

    raw = json.loads(args.raw_json.read_text(encoding="utf-8"))
    if "data" in raw and "eventHistory" not in raw:
        raw = raw["data"]  # accept the raw Network-tab response as well as the unwrapped 'data' object
    decoded = decode(raw)
    output_text = json.dumps(decoded, indent=2, ensure_ascii=False)

    if args.output:
        args.output.write_text(output_text, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(output_text)


if __name__ == "__main__":
    main()
