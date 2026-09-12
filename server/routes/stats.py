from typing import List

from fastapi import APIRouter, Depends

from server.db import get_db
from server.models.game import PlayerAggregateStats, StatsOverview
from server.services.game_queries import get_player_stats, get_stats_overview

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/players", response_model=List[PlayerAggregateStats])
async def player_stats(db=Depends(get_db)):
    return await get_player_stats(db)


@router.get("/overview", response_model=StatsOverview)
async def stats_overview(db=Depends(get_db)):
    return await get_stats_overview(db)
