from typing import List

from fastapi import APIRouter, Depends

from server.db import get_db
from server.models.game import PlayerAggregateStats, PlayerGameRow, StatsOverview
from server.services.game_queries import get_player_game_rows, get_player_stats, get_stats_overview

router = APIRouter(prefix="/colonist/api/stats", tags=["stats"])


@router.get("/players", response_model=List[PlayerAggregateStats])
async def player_stats(db=Depends(get_db)):
    return await get_player_stats(db)


@router.get("/player-games", response_model=List[PlayerGameRow])
async def player_game_rows(db=Depends(get_db)):
    return await get_player_game_rows(db)


@router.get("/overview", response_model=StatsOverview)
async def stats_overview(db=Depends(get_db)):
    return await get_stats_overview(db)
