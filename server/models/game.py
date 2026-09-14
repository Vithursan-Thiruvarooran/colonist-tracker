from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class FetchGamesRequest(BaseModel):
    count: int = Field(gt=0, le=100, description="How many of the most recent finished games to fetch")
    username: Optional[str] = Field(default=None, description="Overrides COLONIST_USERNAME for this request")


class IngestGameRequest(BaseModel):
    raw: Dict[str, Any] = Field(
        description="Raw colonist.io replay payload, pasted manually -- either the "
        "unwrapped 'data' object (what fetch_game.py returns) or the full API "
        "response ({'data': {...}})"
    )


class FetchResult(BaseModel):
    game_id: str
    status: Literal["stored", "skipped"]
    reason: Optional[str] = None


class FetchGamesResponse(BaseModel):
    requested_count: int
    stored_count: int
    skipped_count: int
    results: List[FetchResult]


class WinnerInfo(BaseModel):
    user_id: Optional[str] = None
    name: str
    color: int


class PlayerBrief(BaseModel):
    """Per-player fields cheap enough to include in a games list."""

    color: int
    user_id: Optional[str] = None
    name: str
    country_code: Optional[str] = None
    is_bot: bool
    is_winner: bool
    rank: Optional[int] = None
    final_victory_points: Optional[int] = None


class PlayerGameStats(PlayerBrief):
    """Full per-player detail for a single game."""

    victory_points_by_source: Dict[str, int] = Field(default_factory=dict)
    resource_stats: Dict[str, Any] = Field(default_factory=dict)
    activity_stats: Dict[str, Any] = Field(default_factory=dict)
    dev_cards: Dict[str, int] = Field(default_factory=dict)


class GameSummary(BaseModel):
    game_id: str
    played_at: Optional[datetime] = None
    fetched_at: Optional[datetime] = None
    source_username: Optional[str] = None
    duration_ms: Optional[int] = None
    total_turns: Optional[int] = None
    is_ranked: Optional[bool] = None
    winner: Optional[WinnerInfo] = None
    players: List[PlayerBrief] = Field(default_factory=list)


class LogEntry(BaseModel):
    index: int
    type: Optional[int] = None
    player: Optional[str] = None
    text: str


class GameDetail(BaseModel):
    game_id: str
    played_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    total_turns: Optional[int] = None
    victory_points_to_win: Optional[int] = None
    is_ranked: Optional[bool] = None
    play_order: List[str] = Field(default_factory=list)
    winner: Optional[WinnerInfo] = None
    dice_roll_distribution: Dict[str, int] = Field(default_factory=dict)
    players: List[PlayerGameStats] = Field(default_factory=list)
    log: List[LogEntry] = Field(default_factory=list)


class PlayerAggregateStats(BaseModel):
    user_id: Optional[str] = None
    name: str
    is_bot: bool
    games_played: int
    wins: int
    win_rate: float
    avg_final_victory_points: Optional[float] = None
    avg_rank: Optional[float] = None


class StatsOverview(BaseModel):
    total_games: int
    avg_duration_ms: Optional[float] = None
    avg_total_turns: Optional[float] = None
    dice_roll_distribution: Dict[str, int] = Field(default_factory=dict)
