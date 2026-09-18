import { useEffect, useState } from "react";

import { type CorrelationPoint, CorrelationScatterChart } from "../components/charts/CorrelationScatterChart";
import { DiceRollChart } from "../components/charts/DiceRollChart";
import { PlayerScatterChart } from "../components/charts/PlayerScatterChart";
import { RankedBarChart, type RankedBarRow } from "../components/charts/RankedBarChart";
import { TimeSeriesLineChart, type TimeSeriesPoint } from "../components/charts/TimeSeriesLineChart";
import { Panel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { Tip } from "../components/ui/Tip";
import { SEQUENTIAL_HUE } from "../lib/chartTheme";
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

function shortDate(iso: string | null): string {
  if (!iso) return "?";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Stats() {
  const [players, setPlayers] = useState<PlayerAggregateStats[] | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [recentGames, setRecentGames] = useState<GameSummary[] | null>(null);
  const [playerGameRows, setPlayerGameRows] = useState<PlayerGameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    .map((g) => ({ label: shortDate(g.played_at), value: Math.round((g.duration_ms ?? 0) / 60000) }));
  const turnsTrend: TimeSeriesPoint[] = chronoGames
    .filter((g) => g.total_turns != null)
    .map((g) => ({ label: shortDate(g.played_at), value: g.total_turns ?? 0 }));

  const pipsVsVp: CorrelationPoint[] = playerGameRows
    .filter((r): r is PlayerGameRow & { starting_placement_pips: number; final_victory_points: number } =>
      r.starting_placement_pips != null && r.final_victory_points != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.starting_placement_pips, y: r.final_victory_points }));

  const devCardsVsRobbing: CorrelationPoint[] = playerGameRows
    .filter((r): r is PlayerGameRow & { dev_cards_used: number; robbing_income: number } =>
      r.dev_cards_used != null && r.robbing_income != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.dev_cards_used, y: r.robbing_income }));

  const tradesProposedVsSuccessful: CorrelationPoint[] = playerGameRows
    .filter((r): r is PlayerGameRow & { proposed_trades: number; successful_trades: number } =>
      r.proposed_trades != null && r.successful_trades != null
    )
    .map((r) => ({ name: r.name, detail: `game ${r.game_id}`, x: r.proposed_trades, y: r.successful_trades }));

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-medium text-parchment">Stats</h1>
      <p className="mb-5 text-sm text-seafoam-dim">Aggregated across every game ingested from colonist.io.</p>

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
        <Panel>
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
    </div>
  );
}
