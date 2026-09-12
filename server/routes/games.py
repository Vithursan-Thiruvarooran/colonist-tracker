from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from server import config
from server.db import get_db
from server.models.game import (
    FetchGamesRequest,
    FetchGamesResponse,
    FetchResult,
    GameDetail,
    GameSummary,
    IngestGameRequest,
)
from server.services.auth import require_admin, require_admin_or_ingest_token
from server.services.game_ingest import fetch_and_store_games, ingest_raw_game
from server.services.game_queries import get_game, list_games

router = APIRouter(prefix="/api/games", tags=["games"])


@router.post("/fetch", response_model=FetchGamesResponse, dependencies=[Depends(require_admin)])
async def fetch_games(payload: FetchGamesRequest, db=Depends(get_db)):
    username = payload.username or config.COLONIST_USERNAME
    if not username:
        raise HTTPException(status_code=400, detail="No username provided and COLONIST_USERNAME is not set")
    if not config.COLONIST_JWT:
        raise HTTPException(status_code=500, detail="COLONIST_JWT is not set")

    return await fetch_and_store_games(db, payload.count, username, config.COLONIST_JWT)


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
    db=Depends(get_db),
):
    return await list_games(db, limit, skip, player)


@router.get("/{game_id}", response_model=GameDetail)
async def get_game_detail(game_id: str, db=Depends(get_db)):
    game = await get_game(db, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return game
