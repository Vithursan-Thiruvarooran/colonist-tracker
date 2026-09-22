import { useEffect, useState } from "react";

import { type CorrelationPoint, CorrelationScatterChart } from "../components/charts/CorrelationScatterChart";
import { DiceRollChart } from "../components/charts/DiceRollChart";
import { PlayerScatterChart } from "../components/charts/PlayerScatterChart";
import { RankedBarChart, type RankedBarRow } from "../components/charts/RankedBarChart";
import { StackedCompositionChart, type CompositionSource } from "../components/charts/StackedCompositionChart";
import { TimeSeriesLineChart, type TimeSeriesPoint } from "../components/charts/TimeSeriesLineChart";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { Select } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { Tip } from "../components/ui/Tip";
import { SEQUENTIAL_HUE } from "../lib/chartTheme";
import { formatShortDate } from "../lib/format";
import {
  getPlayerGameRows,
  getPlayerStats,
  getStatsOverview,
  listGames,
  type GameSummary,
  type PlayerAggregateStats,
  type PlayerGameRow,
  type StatsOverview,
} from "../services/games";

const TREND_GAME_LIMIT = 100;
// A public match-history pull can rope in dozens of one-off opponents faced
// only once. Ranking every one of them turns the chart into an unreadable
// smear and forces 8 categorical hues to repeat, so player-performance
// charts focus on whoever's been seen the most -- the comparison that's
// actually statistically meaningful, and the same subset across all three
// charts. The full roster stays in the table below.
const MAX_RANKED_PLAYERS = 10;

// Same source set/order as game-detail.tsx's VP_SOURCES -- keeps the
// per-game breakdown and this cross-game average visually consistent.
const VP_SOURCES: CompositionSource[] = [
  { key: "settlements", label: "Settlements" },
  { key: "cities", label: "Cities" },
  { key: "victory_point_cards", label: "VP Cards" },
  { key: "largest_army", label: "Largest Army" },
  { key: "longest_road", label: "Longest Road" },
];

function StatTile({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <Panel>
      <div className="text-xs text-ink-dim">{tip ? <Tip text={tip}>{label}</Tip> : label}</div>
      <div className="mt-1 font-display text-3xl font-medium text-ink">{value}</div>
    </Panel>
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

function formatVp(value: number): string {
  return value.toFixed(1);
}

/** Correlation chart(s) shared by the aggregate and by-player views -- same
 * shape, just fed the full row set or one player's subset. */
function buildCorrelations(rows: PlayerGameRow[]) {
  const pipsVsVp: CorrelationPoint[] = rows
    .filter((r): r is PlayerGameRow & { starting_placement_pips: number; final_victory_points: number } =>
      r.starting_placement_pips != null && r.final_victory_points != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.starting_placement_pips, y: r.final_victory_points }));

  return { pipsVsVp };
}

/** Win rate for each side of a boolean split (e.g. held Largest Army or
 * not) -- fixed "Held" / "Didn't hold" order so the two bars are always
 * directly comparable, rather than reshuffling by whichever won more. */
function heldWinRateRows(rows: PlayerGameRow[], heldFn: (row: PlayerGameRow) => boolean): RankedBarRow[] {
  return (["Held", "Didn't hold"] as const).map((label) => {
    const subset = rows.filter((r) => heldFn(r) === (label === "Held"));
    const wins = subset.filter((r) => r.is_winner).length;
    return {
      name: `${label} (${subset.length})`,
      value: subset.length ? Math.round((wins / subset.length) * 1000) / 10 : 0,
      color: SEQUENTIAL_HUE,
    };
  });
}

/** Win rate split into roughly-equal-sized quantile buckets of a numeric
 * metric (e.g. trade income) -- quantile-based rather than fixed thresholds
 * so the buckets stay meaningful as more games get ingested, instead of
 * going stale against hardcoded cutoffs. Needs at least 2 observations per
 * bucket to be worth drawing at all. */
function bucketedWinRateRows(
  rows: PlayerGameRow[],
  valueFn: (row: PlayerGameRow) => number | null,
  bucketCount = 4,
): RankedBarRow[] {
  const values = rows.map(valueFn).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (values.length < bucketCount * 2) return [];

  const cuts = Array.from({ length: bucketCount - 1 }, (_, i) =>
    values[Math.min(values.length - 1, Math.floor((values.length * (i + 1)) / bucketCount))],
  );
  const bucketIndex = (v: number) => {
    for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]) return i;
    return bucketCount - 1;
  };

  const buckets: PlayerGameRow[][] = Array.from({ length: bucketCount }, () => []);
  for (const row of rows) {
    const v = valueFn(row);
    if (v != null) buckets[bucketIndex(v)].push(row);
  }

  const rowsByBucket: RankedBarRow[] = [];
  buckets.forEach((subset, i) => {
    if (subset.length === 0) return;
    const lo = i === 0 ? values[0] : cuts[i - 1] + 1;
    const hi = i === bucketCount - 1 ? values[values.length - 1] : cuts[i];
    const label = lo >= hi ? `${lo}` : `${lo}–${hi}`;
    const wins = subset.filter((r) => r.is_winner).length;
    rowsByBucket.push({
      name: `${label} (${subset.length})`,
      value: Math.round((wins / subset.length) * 1000) / 10,
      color: SEQUENTIAL_HUE,
    });
  });
  return rowsByBucket;
}

export default function Stats() {
  const [players, setPlayers] = useState<PlayerAggregateStats[] | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [recentGames, setRecentGames] = useState<GameSummary[] | null>(null);
  const [playerGameRows, setPlayerGameRows] = useState<PlayerGameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"aggregate" | "player">("aggregate");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  useEffect(() => {
    Promise.all([getPlayerStats(), getStatsOverview(), listGames({ limit: TREND_GAME_LIMIT }), getPlayerGameRows()])
      .then(([p, o, games, rows]) => {
        setPlayers(p);
        setOverview(o);
        setRecentGames(games);
        setPlayerGameRows(rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stats"));
  }, []);

  if (error) {
    return <p className="text-sm text-error">{error}</p>;
  }

  if (!players || !overview || !recentGames || !playerGameRows) {
    return <p className="text-sm text-seafoam-dim">Loading…</p>;
  }

  const rankedPlayers = [...players].sort((a, b) => b.games_played - a.games_played).slice(0, MAX_RANKED_PLAYERS);

  const winRateRows: RankedBarRow[] = [...rankedPlayers]
    .sort((a, b) => b.win_rate - a.win_rate)
    .map((p) => ({ name: p.name, value: Math.round(p.win_rate * 1000) / 10, color: SEQUENTIAL_HUE }));

  const avgVpRows: RankedBarRow[] = rankedPlayers
    .filter((p) => p.avg_final_victory_points != null)
    .sort((a, b) => (b.avg_final_victory_points ?? 0) - (a.avg_final_victory_points ?? 0))
    .map((p) => ({ name: p.name, value: p.avg_final_victory_points ?? 0, color: SEQUENTIAL_HUE }));

  const scatterData = rankedPlayers
    .filter((p) => p.avg_final_victory_points != null && p.games_played > 0)
    .map((p) => ({
      name: p.name,
      x: p.avg_final_victory_points ?? 0,
      y: Math.round(p.win_rate * 1000) / 10,
      z: p.games_played,
    }));

  // listGames returns most-recent-first; charting a trend reads left-to-right
  // as it happened, so flip to chronological order.
  const chronoGames = [...recentGames].reverse();
  const durationTrend: TimeSeriesPoint[] = chronoGames
    .filter((g) => g.duration_ms != null)
    .map((g) => ({ label: formatShortDate(g.played_at), value: Math.round((g.duration_ms ?? 0) / 60000) }));
  const turnsTrend: TimeSeriesPoint[] = chronoGames
    .filter((g) => g.total_turns != null)
    .map((g) => ({ label: formatShortDate(g.played_at), value: g.total_turns ?? 0 }));

  const { pipsVsVp } = buildCorrelations(playerGameRows);

  const allSeatNumbers = [
    ...new Set(playerGameRows.map((r) => r.play_order_position).filter((n): n is number => n != null)),
  ].sort((a, b) => a - b);
  const allSeatWinRate: RankedBarRow[] = allSeatNumbers.map((seat) => {
    const rows = playerGameRows.filter((r) => r.play_order_position === seat);
    const wins = rows.filter((r) => r.is_winner).length;
    return { name: `Seat ${seat} (${rows.length})`, value: Math.round((wins / rows.length) * 1000) / 10, color: SEQUENTIAL_HUE };
  });
  const allLargestArmyWinRate = heldWinRateRows(playerGameRows, (r) => r.held_largest_army);
  const allLongestRoadWinRate = heldWinRateRows(playerGameRows, (r) => r.held_longest_road);
  const tradeIncomeWinRate = bucketedWinRateRows(playerGameRows, (r) => r.trade_income);
  const robberLossWinRate = bucketedWinRateRows(playerGameRows, (r) => r.production_lost_to_robber);

  const diversityValues = [
    ...new Set(playerGameRows.map((r) => r.starting_placement_resource_diversity).filter((n): n is number => n != null)),
  ].sort((a, b) => a - b);
  const diversityWinRate: RankedBarRow[] = diversityValues.map((d) => {
    const rows = playerGameRows.filter((r) => r.starting_placement_resource_diversity === d);
    const wins = rows.filter((r) => r.is_winner).length;
    return {
      name: `${d} resource${d === 1 ? "" : "s"} (${rows.length})`,
      value: Math.round((wins / rows.length) * 1000) / 10,
      color: SEQUENTIAL_HUE,
    };
  });

  // Largest Army requires 3+ played knights, so "0/1/2" and "3+" is the
  // natural split rather than one bar per exact count -- the last bucket
  // also merges the long, thin tail (4, 5, 6 knights) into one readable bar.
  const knightBuckets = [0, 1, 2, "3+"] as const;
  const knightCountWinRate: RankedBarRow[] = knightBuckets.map((bucket) => {
    const rows = playerGameRows.filter((r) =>
      bucket === "3+" ? (r.knight_cards_played ?? 0) >= 3 : r.knight_cards_played === bucket,
    );
    const wins = rows.filter((r) => r.is_winner).length;
    return {
      name: `${bucket} knight${bucket === 1 ? "" : "s"} (${rows.length})`,
      value: rows.length ? Math.round((wins / rows.length) * 1000) / 10 : 0,
      color: SEQUENTIAL_HUE,
    };
  });
  // Among games where a player cleared the 3+ threshold, did actually
  // winning the Largest Army race (vs. being outpaced by another player who
  // also hit 3+) move their win rate?
  const largestArmyAmongEligible = heldWinRateRows(
    playerGameRows.filter((r) => (r.knight_cards_played ?? 0) >= 3),
    (r) => r.held_largest_army,
  );

  // Avg VP by source, per player -- same ranked/capped roster as the win
  // rate / avg VP bars above, sorted by total avg VP so it reads as an
  // extension of the avg-VP bar rather than a separate ranking.
  const vpSourceData = rankedPlayers
    .map((p) => {
      const rows = playerGameRows.filter(
        (r) => (r.user_id ?? r.name) === (p.user_id ?? p.name) && Object.keys(r.victory_points_by_source).length > 0,
      );
      const totals: Record<string, number> = {};
      let total = 0;
      for (const source of VP_SOURCES) {
        const values = rows.map((r) => r.victory_points_by_source[source.key] ?? 0);
        const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
        totals[source.key] = Math.round(avg * 10) / 10;
        total += avg;
      }
      return { name: p.name, rowCount: rows.length, total, ...totals };
    })
    .filter((row) => row.rowCount > 0)
    .sort((a, b) => b.total - a.total);

  // -- By-player view -------------------------------------------------
  const selectedPlayer =
    players.find((p) => (p.user_id ?? p.name) === selectedPlayerId) ?? players[0] ?? null;
  const playerRows = selectedPlayer
    ? playerGameRows.filter((r) => (r.user_id ?? r.name) === (selectedPlayer.user_id ?? selectedPlayer.name))
    : [];

  const seatNumbers = [...new Set(playerRows.map((r) => r.play_order_position).filter((n): n is number => n != null))].sort(
    (a, b) => a - b,
  );
  const seatWinRate: RankedBarRow[] = seatNumbers.map((seat) => {
    const rows = playerRows.filter((r) => r.play_order_position === seat);
    const wins = rows.filter((r) => r.is_winner).length;
    return { name: `Seat ${seat} (${rows.length})`, value: Math.round((wins / rows.length) * 1000) / 10, color: SEQUENTIAL_HUE };
  });
  const seatAvgVp: RankedBarRow[] = seatNumbers.map((seat) => {
    const rows = playerRows.filter((r) => r.play_order_position === seat && r.victory_point_percentage != null);
    const avg = rows.length ? rows.reduce((sum, r) => sum + (r.victory_point_percentage ?? 0), 0) / rows.length : 0;
    return { name: `Seat ${seat} (${rows.length})`, value: Math.round(avg * 10) / 10, color: SEQUENTIAL_HUE };
  });
  const largestArmyWinRate = heldWinRateRows(playerRows, (r) => r.held_largest_army);
  const longestRoadWinRate = heldWinRateRows(playerRows, (r) => r.held_longest_road);

  const playerCorrelations = buildCorrelations(playerRows);

  // playerGameRows has no natural order; play_order/rows aren't date-sorted
  // either, so reuse played_at the same way chronoGames does for the
  // aggregate trend charts.
  const chronoPlayerRows = [...playerRows].sort((a, b) => (a.played_at ?? "").localeCompare(b.played_at ?? ""));
  const vpPercentTrend: TimeSeriesPoint[] = chronoPlayerRows
    .filter((r): r is PlayerGameRow & { victory_point_percentage: number } => r.victory_point_percentage != null)
    .map((r) => ({ label: formatShortDate(r.played_at), value: Math.round(r.victory_point_percentage) }));

  const rowsWithVpPercent = playerRows.filter((r) => r.victory_point_percentage != null);
  const avgVpPercent = rowsWithVpPercent.length
    ? rowsWithVpPercent.reduce((sum, r) => sum + (r.victory_point_percentage ?? 0), 0) / rowsWithVpPercent.length
    : null;

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-medium text-parchment">Stats</h1>
      <p className="mb-5 text-sm text-seafoam-dim">
        {view === "aggregate"
          ? "Aggregated across every game ingested from colonist.io."
          : "One player's games in isolation -- what tends to correlate with their wins specifically."}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          <Button
            variant={view === "aggregate" ? "primary" : "outline"}
            onClick={() => setView("aggregate")}
          >
            All players
          </Button>
          <Button variant={view === "player" ? "primary" : "outline"} onClick={() => setView("player")}>
            By player
          </Button>
        </div>
        {view === "player" && (
          <Select
            value={selectedPlayer ? (selectedPlayer.user_id ?? selectedPlayer.name) : ""}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="max-w-xs"
          >
            {players.map((p) => (
              <option key={p.user_id ?? p.name} value={p.user_id ?? p.name}>
                {p.name}
                {p.is_bot ? " (bot)" : ""} — {p.games_played} game{p.games_played === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        )}
      </div>

      {view === "aggregate" && (
        <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Total games"
          value={String(overview.total_games)}
          tip="Games ingested from colonist.io's replay data."
        />
        <StatTile
          label="Players tracked"
          value={String(players.length)}
          tip="Distinct players and bots seen across every ingested game."
        />
        <StatTile
          label="Avg duration"
          value={overview.avg_duration_ms != null ? `${Math.round(overview.avg_duration_ms / 60000)} min` : "—"}
          tip="Mean game length across all ingested games."
        />
        <StatTile
          label="Avg turns"
          value={overview.avg_total_turns != null ? overview.avg_total_turns.toFixed(1) : "—"}
          tip="Mean number of turns across all ingested games."
        />
      </div>

      <SectionHeader
        title="Player performance"
        caption={
          players.length > MAX_RANKED_PLAYERS
            ? `Win rate and average scoring for the ${rankedPlayers.length} most-played of ${players.length} players seen — the full roster, including one-off opponents, is in the table below.`
            : "Win rate and average scoring, ranked highest first."
        }
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Win rate</h3>
          <RankedBarChart data={winRateRows} domain={[0, 100]} unit="%" formatValue={formatPercent} />
        </Panel>
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Avg victory points</h3>
          <RankedBarChart data={avgVpRows} domain={[0, "auto"]} formatValue={formatVp} />
        </Panel>
      </div>

      {scatterData.length > 1 && (
        <Panel className="mt-3">
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Scoring efficiency vs. win rate</h3>
          <p className="mb-3 text-xs text-ink-dim">
            Bubble size is games played — a high win rate over a handful of games reads differently than one over
            dozens.
          </p>
          <PlayerScatterChart
            data={scatterData}
            xLabel="Avg victory points"
            yLabel="Win rate"
            formatX={formatVp}
            formatY={formatPercent}
          />
        </Panel>
      )}

      {vpSourceData.length > 1 && (
        <Panel className="mt-3">
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Avg victory points by source</h3>
          <p className="mb-3 text-xs text-ink-dim">
            Same players and ranking as the avg VP bar above, split by where those points actually came from --
            reveals different win styles a single number hides.
          </p>
          <StackedCompositionChart data={vpSourceData} sources={VP_SOURCES} height={320} />
        </Panel>
      )}

      <SectionHeader
        title="What moves the win rate"
        caption="Win rate across every player-game observation, not per-player -- does seat order, a bonus achievement, trading, resource luck, or the robber move the odds at all?"
      />
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {allSeatWinRate.length > 1 && (
          <Panel className="lg:col-span-2">
            <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate by turn order</h3>
            <p className="mb-3 text-xs text-ink-dim">Seat 1 acts first each round; higher seats act later.</p>
            <RankedBarChart data={allSeatWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
          </Panel>
        )}
        <Panel>
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate: Largest Army</h3>
          <RankedBarChart data={allLargestArmyWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
        </Panel>
        <Panel>
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate: Longest Road</h3>
          <RankedBarChart data={allLongestRoadWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
        </Panel>
        {tradeIncomeWinRate.length > 1 && (
          <Panel className="lg:col-span-2">
            <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate by trade income</h3>
            <p className="mb-3 text-xs text-ink-dim">
              Resource cards gained from trading (player, bank, and port), grouped into quartiles across every game.
            </p>
            <RankedBarChart data={tradeIncomeWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
          </Panel>
        )}
        {diversityWinRate.length > 1 && (
          <Panel>
            <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate by starting resource diversity</h3>
            <p className="mb-3 text-xs text-ink-dim">Distinct resources produced by both starting settlements' hexes.</p>
            <RankedBarChart data={diversityWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
          </Panel>
        )}
        {knightCountWinRate.length > 1 && (
          <Panel>
            <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate by knights played</h3>
            <p className="mb-3 text-xs text-ink-dim">3+ is the minimum to ever hold Largest Army.</p>
            <RankedBarChart data={knightCountWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
          </Panel>
        )}
        {largestArmyAmongEligible.length > 1 && (
          <Panel className="lg:col-span-2">
            <h3 className="mb-1 text-sm font-medium text-ink-dim">Largest Army payoff, among games with 3+ knights played</h3>
            <p className="mb-3 text-xs text-ink-dim">
              Restricted to games where this player cleared the 3+ threshold -- isolates actually winning the Largest
              Army race from simply playing enough knights to be in it.
            </p>
            <RankedBarChart data={largestArmyAmongEligible} domain={[0, 100]} unit="%" formatValue={formatPercent} />
          </Panel>
        )}
        {robberLossWinRate.length > 1 && (
          <Panel className="lg:col-span-2">
            <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate by production lost to the robber</h3>
            <p className="mb-3 text-xs text-ink-dim">
              Resource cards this player lost because the robber sat on their tile during a matching roll, grouped
              into quartiles across every game.
            </p>
            <RankedBarChart data={robberLossWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
          </Panel>
        )}
      </div>

      <SectionHeader
        title="Correlations across games"
        caption="One point per player per game -- what tends to move together, not just who's ahead on average."
      />
      {pipsVsVp.length > 1 && (
        <Panel className="mb-6">
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Starting placement pips vs. final score</h3>
          <p className="mb-3 text-xs text-ink-dim">
            Pips are the combined dice-frequency weight of both starting settlements' adjacent hexes -- higher
            means more likely production.
          </p>
          <CorrelationScatterChart
            data={pipsVsVp}
            xLabel="Starting pips"
            yLabel="Final VP"
            formatX={(v) => v.toFixed(0)}
            formatY={(v) => v.toFixed(0)}
          />
        </Panel>
      )}

      <SectionHeader
        title="Dice rolls across all games"
        caption="Actual roll counts against the theoretical 2d6 distribution — the dashed line is what pure odds predict at this sample size."
      />
      <Panel className="mb-6">
        <DiceRollChart distribution={overview.dice_roll_distribution} />
      </Panel>

      {(durationTrend.length > 1 || turnsTrend.length > 1) && (
        <>
          <SectionHeader
            title="Game length trends"
            caption={`Across the last ${chronoGames.length} game${chronoGames.length === 1 ? "" : "s"}, in play order.`}
          />
          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel>
              <h3 className="mb-3 text-sm font-medium text-ink-dim">Duration (minutes)</h3>
              <TimeSeriesLineChart data={durationTrend} formatValue={(v) => `${v} min`} />
            </Panel>
            <Panel>
              <h3 className="mb-3 text-sm font-medium text-ink-dim">Turns</h3>
              <TimeSeriesLineChart data={turnsTrend} formatValue={(v) => `${v} turns`} />
            </Panel>
          </div>
        </>
      )}

      <SectionHeader title="Player stats" caption="Every metric above, in full precision." />
      <Panel>
        <Table>
          <thead>
            <tr>
              <Th sticky>Player</Th>
              <Th>
                <Tip text="Games this player has appeared in.">Games</Tip>
              </Th>
              <Th>
                <Tip text="Games this player finished in 1st place.">Wins</Tip>
              </Th>
              <Th>
                <Tip text="Wins divided by games played.">Win rate</Tip>
              </Th>
              <Th>
                <Tip text="Average final victory points across their games.">Avg VP</Tip>
              </Th>
              <Th>
                <Tip text="Average finishing position across their games (lower is better).">Avg rank</Tip>
              </Th>
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
        </>
      )}

      {view === "player" && selectedPlayer && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Games" value={String(selectedPlayer.games_played)} />
            <StatTile label="Wins" value={String(selectedPlayer.wins)} />
            <StatTile label="Win rate" value={formatPercent(selectedPlayer.win_rate * 100)} />
            <StatTile
              label="Avg VP"
              value={selectedPlayer.avg_final_victory_points != null ? formatVp(selectedPlayer.avg_final_victory_points) : "—"}
              tip={avgVpPercent != null ? `${avgVpPercent.toFixed(0)}% of victory points needed to win, on average` : undefined}
            />
          </div>

          {playerRows.length > 0 && (
            <>
              <SectionHeader
                title="What correlates with a win"
                caption={`Across ${playerRows.length} game${playerRows.length === 1 ? "" : "s"} — win rate split by turn order and by holding the two bonus achievements.`}
              />
              <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {seatWinRate.length > 1 && (
                  <Panel>
                    <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate by turn order</h3>
                    <p className="mb-3 text-xs text-ink-dim">Seat 1 acts first each round; higher seats act later.</p>
                    <RankedBarChart data={seatWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
                  </Panel>
                )}
                {seatAvgVp.length > 1 && (
                  <Panel>
                    <h3 className="mb-1 text-sm font-medium text-ink-dim">Avg VP% by turn order</h3>
                    <p className="mb-3 text-xs text-ink-dim">Final victory points as a share of what's needed to win.</p>
                    <RankedBarChart data={seatAvgVp} domain={[0, 100]} unit="%" formatValue={formatPercent} />
                  </Panel>
                )}
                <Panel>
                  <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate: Largest Army</h3>
                  <RankedBarChart data={largestArmyWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
                </Panel>
                <Panel>
                  <h3 className="mb-1 text-sm font-medium text-ink-dim">Win rate: Longest Road</h3>
                  <RankedBarChart data={longestRoadWinRate} domain={[0, 100]} unit="%" formatValue={formatPercent} />
                </Panel>
              </div>
            </>
          )}

          {vpPercentTrend.length > 1 && (
            <>
              <SectionHeader title="VP% trend" caption="Final victory points as a share of the win target, one game after another." />
              <Panel className="mb-6">
                <TimeSeriesLineChart data={vpPercentTrend} formatValue={formatPercent} />
              </Panel>
            </>
          )}

          <SectionHeader
            title="Correlations, this player only"
            caption="Same comparisons as the all-players view, scoped to just their games."
          />
          {playerCorrelations.pipsVsVp.length > 1 && (
            <Panel className="mb-6">
              <h3 className="mb-1 text-sm font-medium text-ink-dim">Starting placement pips vs. final score</h3>
              <CorrelationScatterChart
                data={playerCorrelations.pipsVsVp}
                xLabel="Starting pips"
                yLabel="Final VP"
                formatX={(v) => v.toFixed(0)}
                formatY={(v) => v.toFixed(0)}
              />
            </Panel>
          )}

          {playerRows.length === 0 && <p className="text-sm text-seafoam-dim">No games found for this player.</p>}
        </>
      )}
    </div>
  );
}
