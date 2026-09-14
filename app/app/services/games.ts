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

export function getPlayerStats(): Promise<PlayerAggregateStats[]> {
  return apiFetch<PlayerAggregateStats[]>("/api/stats/players");
}

export function getStatsOverview(): Promise<StatsOverview> {
  return apiFetch<StatsOverview>("/api/stats/overview");
}
