"""Read-side queries against the `games` collection for the dashboard --
list/detail views and cross-game aggregate stats.
"""
from __future__ import annotations

from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from server.models.game import GameDetail, GameSummary, PlayerAggregateStats, StatsOverview

# Fields dropped from the list view -- kept in the single-game detail view --
# to keep a page of games cheap to fetch.
_LIST_VIEW_EXCLUDED_FIELDS = {
    "_id": 0,
    "log": 0,
    "players.resource_stats": 0,
    "players.activity_stats": 0,
    "players.victory_points_by_source": 0,
}


async def list_games(
    db: AsyncIOMotorDatabase,
    limit: int,
    skip: int,
    player: Optional[str],
    sort_by: str = "played_at",
) -> List[GameSummary]:
    query: dict = {}
    if player:
        query["players"] = {"$elemMatch": {"$or": [{"user_id": player}, {"name": player}]}}

    cursor = (
        db.games.find(query, _LIST_VIEW_EXCLUDED_FIELDS)
        .sort(sort_by, -1)
        .skip(skip)
        .limit(limit)
    )
    return [GameSummary(**doc) async for doc in cursor]


async def get_game(db: AsyncIOMotorDatabase, game_id: str) -> Optional[GameDetail]:
    doc = await db.games.find_one({"game_id": game_id}, {"_id": 0})
    if doc is None:
        return None
    return GameDetail(**doc)


async def get_player_stats(db: AsyncIOMotorDatabase) -> List[PlayerAggregateStats]:
    pipeline = [
        {"$unwind": "$players"},
        {
            "$group": {
                "_id": "$players.user_id",
                "name": {"$last": "$players.name"},
                "is_bot": {"$last": "$players.is_bot"},
                "games_played": {"$sum": 1},
                "wins": {"$sum": {"$cond": ["$players.is_winner", 1, 0]}},
                "avg_final_victory_points": {"$avg": "$players.final_victory_points"},
                "avg_rank": {"$avg": "$players.rank"},
            }
        },
        # Name as a tiebreaker: most players in a public match-history pull
        # were faced exactly once, and Mongo doesn't guarantee stable order
        # across ties on games_played alone -- without it, the dashboard's
        # "most-played" chart cap would reshuffle its cut-off players on
        # every reload.
        {"$sort": {"games_played": -1, "name": 1}},
    ]

    results = []
    async for row in db.games.aggregate(pipeline):
        games_played = row["games_played"]
        wins = row["wins"]
        results.append(
            PlayerAggregateStats(
                user_id=row["_id"],
                name=row["name"],
                is_bot=row["is_bot"],
                games_played=games_played,
                wins=wins,
                win_rate=(wins / games_played) if games_played else 0.0,
                avg_final_victory_points=row.get("avg_final_victory_points"),
                avg_rank=row.get("avg_rank"),
            )
        )
    return results


async def get_stats_overview(db: AsyncIOMotorDatabase) -> StatsOverview:
    summary_pipeline = [
        {
            "$group": {
                "_id": None,
                "total_games": {"$sum": 1},
                "avg_duration_ms": {"$avg": "$duration_ms"},
                "avg_total_turns": {"$avg": "$total_turns"},
            }
        }
    ]
    summary_rows = [row async for row in db.games.aggregate(summary_pipeline)]
    summary = summary_rows[0] if summary_rows else {}

    # dice_roll_distribution is stored per-game as {"2": n, ..., "12": n};
    # objectToArray + unwind + group sums each roll value across all games.
    dice_pipeline = [
        {"$project": {"dice": {"$objectToArray": "$dice_roll_distribution"}}},
        {"$unwind": "$dice"},
        {"$group": {"_id": "$dice.k", "count": {"$sum": "$dice.v"}}},
    ]
    dice_distribution = {row["_id"]: row["count"] async for row in db.games.aggregate(dice_pipeline)}

    return StatsOverview(
        total_games=summary.get("total_games", 0),
        avg_duration_ms=summary.get("avg_duration_ms"),
        avg_total_turns=summary.get("avg_total_turns"),
        dice_roll_distribution=dice_distribution,
    )
