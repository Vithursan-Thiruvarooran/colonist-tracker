#!/usr/bin/env python3
"""Decode colonist.io's raw replay API JSON (see fetch_game.py) into clean,
human-readable structured game data.

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
import dataclasses
import enum
import json
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

    log_entries = []
    for idx in sorted(merged_log, key=int):
        raw_entry = merged_log[idx]
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
        "log": [dataclasses.asdict(e) for e in log_entries],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("raw_json", type=Path, help="Raw JSON from fetch_game.py (the 'data' object)")
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()

    raw = json.loads(args.raw_json.read_text(encoding="utf-8"))
    if "data" in raw and "eventHistory" not in raw:
        raw = raw["data"]  # accept the raw Network-tab response as well as fetch_game.py's unwrapped output
    decoded = decode(raw)
    output_text = json.dumps(decoded, indent=2, ensure_ascii=False)

    if args.output:
        args.output.write_text(output_text, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(output_text)


if __name__ == "__main__":
    main()
