from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from server.db import get_db
from server.models.game import (
    FetchResult,
    GameDetail,
    GameSummary,
    GameTimeline,
    IngestGameRequest,
)
from server.services.auth import require_admin_or_ingest_token
from server.services.game_ingest import ingest_raw_game
from server.services.game_queries import get_game, get_timeline, list_games

router = APIRouter(prefix="/api/games", tags=["games"])


@router.post("/ingest", response_model=FetchResult, dependencies=[Depends(require_admin_or_ingest_token)])
async def ingest_game(payload: IngestGameRequest, db=Depends(get_db)):
    try:
        return await ingest_raw_game(db, payload.raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=List[GameSummary])
async def get_games(
    limit: int = Query(default=20, gt=0, le=100),
    skip: int = Query(default=0, ge=0),
    player: Optional[str] = Query(default=None, description="Filter to games this player (user_id or name) played in"),
    sort_by: Literal["played_at", "fetched_at"] = Query(
        default="played_at", description="fetched_at surfaces ingestion order rather than game chronology"
    ),
    db=Depends(get_db),
):
    return await list_games(db, limit, skip, player, sort_by)


@router.get("/{game_id}", response_model=GameDetail)
async def get_game_detail(game_id: str, db=Depends(get_db)):
    game = await get_game(db, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@router.get("/{game_id}/timeline", response_model=GameTimeline)
async def get_game_timeline(game_id: str, db=Depends(get_db)):
    timeline = await get_timeline(db, game_id)
    if timeline is None:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline
