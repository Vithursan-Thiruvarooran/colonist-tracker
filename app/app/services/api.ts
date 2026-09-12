const BASE_URL = import.meta.env.VITE_API_URL as string;

export const AUTH_TOKEN_KEY = "authToken";

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !window.location.pathname.startsWith("/login")) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Request failed: ${res.status}`);
  return data as T;
}
