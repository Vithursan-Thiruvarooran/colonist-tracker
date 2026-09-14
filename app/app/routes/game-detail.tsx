import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { DiceRollChart } from "../components/charts/DiceRollChart";
import { GroupedBarChart } from "../components/charts/GroupedBarChart";
import { Badge } from "../components/ui/Badge";
import { CompositionTable, type CompositionSource } from "../components/ui/CompositionTable";
import { Panel, RawPanel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { Tip } from "../components/ui/Tip";
import { categoricalColor } from "../lib/chartTheme";
import { getGame, type GameDetail as GameDetailType } from "../services/games";

const VP_SOURCES: CompositionSource[] = [
  { key: "settlements", label: "Settlements", tip: "1 point each, while it remains a settlement." },
  { key: "cities", label: "Cities", tip: "2 points each -- an upgraded settlement." },
  {
    key: "victory_point_cards",
    label: "VP Cards",
    tip: "Victory Point development cards, revealed at game end.",
  },
  {
    key: "largest_army",
    label: "Largest Army",
    tip: "2 points for holding the most played Knight cards (minimum 3).",
  },
  {
    key: "longest_road",
    label: "Longest Road",
    tip: "2 points for the longest continuous road (minimum 5 segments).",
  },
];

const RESOURCE_INCOME_SOURCES: CompositionSource[] = [
  { key: "rollingIncome", label: "From rolls", tip: "Resources produced by dice rolls." },
  {
    key: "robbingIncome",
    label: "From robbing",
    tip: "Resources taken from other players via the robber or a played Knight.",
  },
  {
    key: "tradeIncome",
    label: "From trades",
    tip: "Resources gained from trades with other players or the bank/ports.",
  },
  {
    key: "devCardIncome",
    label: "From dev cards",
    tip: "Resources gained by playing Year of Plenty or Monopoly.",
  },
];

const RESOURCE_STATS: CompositionSource[] = [
  {
    key: "totalResourceIncome",
    label: "Resource income",
    tip: "Every resource gained this game, from all sources combined.",
  },
  {
    key: "totalResourceLoss",
    label: "Resource loss",
    tip: "Every resource lost this game -- to the robber, discards, and trades given away.",
  },
  ...RESOURCE_INCOME_SOURCES,
];

const ACTIVITY_STATS: CompositionSource[] = [
  {
    key: "proposedTrades",
    label: "Trades proposed",
    tip: "Trade offers this player put on the table, whether or not anyone accepted.",
  },
  {
    key: "successfulTrades",
    label: "Trades completed",
    tip: "Trade offers that were accepted and completed.",
  },
  { key: "devCardsBought", label: "Dev cards bought", tip: "Development cards purchased from the bank." },
  {
    key: "devCardsUsed",
    label: "Dev cards used",
    tip: "Development cards played (Knight, Monopoly, Road Building, or Year of Plenty).",
  },
];

const DEV_CARD_SOURCES: CompositionSource[] = [
  { key: "knight", label: "Knight", tip: "Knight cards played this game." },
  { key: "monopoly", label: "Monopoly", tip: "Monopoly cards played this game." },
  { key: "road_building", label: "Road Building", tip: "Road Building cards played this game." },
  { key: "year_of_plenty", label: "Year of Plenty", tip: "Year of Plenty cards played this game." },
  {
    key: "victory_point",
    label: "Victory Point",
    tip: "Victory Point cards -- never played, counted from each player's final score.",
  },
  {
    key: "unknown",
    label: "Unplayed",
    tip: "Bought cards whose type never surfaced -- unplayed, and not a Victory Point card.",
  },
];

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

  const vpRows = playersByRank.map((p) => ({
    key: String(p.color),
    name: p.name,
    values: p.victory_points_by_source,
    total: p.final_victory_points ?? undefined,
  }));

  const resourceIncomeRows = playersByRank.map((p) => ({
    key: String(p.color),
    name: p.name,
    values: p.resource_stats,
    total: p.resource_stats.totalResourceIncome ?? undefined,
  }));

  const devCardRows = playersByRank.map((p) => ({
    key: String(p.color),
    name: p.name,
    values: p.dev_cards,
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
        <CompositionTable rows={vpRows} sources={VP_SOURCES} />
      </Panel>

      <SectionHeader
        title="Dice rolls this game"
        caption="Actual roll counts against the theoretical 2d6 distribution — small samples swing further from the dashed line than the full-history chart."
      />
      <Panel className="mb-6">
        <DiceRollChart distribution={game.dice_roll_distribution} />
      </Panel>

      <SectionHeader title="Resource economy" caption="Where each player's resources came from." />
      <Panel className="mb-6">
        <CompositionTable rows={resourceIncomeRows} sources={RESOURCE_INCOME_SOURCES} totalLabel="Total income" />
      </Panel>

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

      <SectionHeader
        title="Development cards by type"
        caption="A card's type is only known once played, or if it's an unplayed Victory Point card revealed at game end -- Unplayed is bought cards whose type never surfaced."
      />
      <Panel className="mb-6">
        <CompositionTable rows={devCardRows} sources={DEV_CARD_SOURCES} totalLabel="Total bought" />
      </Panel>

      <SectionHeader title="Player stats" caption="Every metric above, in full precision." />
      <Panel className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th sticky>Player</Th>
              <Th>
                <Tip text="Finishing position in this game (1st, 2nd, ...).">Rank</Tip>
              </Th>
              <Th>
                <Tip text="Final victory point total.">VP</Tip>
              </Th>
              {RESOURCE_STATS.map((s) => (
                <Th key={s.key}>{s.tip ? <Tip text={s.tip}>{s.label}</Tip> : s.label}</Th>
              ))}
              {ACTIVITY_STATS.map((s) => (
                <Th key={s.key}>{s.tip ? <Tip text={s.tip}>{s.label}</Tip> : s.label}</Th>
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
