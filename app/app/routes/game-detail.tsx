import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "../components/ui/Badge";
import { Panel, RawPanel } from "../components/ui/Panel";
import { Table, Td, Th } from "../components/ui/Table";
import { CHART_INK, SEQUENTIAL_HUE, categoricalColor } from "../lib/chartTheme";
import { getGame, type GameDetail as GameDetailType } from "../services/games";

const VP_SOURCES: { key: string; label: string }[] = [
  { key: "settlements", label: "Settlements" },
  { key: "cities", label: "Cities" },
  { key: "victory_point_cards", label: "VP Cards" },
  { key: "largest_army", label: "Largest Army" },
  { key: "longest_road", label: "Longest Road" },
];

const RESOURCE_STATS: { key: string; label: string }[] = [
  { key: "totalResourceIncome", label: "Resource income" },
  { key: "totalResourceLoss", label: "Resource loss" },
  { key: "rollingIncome", label: "From rolls" },
  { key: "robbingIncome", label: "From robbing" },
  { key: "tradeIncome", label: "From trades" },
  { key: "devCardIncome", label: "From dev cards" },
];

const ACTIVITY_STATS: { key: string; label: string }[] = [
  { key: "proposedTrades", label: "Trades proposed" },
  { key: "successfulTrades", label: "Trades completed" },
  { key: "devCardsBought", label: "Dev cards bought" },
  { key: "devCardsUsed", label: "Dev cards used" },
];

const tooltipStyle = {
  background: CHART_INK.tooltipBg,
  border: `1px solid ${CHART_INK.tooltipBorder}`,
  borderRadius: 6,
  fontSize: 12,
};

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

export default function GameDetail() {
  const { gameId } = useParams();
  const [game, setGame] = useState<GameDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    getGame(gameId)
      .then(setGame)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load game"));
  }, [gameId]);

  if (error) {
    return <p className="text-sm text-error">{error}</p>;
  }

  if (!game) {
    return <p className="text-sm text-seafoam-dim">Loading…</p>;
  }

  const playersByRank = [...game.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const vpChartData = playersByRank.map((p) => {
    const row: Record<string, string | number> = { name: p.name };
    for (const source of VP_SOURCES) row[source.key] = p.victory_points_by_source[source.key] ?? 0;
    return row;
  });

  const diceChartData = Object.entries(game.dice_roll_distribution)
    .map(([roll, count]) => ({ roll: Number(roll), count }))
    .sort((a, b) => a.roll - b.roll);

  return (
    <div>
      <Link to="/games" className="mb-3 inline-block text-sm text-seafoam hover:text-parchment">
        ← All games
      </Link>
      <h1 className="font-display text-2xl font-medium text-parchment">Game {game.game_id}</h1>

      <div className="mt-3 mb-6 flex flex-wrap items-center gap-1.5">
        <Badge tone="ocean">{formatDate(game.played_at)}</Badge>
        <Badge tone="ocean">{formatDuration(game.duration_ms)}</Badge>
        <Badge tone="ocean">{game.total_turns ?? "?"} turns</Badge>
        <Badge tone="ocean">{game.is_ranked ? "Ranked" : "Casual"}</Badge>
        {game.winner && <Badge tone="winner">Winner: {game.winner.name}</Badge>}
      </div>

      <h2 className="mb-2 font-display text-lg font-medium text-parchment">Victory points by source</h2>
      <Panel className="mb-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vpChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
              <XAxis dataKey="name" stroke={CHART_INK.axis} tick={{ fill: CHART_INK.secondary, fontSize: 12 }} />
              <YAxis
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: CHART_INK.primary }} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK.secondary }} />
              {VP_SOURCES.map((source, i) => (
                <Bar
                  key={source.key}
                  dataKey={source.key}
                  name={source.label}
                  stackId="vp"
                  fill={categoricalColor(i)}
                  radius={i === VP_SOURCES.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <h2 className="mb-2 font-display text-lg font-medium text-parchment">Dice rolls this game</h2>
      <Panel className="mb-6">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={diceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
              <XAxis dataKey="roll" stroke={CHART_INK.axis} tick={{ fill: CHART_INK.secondary, fontSize: 12 }} />
              <YAxis
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: CHART_INK.primary }} />
              <Bar dataKey="count" name="Rolls" fill={SEQUENTIAL_HUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <h2 className="mb-2 font-display text-lg font-medium text-parchment">Player stats</h2>
      <Panel className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th sticky>Player</Th>
              <Th>Rank</Th>
              <Th>VP</Th>
              {RESOURCE_STATS.map((s) => (
                <Th key={s.key}>{s.label}</Th>
              ))}
              {ACTIVITY_STATS.map((s) => (
                <Th key={s.key}>{s.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {playersByRank.map((p) => (
              <tr key={p.color}>
                <Td sticky>{p.name}</Td>
                <Td>{p.rank ?? "—"}</Td>
                <Td>{p.final_victory_points ?? "—"}</Td>
                {RESOURCE_STATS.map((s) => (
                  <Td key={s.key}>{p.resource_stats[s.key] ?? "—"}</Td>
                ))}
                {ACTIVITY_STATS.map((s) => (
                  <Td key={s.key}>{p.activity_stats[s.key] ?? "—"}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <details open={logOpen} onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer font-display text-lg font-medium text-parchment">
          Event log ({game.log.length} entries)
        </summary>
        <RawPanel className="mt-2">
          <ul className="max-h-96 space-y-0.5 overflow-y-auto font-mono text-xs">
            {game.log.map((entry) => (
              <li key={entry.index}>{entry.text}</li>
            ))}
          </ul>
        </RawPanel>
      </details>
    </div>
  );
}
