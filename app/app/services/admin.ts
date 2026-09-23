import { apiFetch } from "./api";

export interface AdminUserRow {
  user_id: string;
  email: string;
  username: string;
  player_id: string | null;
  status: "pending" | "approved" | "rejected";
  is_admin: boolean;
  created_at: string;
  decided_at: string | null;
}

export interface ApiToken {
  token: string;
  created_at: string;
}

export function listPendingUsers(): Promise<AdminUserRow[]> {
  return apiFetch<AdminUserRow[]>("/colonist/api/admin/users?status=pending");
}

export function approveUser(userId: string): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/colonist/api/admin/users/${userId}/approve`, { method: "POST" });
}

export function rejectUser(userId: string): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/colonist/api/admin/users/${userId}/reject`, { method: "POST" });
}

export function getIngestToken(): Promise<ApiToken> {
  return apiFetch<ApiToken>("/colonist/api/admin/ingest-token");
}

export function regenerateIngestToken(): Promise<ApiToken> {
  return apiFetch<ApiToken>("/colonist/api/admin/ingest-token/regenerate", { method: "POST" });
}

export interface RawGameExport {
  game_id: string;
  raw: unknown;
  source_username: string | null;
  player_color: number | null;
  fetched_at: string | null;
}

export interface ImportResult {
  stored: number;
  skipped: number;
  errors: string[];
}

export function exportRawGames(): Promise<RawGameExport[]> {
  return apiFetch<RawGameExport[]>("/colonist/api/admin/export");
}

export function importRawGames(entries: RawGameExport[]): Promise<ImportResult> {
  return apiFetch<ImportResult>("/colonist/api/admin/import", {
    method: "POST",
    body: JSON.stringify(entries),
  });
}
