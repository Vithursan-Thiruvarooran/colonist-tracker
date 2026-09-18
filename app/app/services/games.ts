import { apiFetch } from "./api";

export interface FetchResult {
  game_id: string;
  status: "stored" | "skipped";
  reason: string | null;
}

export function ingestGame(raw: unknown): Promise<FetchResult> {
  return apiFetch<FetchResult>("/api/games/ingest", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
}

export interface WinnerInfo {
  user_id: string | null;
  name: string;
  color: number;
}

export interface PlayerBrief {
  color: number;
  user_id: string | null;
  name: string;
  country_code: string | null;
  is_bot: boolean;
  is_winner: boolean;
  rank: number | null;
  final_victory_points: number | null;
  starting_placement_pips: number | null;
  starting_placement_resource_diversity: number | null;
  starting_placement_resources: Record<string, number>;
}

export interface PlayerGameStats extends PlayerBrief {
  victory_points_by_source: Record<string, number>;
  resource_stats: Record<string, number>;
  activity_stats: Record<string, number>;
  dev_cards: Record<string, number>;
}

export interface GameSummary {
  game_id: string;
  played_at: string | null;
  fetched_at: string | null;
  source_username: string | null;
  duration_ms: number | null;
  total_turns: number | null;
  is_ranked: boolean | null;
  winner: WinnerInfo | null;
  players: PlayerBrief[];
}

export interface LogEntry {
  index: number;
  type: number | null;
  player: string | null;
  text: string;
}

export interface BoardHex {
  index: number;
  terrain: string;
  dice_number: number | null;
  x: number;
  y: number;
  pips: number;
}

export interface BoardPort {
  index: number;
  port_type: string;
  x: number;
  y: number;
  z: number;
}

export interface BoardCorner {
  index: number;
  x: number;
  y: number;
  z: number;
  building_type: string | null;
  owner: string | null;
  hex_indices: number[];
}

export interface BoardEdge {
  index: number;
  x: number;
  y: number;
  z: number;
  owner: string | null;
}

export interface Board {
  hexes: BoardHex[];
  ports: BoardPort[];
  corners: BoardCorner[];
  edges: BoardEdge[];
  robber_tile_index: number | null;
}

export interface TimelineStepLogEntry {
  index: number;
  type: number | null;
  player: string | null;
  text: string;
}

export interface TimelineCornerDelta {
  index: number;
  building_type: string | null;
  owner: string | null;
}

export interface TimelineEdgeDelta {
  index: number;
  owner: string | null;
}

export interface TimelineStep {
  step_index: number;
  log_entries: TimelineStepLogEntry[];
  corner_deltas: TimelineCornerDelta[];
  edge_deltas: TimelineEdgeDelta[];
  robber_tile_index: number | null;
}

export interface GameTimeline {
  game_id: string;
  built_at: string;
  player_colors: Record<string, string>;
  initial_board: Board;
  steps: TimelineStep[];
}

export interface GameDetail {
  game_id: string;
  played_at: string | null;
  duration_ms: number | null;
  total_turns: number | null;
  victory_points_to_win: number | null;
  is_ranked: boolean | null;
  play_order: string[];
  winner: WinnerInfo | null;
  dice_roll_distribution: Record<string, number>;
  players: PlayerGameStats[];
  board: Board | null;
  // {actor_name: {other_player_name: count}} -- all directional: robbery
  // thief -> victim, trade proposer -> accepter, rejection proposer ->
  // rejecter (same row orientation as trade_matrix, so accept vs. reject
  // rate per proposer is directly comparable between the two).
  robbery_matrix: Record<string, Record<string, number>>;
  trade_matrix: Record<string, Record<string, number>>;
  rejected_trade_matrix: Record<string, Record<string, number>>;
  log: LogEntry[];
}

export interface PlayerAggregateStats {
  user_id: string | null;
  name: string;
  is_bot: boolean;
  games_played: number;
  wins: number;
  win_rate: number;
  avg_final_victory_points: number | null;
  avg_rank: number | null;
}

export interface StatsOverview {
  total_games: number;
  avg_duration_ms: number | null;
  avg_total_turns: number | null;
  dice_roll_distribution: Record<string, number>;
}

export interface PlayerGameRow {
  game_id: string;
  played_at: string | null;
  name: string;
  user_id: string | null;
  rank: number | null;
  final_victory_points: number | null;
  is_winner: boolean;
  starting_placement_pips: number | null;
  starting_placement_resource_diversity: number | null;
  total_resource_income: number | null;
  robbing_income: number | null;
  trade_income: number | null;
  dev_card_income: number | null;
  proposed_trades: number | null;
  successful_trades: number | null;
  dev_cards_bought: number | null;
  dev_cards_used: number | null;
  knight_cards_played: number | null;
}

export function listGames(
  params: { limit?: number; skip?: number; player?: string; sortBy?: "played_at" | "fetched_at" } = {}
): Promise<GameSummary[]> {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.skip) query.set("skip", String(params.skip));
  if (params.player) query.set("player", params.player);
  if (params.sortBy) query.set("sort_by", params.sortBy);
  const qs = query.toString();
  return apiFetch<GameSummary[]>(`/api/games${qs ? `?${qs}` : ""}`);
}

export function getGame(gameId: string): Promise<GameDetail> {
  return apiFetch<GameDetail>(`/api/games/${gameId}`);
}

export function getGameTimeline(gameId: string): Promise<GameTimeline> {
  return apiFetch<GameTimeline>(`/api/games/${gameId}/timeline`);
}

export function getPlayerStats(): Promise<PlayerAggregateStats[]> {
  return apiFetch<PlayerAggregateStats[]>("/api/stats/players");
}

export function getStatsOverview(): Promise<StatsOverview> {
  return apiFetch<StatsOverview>("/api/stats/overview");
}

export function getPlayerGameRows(): Promise<PlayerGameRow[]> {
  return apiFetch<PlayerGameRow[]>("/api/stats/player-games");
}
