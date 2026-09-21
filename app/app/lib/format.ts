/** Shared date/duration formatters -- previously copy-pasted per-route
 * (game-detail.tsx, admin.tsx, stats.tsx each had their own near-identical
 * copy), which is how they'd drift apart. */

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "?";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms / 60000)} min`;
}
