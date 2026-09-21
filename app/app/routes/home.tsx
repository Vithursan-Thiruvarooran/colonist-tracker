import { useEffect, useState } from "react";
import { Link } from "react-router";

import Hex from "../components/Hex";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Panel } from "../components/ui/Panel";
import { WinnerCrown } from "../components/ui/WinnerCrown";
import { listGames, type GameSummary } from "../services/games";

const PAGE_SIZE = 20;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms / 60000)} min`;
}

function GameRow({ game }: { game: GameSummary }) {
  const players = [...game.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const winnerInitial = game.winner?.name?.[0]?.toUpperCase() ?? "?";

  return (
    <li className="rounded-lg bg-parchment p-4 text-ink sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <Hex size={30} background="var(--color-wheat)" color="var(--color-ink)">
            {winnerInitial}
          </Hex>
          <div className="min-w-0">
            <Link to={`/games/${game.game_id}`} className="font-medium hover:text-brick">
              {formatDate(game.played_at)}
            </Link>
            <p className="mt-1 text-sm text-ink-dim">
              {players.map((p, i) => (
                <span key={p.user_id ?? p.name}>
                  {i > 0 && ", "}
                  <span className={p.is_winner ? "font-semibold text-ink" : undefined}>
                    {p.name}
                    {p.is_winner && <WinnerCrown className="ml-0.5" />}
                  </span>{" "}
                  <span className="tabular-nums">{p.final_victory_points ?? "?"}</span>
                </span>
              ))}
            </p>
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-1.5">
          {game.winner && <Badge tone="winner">Winner: {game.winner.name}</Badge>}
          <Badge>{game.is_ranked ? "Ranked" : "Casual"}</Badge>
          <Badge>{formatDuration(game.duration_ms)}</Badge>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-dim">
        Ingested {formatDate(game.fetched_at)}
        {game.source_username ? ` · ${game.source_username}` : ""}
      </p>
    </li>
  );
}

export default function Home() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [player, setPlayer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const skip = reset ? 0 : games.length;
      const page = await listGames({ limit: PAGE_SIZE, skip, player: player.trim() || undefined });
      setGames(reset ? page : [...games, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-parchment">Games</h1>
      <p className="mt-1 mb-5 text-sm text-seafoam-dim">Everything ingested from colonist.io, most recent first.</p>

      <Panel className="mb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(true);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-sm text-ink-dim">Filter by player</span>
            <Input type="text" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Username" />
          </label>
          <Button type="submit" variant="outline-surface">
            Filter
          </Button>
        </form>
      </Panel>

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      {games.length === 0 && !loading ? (
        <EmptyState title="Nothing ingested yet">
          <Link to="/ingest" className="text-brick hover:underline">
            Ingest a replay
          </Link>{" "}
          to get started.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((g) => (
            <GameRow key={g.game_id} game={g} />
          ))}
        </ul>
      )}

      {hasMore && games.length > 0 && (
        <Button variant="outline" onClick={() => load(false)} disabled={loading} className="mt-5">
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
