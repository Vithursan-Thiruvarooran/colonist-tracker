from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class IngestGameRequest(BaseModel):
    raw: Dict[str, Any] = Field(
        description="Raw colonist.io replay payload, pasted manually or captured by the "
        "Chrome extension -- either the unwrapped 'data' object or the full API "
        "response ({'data': {...}})"
    )


class FetchResult(BaseModel):
    game_id: str
    status: Literal["stored", "skipped"]
    reason: Optional[str] = None


class RawGameExport(BaseModel):
    """One `raw_games` document, verbatim -- the shape both `GET
    /api/admin/export` produces and `POST /api/admin/import` consumes, so a
    downloaded export can be re-uploaded unmodified."""

    game_id: str
    raw: Dict[str, Any]
    source_username: Optional[str] = None
    player_color: Optional[int] = None
    fetched_at: Optional[datetime] = None


class ImportResult(BaseModel):
    stored: int
    skipped: int
    errors: List[str] = Field(default_factory=list)


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
    victory_point_percentage: Optional[float] = None
    play_order_position: Optional[int] = None
    held_largest_army: bool = False
    held_longest_road: bool = False
    starting_placement_pips: Optional[int] = None
    starting_placement_resource_diversity: Optional[int] = None
    starting_placement_resources: Dict[str, int] = Field(default_factory=dict)


class PlayerGameStats(PlayerBrief):
    """Full per-player detail for a single game."""

    victory_points_by_source: Dict[str, int] = Field(default_factory=dict)
    resource_stats: Dict[str, Any] = Field(default_factory=dict)
    activity_stats: Dict[str, Any] = Field(default_factory=dict)
    dev_cards: Dict[str, int] = Field(default_factory=dict)
    trading: Dict[str, Any] = Field(default_factory=dict)
    robber: Dict[str, Any] = Field(default_factory=dict)


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


class BoardHex(BaseModel):
    index: int
    terrain: str
    dice_number: Optional[int] = None
    x: int
    y: int
    pips: int = 0


class BoardPort(BaseModel):
    index: int
    port_type: str
    x: int
    y: int
    z: int


class BoardCorner(BaseModel):
    """A settlement/city spot. x/y/z are colonist.io's raw coordinates,
    passed through as opaque values for pixel placement (a frontend-only
    concern, see boardGeometry.ts) -- but hex_indices resolves real hex
    adjacency server-side, since cross-game analytics need it, not just a
    pixel position."""

    index: int
    x: int
    y: int
    z: int
    building_type: Optional[str] = None
    owner: Optional[str] = None
    hex_indices: List[int] = Field(default_factory=list)


class BoardEdge(BaseModel):
    """A road spot; x/y/z are opaque raw coordinates, same caveat as BoardCorner."""

    index: int
    x: int
    y: int
    z: int
    owner: Optional[str] = None


class Board(BaseModel):
    hexes: List[BoardHex] = Field(default_factory=list)
    ports: List[BoardPort] = Field(default_factory=list)
    corners: List[BoardCorner] = Field(default_factory=list)
    edges: List[BoardEdge] = Field(default_factory=list)
    robber_tile_index: Optional[int] = None


class TimelineStepLogEntry(BaseModel):
    index: int
    type: Optional[int] = None
    player: Optional[str] = None
    text: str


class TimelineCornerDelta(BaseModel):
    """Only the fields that changed on this corner at this step -- static
    position (x/y/z) lives once, on the matching corner in
    GameTimeline.initial_board, not repeated per step."""

    index: int
    building_type: Optional[str] = None
    owner: Optional[str] = None


class TimelineEdgeDelta(BaseModel):
    index: int
    owner: Optional[str] = None


class TimelineStep(BaseModel):
    """One raw eventHistory event, decoded. `robber_tile_index` is set only
    on the step the robber actually moved -- absent (None) otherwise, same
    partial-delta idea as the corner/edge deltas."""

    step_index: int
    log_entries: List[TimelineStepLogEntry] = Field(default_factory=list)
    corner_deltas: List[TimelineCornerDelta] = Field(default_factory=list)
    edge_deltas: List[TimelineEdgeDelta] = Field(default_factory=list)
    robber_tile_index: Optional[int] = None


class GameTimeline(BaseModel):
    """The full per-event playback timeline for one game -- lives in its own
    `game_timelines` collection, not on the `games` document (see
    server/services/timeline_documents.py's docstring for why). A frontend
    reducer folds `steps[0..k]` onto `initial_board` to get the board at
    step k."""

    game_id: str
    built_at: datetime
    player_colors: Dict[int, str] = Field(default_factory=dict)
    initial_board: Board
    steps: List[TimelineStep] = Field(default_factory=list)


class TradeRecord(BaseModel):
    """One completed trade -- player-to-player or with the bank/a port.
    player_b is None for a bank/port trade (see decode_game.py's trades())."""

    turn: int
    trade_type: Literal["player", "bank", "port"]
    player_a: Optional[str] = None
    player_b: Optional[str] = None
    given: Dict[str, int] = Field(default_factory=dict)
    received: Dict[str, int] = Field(default_factory=dict)


class RobberMove(BaseModel):
    """One robber placement. card_stolen/target_player are only known when
    the log reveals them (see decode_game.py's robber_moves_and_stats() for
    the privacy caveat on card_stolen)."""

    turn: int
    player: Optional[str] = None
    from_tile_index: Optional[int] = None
    to_tile_index: int
    to_terrain: str
    to_resource: Optional[str] = None
    players_on_tile: List[str] = Field(default_factory=list)
    target_player: Optional[str] = None
    card_stolen: Optional[str] = None
    turns_blocked: Optional[int] = None


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
    board: Optional[Board] = None
    # {actor_name: {other_player_name: count}} -- robbery_matrix is
    # directional (thief -> victim); trade_matrix is directional too
    # (proposer -> accepter), so a symmetric "trades between A and B" reads
    # as the sum of both directions, not one cell.
    robbery_matrix: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    trade_matrix: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    rejected_trade_matrix: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    trades: List[TradeRecord] = Field(default_factory=list)
    trading_stats: Dict[str, Any] = Field(default_factory=dict)
    robber_moves: List[RobberMove] = Field(default_factory=list)
    robber_stats: Dict[str, Any] = Field(default_factory=dict)
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


class PlayerGameRow(BaseModel):
    """One row per (game, player) observation -- the flat shape cross-game
    correlation and win-rate-by-bucket queries need (e.g. win rate by trade
    income), as opposed to PlayerAggregateStats' one-row-per-player rollup.
    Fields come straight off the existing `games` collection; nothing here
    requires a decode-time schema change."""

    game_id: str
    played_at: Optional[datetime] = None
    name: str
    user_id: Optional[str] = None
    rank: Optional[int] = None
    final_victory_points: Optional[int] = None
    victory_point_percentage: Optional[float] = None
    play_order_position: Optional[int] = None
    held_largest_army: bool = False
    held_longest_road: bool = False
    is_winner: bool
    victory_points_by_source: Dict[str, int] = Field(default_factory=dict)
    starting_placement_pips: Optional[int] = None
    starting_placement_resource_diversity: Optional[int] = None
    total_resource_income: Optional[int] = None
    robbing_income: Optional[int] = None
    trade_income: Optional[int] = None
    dev_card_income: Optional[int] = None
    proposed_trades: Optional[int] = None
    successful_trades: Optional[int] = None
    dev_cards_bought: Optional[int] = None
    dev_cards_used: Optional[int] = None
    knight_cards_played: Optional[int] = None
    production_lost_to_robber: Optional[int] = None
