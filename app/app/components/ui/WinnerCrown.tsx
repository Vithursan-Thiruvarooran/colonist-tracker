/** Small inline marker for "this player won the game" -- sits directly next
 * to a name wherever one row/label identifies a specific player (the
 * per-game "Player stats" table, the trading/robber summary tables, matrix
 * headers, the games list). Reuses wheat, the same gold already used for the
 * "Winner" Badge tone and the games-list winner Hex, so it reads as the same
 * signal rather than a second one. Not used on event-log rows (robber moves,
 * trade log) -- those are transient actions, not a player-identity column. */
export function WinnerCrown({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label="Winner"
      className={`inline-block h-3 w-3 shrink-0 align-middle text-wheat ${className}`}
      fill="currentColor"
    >
      <title>Winner</title>
      <path d="M1 3.5L4.5 7 8 1.5 11.5 7 15 3.5 13 12.5H3z" />
    </svg>
  );
}
