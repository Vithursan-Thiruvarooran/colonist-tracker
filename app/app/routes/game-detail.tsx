import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { DiceRollChart } from "../components/charts/DiceRollChart";
import { DivergingBarChart, type DivergingBarRow } from "../components/charts/DivergingBarChart";
import { GroupedBarChart } from "../components/charts/GroupedBarChart";
import { StackedCompositionChart } from "../components/charts/StackedCompositionChart";
import { Badge } from "../components/ui/Badge";
import { Panel, RawPanel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { categoricalColor } from "../lib/chartTheme";
import { getGame, type GameDetail as GameDetailType } from "../services/games";

const VP_SOURCES: { key: string; label: string }[] = [
  { key: "settlements", label: "Settlements" },
  { key: "cities", label: "Cities" },
  { key: "victory_point_cards", label: "VP Cards" },
  { key: "largest_army", label: "Largest Army" },
  { key: "longest_road", label: "Longest Road" },
];

const RESOURCE_INCOME_SOURCES: { key: string; label: string }[] = [
  { key: "rollingIncome", label: "From rolls" },
  { key: "robbingIncome", label: "From robbing" },
  { key: "tradeIncome", label: "From trades" },
  { key: "devCardIncome", label: "From dev cards" },
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

function formatCount(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

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

  const resourceIncomeData = playersByRank.map((p) => {
    const row: Record<string, string | number> = { name: p.name };
    for (const source of RESOURCE_INCOME_SOURCES) row[source.key] = p.resource_stats[source.key] ?? 0;
    return row;
  });

  const netResourceRows: DivergingBarRow[] = playersByRank.map((p) => ({
    name: p.name,
    value: (p.resource_stats.totalResourceIncome ?? 0) - (p.resource_stats.totalResourceLoss ?? 0),
  }));

  const tradesData = playersByRank.map((p) => ({
    name: p.name,
    proposedTrades: p.activity_stats.proposedTrades ?? 0,
    successfulTrades: p.activity_stats.successfulTrades ?? 0,
  }));

  const devCardsData = playersByRank.map((p) => ({
    name: p.name,
    devCardsBought: p.activity_stats.devCardsBought ?? 0,
    devCardsUsed: p.activity_stats.devCardsUsed ?? 0,
  }));

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

      <SectionHeader title="Victory points by source" caption="Where each player's final score came from." />
      <Panel className="mb-6">
        <StackedCompositionChart data={vpChartData} sources={VP_SOURCES} />
      </Panel>

      <SectionHeader
        title="Dice rolls this game"
        caption="Actual roll counts against the theoretical 2d6 distribution — small samples swing further from the dashed line than the full-history chart."
      />
      <Panel className="mb-6">
        <DiceRollChart distribution={game.dice_roll_distribution} />
      </Panel>

      <SectionHeader
        title="Resource economy"
        caption="Where resources came from, and who ended up ahead once losses (robbed, discarded, spent) are netted out."
      />
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Income by source</h3>
          <StackedCompositionChart data={resourceIncomeData} sources={RESOURCE_INCOME_SOURCES} height={240} />
        </Panel>
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Net resources (income − loss)</h3>
          <DivergingBarChart data={netResourceRows} formatValue={formatCount} height={240} />
        </Panel>
      </div>

      <SectionHeader title="Trades & development cards" caption="Volume alongside follow-through, not just totals." />
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Trades</h3>
          <GroupedBarChart
            data={tradesData}
            series={[
              { key: "proposedTrades", label: "Proposed", color: categoricalColor(0) },
              { key: "successfulTrades", label: "Completed", color: categoricalColor(1) },
            ]}
            height={220}
          />
        </Panel>
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Development cards</h3>
          <GroupedBarChart
            data={devCardsData}
            series={[
              { key: "devCardsBought", label: "Bought", color: categoricalColor(0) },
              { key: "devCardsUsed", label: "Used", color: categoricalColor(1) },
            ]}
            height={220}
          />
        </Panel>
      </div>

      <SectionHeader title="Player stats" caption="Every metric above, in full precision." />
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
