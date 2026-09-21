import { useEffect, useState } from "react";

import { type CorrelationPoint, CorrelationScatterChart } from "../components/charts/CorrelationScatterChart";
import { DiceRollChart } from "../components/charts/DiceRollChart";
import { PlayerScatterChart } from "../components/charts/PlayerScatterChart";
import { RankedBarChart, type RankedBarRow } from "../components/charts/RankedBarChart";
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

/** The three per-observation correlation charts shared by the aggregate and
 * by-player views -- same shape, just fed the full row set or one player's
 * subset. */
function buildCorrelations(rows: PlayerGameRow[]) {
  const pipsVsVp: CorrelationPoint[] = rows
    .filter((r): r is PlayerGameRow & { starting_placement_pips: number; final_victory_points: number } =>
      r.starting_placement_pips != null && r.final_victory_points != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.starting_placement_pips, y: r.final_victory_points }));

  const devCardsVsRobbing: CorrelationPoint[] = rows
    .filter((r): r is PlayerGameRow & { dev_cards_used: number; robbing_income: number } =>
      r.dev_cards_used != null && r.robbing_income != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.dev_cards_used, y: r.robbing_income }));

  const tradesProposedVsSuccessful: CorrelationPoint[] = rows
    .filter((r): r is PlayerGameRow & { proposed_trades: number; successful_trades: number } =>
      r.proposed_trades != null && r.successful_trades != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.proposed_trades, y: r.successful_trades }));

  return { pipsVsVp, devCardsVsRobbing, tradesProposedVsSuccessful };
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

  const { pipsVsVp, devCardsVsRobbing, tradesProposedVsSuccessful } = buildCorrelations(playerGameRows);

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

      <SectionHeader
        title="Seat & achievement effects"
        caption="Win rate across every player-game observation, not per-player -- does seat order or a bonus achievement move the odds at all?"
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
      </div>

      <SectionHeader
        title="Correlations across games"
        caption="One point per player per game -- what tends to move together, not just who's ahead on average."
      />
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {pipsVsVp.length > 1 && (
          <Panel>
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
        <Panel>
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Dev cards used vs. robbing income</h3>
          <p className="mb-3 text-xs text-ink-dim">Knights played pull double duty -- army size and robber control.</p>
          <CorrelationScatterChart
            data={devCardsVsRobbing}
            xLabel="Dev cards used"
            yLabel="Robbing income"
            formatX={(v) => v.toFixed(0)}
            formatY={(v) => v.toFixed(0)}
          />
        </Panel>
        <Panel className="lg:col-span-2">
          <h3 className="mb-1 text-sm font-medium text-ink-dim">Trades proposed vs. successful</h3>
          <p className="mb-3 text-xs text-ink-dim">How much proposing actually converts, across every game.</p>
          <CorrelationScatterChart
            data={tradesProposedVsSuccessful}
            xLabel="Proposed"
            yLabel="Successful"
            formatX={(v) => v.toFixed(0)}
            formatY={(v) => v.toFixed(0)}
          />
        </Panel>
      </div>

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
          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {playerCorrelations.pipsVsVp.length > 1 && (
              <Panel>
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
            {playerCorrelations.devCardsVsRobbing.length > 1 && (
              <Panel>
                <h3 className="mb-1 text-sm font-medium text-ink-dim">Dev cards used vs. robbing income</h3>
                <CorrelationScatterChart
                  data={playerCorrelations.devCardsVsRobbing}
                  xLabel="Dev cards used"
                  yLabel="Robbing income"
                  formatX={(v) => v.toFixed(0)}
                  formatY={(v) => v.toFixed(0)}
                />
              </Panel>
            )}
            {playerCorrelations.tradesProposedVsSuccessful.length > 1 && (
              <Panel className="lg:col-span-2">
                <h3 className="mb-1 text-sm font-medium text-ink-dim">Trades proposed vs. successful</h3>
                <CorrelationScatterChart
                  data={playerCorrelations.tradesProposedVsSuccessful}
                  xLabel="Proposed"
                  yLabel="Successful"
                  formatX={(v) => v.toFixed(0)}
                  formatY={(v) => v.toFixed(0)}
                />
              </Panel>
            )}
          </div>

          {playerRows.length === 0 && <p className="text-sm text-seafoam-dim">No games found for this player.</p>}
        </>
      )}
    </div>
  );
}
