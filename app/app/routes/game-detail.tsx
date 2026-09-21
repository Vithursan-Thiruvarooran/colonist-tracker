import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { CatanBoard } from "../components/board/CatanBoard";
import { DiceRollChart } from "../components/charts/DiceRollChart";
import { GroupedBarChart } from "../components/charts/GroupedBarChart";
import { Badge } from "../components/ui/Badge";
import { CompositionTable, type CompositionSource } from "../components/ui/CompositionTable";
import { EventLogList } from "../components/ui/EventLogList";
import { MatrixTable } from "../components/ui/MatrixTable";
import { Panel, RawPanel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { Tip } from "../components/ui/Tip";
import { WinnerCrown } from "../components/ui/WinnerCrown";
import { useViewerColor } from "../hooks/useViewerColor";
import { categoricalColor } from "../lib/chartTheme";
import { formatDateTime, formatDuration } from "../lib/format";
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

export default function GameDetail() {
  const { gameId } = useParams();
  const [game, setGame] = useState<GameDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const viewerColor = useViewerColor();

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
  const playerNames = playersByRank.map((p) => p.name);

  const vpRows = playersByRank.map((p) => ({
    key: String(p.color),
    name: p.name,
    values: p.victory_points_by_source,
    total: p.final_victory_points ?? undefined,
    isWinner: p.is_winner,
  }));

  const resourceIncomeRows = playersByRank.map((p) => ({
    key: String(p.color),
    name: p.name,
    values: p.resource_stats,
    total: p.resource_stats.totalResourceIncome ?? undefined,
    isWinner: p.is_winner,
  }));

  const devCardRows = playersByRank.map((p) => ({
    key: String(p.color),
    name: p.name,
    values: p.dev_cards,
    isWinner: p.is_winner,
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
        <Badge tone="ocean">{formatDateTime(game.played_at)}</Badge>
        <Badge tone="ocean">{formatDuration(game.duration_ms)}</Badge>
        <Badge tone="ocean">{game.total_turns ?? "?"} turns</Badge>
        <Badge tone="ocean">{game.is_ranked ? "Ranked" : "Casual"}</Badge>
        {game.winner && <Badge tone="winner">Winner: {game.winner.name}</Badge>}
      </div>

      {game.board && game.board.hexes.length > 0 && (
        <>
          <SectionHeader
            title="Board"
            caption="Terrain, dice numbers, the robber, and every settlement, city, and road, reconstructed from the raw game data."
          />
          <Panel className="mb-6">
            <CatanBoard board={game.board} players={game.players.map((p) => p.name)} viewerColor={viewerColor} />
            <div className="mt-3 text-center">
              <Link to={`/games/${game.game_id}/replay`} className="text-sm text-brick hover:underline">
                Watch replay →
              </Link>
            </div>
          </Panel>
        </>
      )}

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
        title="Player interactions"
        caption="Read a row across: how many times that player robbed, traded with, or was turned down by each column."
      />
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Robbing</h3>
          <MatrixTable
            players={playerNames}
            matrix={game.robbery_matrix}
            cellTip={(row, col, value) => `${row} robbed ${col} ${value} time${value === 1 ? "" : "s"}`}
            winnerName={game.winner?.name}
            viewerColor={viewerColor}
          />
        </Panel>
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Trading</h3>
          <MatrixTable
            players={playerNames}
            matrix={game.trade_matrix}
            cellTip={(row, col, value) =>
              `${row} traded with ${col} ${value} time${value === 1 ? "" : "s"} (${row} proposed, ${col} accepted)`
            }
            winnerName={game.winner?.name}
            viewerColor={viewerColor}
          />
        </Panel>
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Rejected trades</h3>
          <p className="mb-3 text-xs text-ink-dim">
            Every time a player's open trade offer was explicitly turned down, whether or not it was ever accepted
            by someone else.
          </p>
          <MatrixTable
            players={playerNames}
            matrix={game.rejected_trade_matrix}
            cellTip={(row, col, value) =>
              `${col} rejected ${row}'s trade offer ${value} time${value === 1 ? "" : "s"}`
            }
            winnerName={game.winner?.name}
            viewerColor={viewerColor}
          />
        </Panel>
      </div>

      <SectionHeader
        title="Trading"
        caption="Resource flow and value per trade, on top of the raw counts above."
      />
      <Panel className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th sticky>Player</Th>
              <Th>
                <Tip text="All completed trades -- with other players, the bank, or a port.">Trades</Tip>
              </Th>
              <Th>
                <Tip text="Completed player-to-player trades.">Player</Tip>
              </Th>
              <Th>
                <Tip text="Straight 4:1 bank trades (no port).">Bank</Tip>
              </Th>
              <Th>
                <Tip text="3:1 or 2:1 trades via a port.">Port</Tip>
              </Th>
              <Th>
                <Tip text="The resource this player gave or received most often, across every trade.">
                  Most traded
                </Tip>
              </Th>
              <Th>
                <Tip text="Who gave this player the most resource cards via player-to-player trades.">
                  Most valuable partner
                </Tip>
              </Th>
              <Th>
                <Tip text="Average resources given per resource received across this player's trades -- above 1.0 means they typically gave up more than they got.">
                  Avg ratio
                </Tip>
              </Th>
              <Th>
                <Tip text="Share of this player's player-to-player trades that were with the eventual winner.">
                  With winner
                </Tip>
              </Th>
            </tr>
          </thead>
          <tbody>
            {playersByRank.map((p) => {
              const t = p.trading;
              const hasStats = "trades_total" in t;
              return (
                <tr key={p.color}>
                  <Td sticky>
                    {p.name}
                    {p.is_winner && <WinnerCrown className="ml-1" />}
                  </Td>
                  <Td>{hasStats ? t.trades_total : "—"}</Td>
                  <Td>{hasStats ? t.player_trades : "—"}</Td>
                  <Td>{hasStats ? t.bank_trades : "—"}</Td>
                  <Td>{hasStats ? t.port_trades : "—"}</Td>
                  <Td>{hasStats ? (t.most_traded_resource ?? "—") : "—"}</Td>
                  <Td>
                    {hasStats && t.most_valuable_partner
                      ? `${t.most_valuable_partner} (${t.most_valuable_partner_resources})`
                      : "—"}
                  </Td>
                  <Td>{hasStats && t.avg_trade_ratio != null ? t.avg_trade_ratio.toFixed(2) : "—"}</Td>
                  <Td>
                    {hasStats && t.trades_with_winner_share != null
                      ? `${Math.round(t.trades_with_winner_share * 100)}%`
                      : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <SectionHeader
        title="Robber"
        caption="Every placement, and the estimated production it denied -- resources that would have been produced on a matching roll if the robber weren't sitting there."
      />
      <div className="mb-6 grid grid-cols-1 gap-3">
        <Panel>
          <h3 className="mb-3 text-sm font-medium text-ink-dim">Per player</h3>
          <Table>
            <thead>
              <tr>
                <Th sticky>Player</Th>
                <Th>
                  <Tip text="Times this player moved the robber.">Moved</Tip>
                </Th>
                <Th>
                  <Tip text="Times this player was the actual target of a robbery (card stolen from them).">
                    Robbed
                  </Tip>
                </Th>
                <Th>
                  <Tip text="Times the robber landed on a tile this player had a building on.">Blocked on tile</Tip>
                </Th>
                <Th>
                  <Tip text="Resources this player's own robber placements prevented other players from producing.">
                    Denied to others
                  </Tip>
                </Th>
                <Th>
                  <Tip text="Resources this player lost because the robber sat on their production tile during a matching roll.">
                    Lost to robber
                  </Tip>
                </Th>
                <Th>
                  <Tip text="Average number of turns this player's own robber placements stayed put before being moved again.">
                    Avg turns held
                  </Tip>
                </Th>
              </tr>
            </thead>
            <tbody>
              {playersByRank.map((p) => {
                const r = p.robber;
                const hasStats = "times_moved_robber" in r;
                return (
                  <tr key={p.color}>
                    <Td sticky>
                      {p.name}
                      {p.is_winner && <WinnerCrown className="ml-1" />}
                    </Td>
                    <Td>{hasStats ? r.times_moved_robber : "—"}</Td>
                    <Td>{hasStats ? r.times_robbed : "—"}</Td>
                    <Td>{hasStats ? r.times_blocked_on_tile : "—"}</Td>
                    <Td>{hasStats ? r.production_denied_to_others : "—"}</Td>
                    <Td>{hasStats ? r.production_lost_to_robber : "—"}</Td>
                    <Td>{hasStats && r.avg_turns_blocked_per_placement != null ? r.avg_turns_blocked_per_placement : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>

        {game.robber_moves.length > 0 && (
          <Panel>
            <h3 className="mb-3 text-sm font-medium text-ink-dim">Every placement</h3>
            <Table>
              <thead>
                <tr>
                  <Th>Turn</Th>
                  <Th>Player</Th>
                  <Th>Tile</Th>
                  <Th>Players on tile</Th>
                  <Th>Target</Th>
                  <Th>
                    <Tip text="Only known when the captured game's own player was the thief or the victim.">
                      Card stolen
                    </Tip>
                  </Th>
                  <Th>Turns held</Th>
                </tr>
              </thead>
              <tbody>
                {game.robber_moves.map((m, i) => (
                  <tr key={i}>
                    <Td>{m.turn}</Td>
                    <Td>{m.player ?? "—"}</Td>
                    <Td>{m.to_resource ? `${m.to_resource} (${m.to_terrain})` : m.to_terrain}</Td>
                    <Td>{m.players_on_tile.length > 0 ? m.players_on_tile.join(", ") : "—"}</Td>
                    <Td>{m.target_player ?? "—"}</Td>
                    <Td>{m.card_stolen ?? "—"}</Td>
                    <Td>{m.turns_blocked ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        )}
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
                <Td sticky>
                  {p.name}
                  {p.is_winner && <WinnerCrown className="ml-1" />}
                </Td>
                <Td>{p.rank ?? "—"}</Td>
                <Td>
                  {p.final_victory_points ?? "—"}
                  {p.victory_point_percentage != null && (
                    <span className="ml-1 text-xs text-ink-dim">({p.victory_point_percentage}%)</span>
                  )}
                </Td>
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
          <EventLogList entries={game.log} />
        </RawPanel>
      </details>
    </div>
  );
}
