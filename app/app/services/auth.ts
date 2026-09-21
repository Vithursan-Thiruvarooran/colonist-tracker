import { AUTH_TOKEN_KEY, apiFetch } from "./api";

export interface UserProfile {
  user_id: string;
  email: string;
  username: string;
  player_id: string | null;
  colonist_user_id: string | null;
  status: "pending" | "approved" | "rejected";
  is_admin: boolean;
  created_at: string;
  color: string;
}

export const DEFAULT_PLAYER_COLOR = "#000000";

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export const AUTH_CHANGED_EVENT = "auth-changed";

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

export function signup(email: string, username: string, password: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/api/users/signup", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function login(email: string, password: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/users/me");
}

export function updateProfile(update: {
  email?: string;
  username?: string;
  password?: string;
  color?: string;
}): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}
