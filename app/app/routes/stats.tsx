import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel } from "../components/ui/Panel";
import { Table, Td, Th } from "../components/ui/Table";
import { CHART_INK, SEQUENTIAL_HUE, categoricalColorForName } from "../lib/chartTheme";
import { getPlayerStats, getStatsOverview, type PlayerAggregateStats, type StatsOverview } from "../services/games";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Panel>
      <div className="text-xs text-ink-dim">{label}</div>
      <div className="mt-1 font-display text-3xl font-medium text-ink">{value}</div>
    </Panel>
  );
}

const tooltipStyle = {
  background: CHART_INK.tooltipBg,
  border: `1px solid ${CHART_INK.tooltipBorder}`,
  borderRadius: 6,
  fontSize: 12,
};

export default function Stats() {
  const [players, setPlayers] = useState<PlayerAggregateStats[] | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getPlayerStats(), getStatsOverview()])
      .then(([p, o]) => {
        setPlayers(p);
        setOverview(o);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stats"));
  }, []);

  if (error) {
    return <p className="text-sm text-error">{error}</p>;
  }

  if (!players || !overview) {
    return <p className="text-sm text-seafoam-dim">Loading…</p>;
  }

  const allNames = players.map((p) => p.name);
  const winRateData = [...players]
    .sort((a, b) => b.win_rate - a.win_rate)
    .map((p) => ({ name: p.name, win_rate: Math.round(p.win_rate * 1000) / 10 }));

  const diceChartData = Object.entries(overview.dice_roll_distribution)
    .map(([roll, count]) => ({ roll: Number(roll), count }))
    .sort((a, b) => a.roll - b.roll);

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-medium text-parchment">Stats</h1>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total games" value={String(overview.total_games)} />
        <StatTile
          label="Avg duration"
          value={overview.avg_duration_ms != null ? `${Math.round(overview.avg_duration_ms / 60000)} min` : "—"}
        />
        <StatTile
          label="Avg turns"
          value={overview.avg_total_turns != null ? overview.avg_total_turns.toFixed(1) : "—"}
        />
      </div>

      <h2 className="mb-2 mt-6 font-display text-lg font-medium text-parchment">Win rate by player</h2>
      <Panel className="mb-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={winRateData} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: CHART_INK.primary }}
                formatter={(value) => [`${value}%`, "Win rate"]}
              />
              <Bar dataKey="win_rate" radius={[0, 4, 4, 0]}>
                {winRateData.map((row) => (
                  <Cell key={row.name} fill={categoricalColorForName(row.name, allNames)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <h2 className="mb-2 mt-6 font-display text-lg font-medium text-parchment">Dice rolls across all games</h2>
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

      <h2 className="mb-2 mt-6 font-display text-lg font-medium text-parchment">Player stats</h2>
      <Panel>
        <Table>
          <thead>
            <tr>
              <Th sticky>Player</Th>
              <Th>Games</Th>
              <Th>Wins</Th>
              <Th>Win rate</Th>
              <Th>Avg VP</Th>
              <Th>Avg rank</Th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.user_id ?? p.name}>
                <Td sticky>
                  {p.name}
                  {p.is_bot ? " (bot)" : ""}
                </Td>
                <Td>{p.games_played}</Td>
                <Td>{p.wins}</Td>
                <Td>{(p.win_rate * 100).toFixed(0)}%</Td>
                <Td>{p.avg_final_victory_points?.toFixed(1) ?? "—"}</Td>
                <Td>{p.avg_rank?.toFixed(1) ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
