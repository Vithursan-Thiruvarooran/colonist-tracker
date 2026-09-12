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
  return apiFetch<AdminUserRow[]>("/api/admin/users?status=pending");
}

export function approveUser(userId: string): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/api/admin/users/${userId}/approve`, { method: "POST" });
}

export function rejectUser(userId: string): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/api/admin/users/${userId}/reject`, { method: "POST" });
}

export function getIngestToken(): Promise<ApiToken> {
  return apiFetch<ApiToken>("/api/admin/ingest-token");
}

export function regenerateIngestToken(): Promise<ApiToken> {
  return apiFetch<ApiToken>("/api/admin/ingest-token/regenerate", { method: "POST" });
}
