# Stats reference

How every stat in this project is calculated, and exactly where in the code
it comes from. This file must be kept up to date whenever a stat is added,
renamed, or its calculation changes -- see the note at the bottom.

Pipeline for every stat below: `server/extractor/decode_game.py`'s `decode()`
computes it from the raw colonist.io replay payload -> `server/services/
game_documents.py`'s `build_game_document()` shapes it into the `games`
collection -> `server/models/game.py` defines its API shape -> the dashboard
(`app/app/routes/game-detail.tsx`, `stats.tsx`) renders it.

A stat is either:
- **Colonist-native** -- colonist.io already computed it server-side; this
  project only relabels player-color keys to names.
- **Derived** -- this project computes it from the raw event log, reverse-
  engineered and documented in `decode_game.py`'s docstrings.

---

## Per-player, single-game stats

All of these live on `GameDetail.players[]` (`PlayerGameStats` in
`server/models/game.py`), one entry per player in a given game.

### Core

| Field | Source | How |
|---|---|---|
| `rank` | Colonist-native | `endGameState.players[color].rank` |
| `final_victory_points` | Derived | Sum of `victory_points_by_source`'s weighted values |
| `victory_points_by_source` | Derived | `victory_points_by_source()` in `decode_game.py`: renames `endGameState.players[color].victoryPoints`' numeric-string keys to names (`settlements`, `cities`, `victory_point_cards`, `largest_army`, `longest_road`) and multiplies each raw count by `VICTORY_POINT_WEIGHTS` (settlements/VP-cards ×1, cities ×2, largest_army/longest_road ×2) |
| `victory_point_percentage` | Derived | `victory_point_percentage()`: `final_victory_points / victory_points_to_win * 100`, rounded to 1 decimal |
| `held_largest_army` / `held_longest_road` | Derived | `decode()`: `victory_points_by_source.get("largest_army"/"longest_road", 0) > 0`. **Not** a simple key-presence check -- a real game showed the raw key present with count `0` for a non-holder, so the *value* has to be checked (see the docstring on `victory_points_by_source()`) |
| `play_order_position` | Derived | `decode()`: 1-indexed position of this player's name in `playOrder` (colonist's seating/turn order) -- distinct from `rank`, which is finishing position |
| `is_winner` | Colonist-native | `endGameState.players[color].winningPlayer` |

### Starting placement

Computed by `starting_placements()` in `decode_game.py`, from the two
setup-phase settlements' corners (found by pairing each `FREE_PLACEMENT` log
entry with its sibling corner delta in the same raw event -- see
`iter_decoded_events`'s docstring).

| Field | How |
|---|---|
| `starting_placement_pips` | Sum of `PIP_COUNTS[dice_number]` (standard Catan dice-frequency weights) across every hex touched by either starting settlement |
| `starting_placement_resource_diversity` | Count of distinct resources produced by those hexes |
| `starting_placement_resources` | `{resource: hex_count}` for those hexes |

### Resource economy (`resource_stats`) -- colonist-native

Passed straight through from `endGameState.resourceStats[color]`, only
relabeled from color to name (`by_player()`). Field names are colonist's own
camelCase: `totalResourceIncome`, `totalResourceLoss`, `rollingIncome`
(from dice rolls), `robbingIncome` (from the robber/Knight), `tradeIncome`,
`devCardIncome` (Year of Plenty / Monopoly). This project does not
recompute any of these.

### Activity (`activity_stats`) -- colonist-native

Passed straight through from `endGameState.activityStats[color]`:
`proposedTrades`, `successfulTrades`, `devCardsBought`, `devCardsUsed`.

### Development cards (`dev_cards`) -- derived

`dev_cards_by_player()` in `decode_game.py`. A dev card's type is only
public once played (`MessageType.DEV_CARD_PLAYED` carries `cardEnum`);
colonist never reveals a bought-but-unplayed card's type. So:
- Played cards are tallied by type (`knight`, `monopoly`, `road_building`,
  `year_of_plenty`).
- Unplayed `victory_point` cards are inferred from
  `victory_points_by_source`'s `victory_point_cards` count (the one
  unplayed type that's knowable, since it's never "used").
- Anything bought but not accounted for by the above goes to `unknown`.

### Trading (`trading`) -- derived

`trading_stats_by_player()` in `decode_game.py`, built from the game's
`trades` list (see below). Both sides of a player-to-player trade are
folded onto each participant (the accepter's given/received is the mirror
of the proposer's).

| Field | How |
|---|---|
| `trades_total` / `player_trades` / `bank_trades` / `port_trades` | Counts by `trade_type` this player took part in |
| `resources_given` / `resources_received` | Tallies across every trade this player was on either side of |
| `most_traded_resource` | `argmax` of `resources_given + resources_received` combined |
| `most_valuable_partner` / `most_valuable_partner_resources` | The player-to-player counterpart who gave this player the most total resource *cards* (not just the most frequent partner -- `trade_matrix` already covers raw counts) |
| `avg_trade_ratio` | Average, across this player's own trades, of resources-they-gave ÷ resources-they-received (their own perspective on both sides of a player trade, or the bank/port trade's own ratio). Above 1.0 means they typically gave up more than they got |
| `trades_with_winner` / `trades_with_winner_share` | Count and share of this player's *player-to-player* trades whose counterpart was the game's eventual winner |

### Robber (`robber`) -- derived

`robber_moves_and_stats()` in `decode_game.py`, from a single walk over the
raw event stream that maintains running corner ownership and the robber's
current tile (see "Robber moves" below for the full mechanism).

| Field | How |
|---|---|
| `times_moved_robber` | Times this player placed the robber |
| `times_robbed` | Times this player was the confirmed target of a robbery (`MessageType.ROBBERY_PUBLIC`'s victim) |
| `times_blocked_on_tile` | Times the robber landed on a tile this player had a building on (regardless of whether a matching roll ever came) |
| `production_denied_to_others` | Resource cards this player's own robber placements prevented *other* players from producing (see the impact simulation below) |
| `production_lost_to_robber` / `production_lost_to_robber_by_resource` | Resource cards this player lost because the robber sat on their production tile during a matching dice roll |
| `avg_turns_blocked_per_placement` | Average number of turns this player's own robber placements stayed in place before being moved again |

**Robber impact simulation (production denied/lost):** the robber-tracking
walk replays corner ownership turn by turn. On every `DICE_ROLL` entry, if
the roll total matches the current robber tile's dice number, every
building on that tile is credited/debited: 1 resource card per settlement,
2 per city (standard Catan rules, not reverse-engineered), resource type
from the tile's terrain. This requires knowing board state *as of that
point in the game*, not the final board -- a settlement built after a given
roll couldn't have been denied production by that roll.

**Privacy caveat:** `card_stolen` (on the robber moves list, not this
per-player summary) is only known when this payload's capturing player was
the thief or victim of that specific robbery -- colonist only reveals a
stolen card's type to those two players. Most moves in a game captured from
a third player's perspective will show `card_stolen: null`.

---

## Game-level, single-game stats

Live on `GameDetail` directly (not nested under a player).

### Interaction matrices

All three are `{actor_name: {other_player_name: count}}`, directional, same
row orientation (row = who acted).

| Field | Source event | Direction |
|---|---|---|
| `robbery_matrix` | `MessageType.ROBBERY_PUBLIC` | thief -> victim |
| `trade_matrix` | `MessageType.TRADE_PLAYER` | proposer -> accepter |
| `rejected_trade_matrix` | `eventHistory.events[*].stateChange.tradeState` (colonist logs no explicit "rejected" message -- derived from a trade offer's final `playerResponses` code, `2` = declined) | proposer -> rejecter |

### Trades log (`trades`) -- derived

`trades()` in `decode_game.py`. One record per completed
`MessageType.TRADE_PLAYER`/`TRADE_BANK` entry: `{turn, trade_type,
player_a, player_b, given, received}`.

- `trade_type` is `"player"` for a player-to-player trade. For a bank
  entry, colonist carries no bank-vs-port flag, so it's inferred from the
  given-resource count: 4 (no port) -> `"bank"`, 3 or 2 (a port) ->
  `"port"`.
- `turn` comes from `turn_numbers_by_log_index()` -- **colonist logs no
  explicit turn number**, so this project derives one by counting
  `MessageType.DICE_ROLL` entries seen so far. Entries before the first
  roll (setup phase) are turn 0. This is an approximation, same spirit as
  this file's other reverse-engineered fields.

`trading_stats` (game-level overview): `trading_stats_overview()` --
`trades_total`/`player_trades`/`bank_trades`/`port_trades`,
`most_traded_resource`, `average_trade_ratio` (mirrors the per-player
version, game-wide).

### Robber moves log (`robber_moves`) -- derived

`robber_moves_and_stats()`'s `moves` list. One record per
`MessageType.ROBBER_MOVED`: `{turn, player, from_tile_index, to_tile_index,
to_terrain, to_resource, players_on_tile, target_player, card_stolen,
turns_blocked}`.

- `players_on_tile`: everyone with a building on the destination tile *at
  the moment of the move* (running corner state, not the final board).
- `target_player`: filled in from the `ROBBERY_PUBLIC` entry that
  immediately follows, if any (a move isn't always followed by a theft --
  e.g. an empty tile, or every adjacent player has an empty hand).
- `card_stolen`: filled in from `ROBBERY_PRIVATE_THIEF`/`_VICTIM` *when
  present* -- see the privacy caveat above.
- `turns_blocked`: turn the robber was moved away (or the game ended) minus
  the turn it was placed. The very first, pre-game desert placement is
  tracked internally for timing but never emitted as a move record (nobody
  moved it there).

`robber_stats` (game-level overview): `total_robber_moves`,
`total_production_prevented` (sum of every player's
`production_lost_to_robber`), `avg_turns_blocked`.

### Other game-level fields

| Field | Source |
|---|---|
| `dice_roll_distribution` | Colonist-native (`endGameState.diceStats`), relabeled from an 11-element list to a `{"2".."12": count}` dict by `_dice_distribution_by_roll()` in `game_documents.py` |
| `board` | Derived -- `build_board()` reconstructs hexes/corners/edges/ports from `eventHistory.initialState.mapState`, deep-merged with every event's delta (`_deep_merge`). Corner `hex_indices` are resolved by exact pixel-distance geometry (`_corner_hex_indices`), ported from `app/app/lib/boardGeometry.ts` |
| `log` | Every `gameLogState` entry, decoded to a human-readable string by `describe()` |

---

## Cross-game aggregate stats (`/stats` page)

### `PlayerAggregateStats` (`GET /api/stats/players`)

One row per distinct player (grouped by `user_id`) across every stored
game -- `get_player_stats()` in `server/services/game_queries.py`, a Mongo
`$group` over the `games` collection: `games_played` (count),
`wins` (count where `is_winner`), `win_rate` (`wins / games_played`),
`avg_final_victory_points`, `avg_rank`.

### `PlayerGameRow` (`GET /api/stats/player-games`)

One flat row per (game, player) observation, deliberately **not**
aggregated -- `get_player_game_rows()`, a `$project` (no `$group`) so
correlation charts get a real per-observation scatter. Every field is a
straight pass-through of a `players.*` field already described above
(`victory_point_percentage`, `play_order_position`, `held_largest_army`,
`held_longest_road`, `starting_placement_pips`,
`starting_placement_resource_diversity`, `total_resource_income`,
`robbing_income`, `trade_income`, `dev_card_income`, `proposed_trades`,
`successful_trades`, `dev_cards_bought`, `dev_cards_used`,
`knight_cards_played`).

### `StatsOverview` (`GET /api/stats/overview`)

`get_stats_overview()`: `total_games`, `avg_duration_ms`,
`avg_total_turns` (all `$group` averages over `games`), and
`dice_roll_distribution` summed across every game's own distribution
(`$objectToArray` + `$unwind` + `$group`).

### What the `/stats` page computes client-side (`app/app/routes/stats.tsx`)

Everything below is computed in the browser from `PlayerGameRow[]` /
`PlayerAggregateStats[]` already fetched above -- no separate API call.

**All-players view:**
- Win rate / avg VP ranked bar charts -- `PlayerAggregateStats`, sorted by
  value, capped to the `MAX_RANKED_PLAYERS` (10) most-played.
- Scoring efficiency scatter (avg VP vs. win rate, bubble size = games
  played).
- Win rate by turn order (`play_order_position`), and win rate split by
  `held_largest_army` / `held_longest_road` (`heldWinRateRows()`) -- same
  grouping as the by-player view below, but over every `PlayerGameRow`
  across every player and game, not filtered to one player. Answers "does
  seat order / a bonus achievement move the odds at all" at the population
  level, as opposed to the by-player view's "for this specific player."
- Correlation scatters (`buildCorrelations()`): starting pips vs. final VP,
  dev cards used vs. robbing income, trades proposed vs. successful -- one
  point per `PlayerGameRow`.
- Game-length trends (duration, turns) over the most recent
  `TREND_GAME_LIMIT` (100) games, chronological.

**By-player view** (same page, toggled): all of the above's
`playerGameRows` filtered to the selected player (`(user_id ?? name)`
match), plus:
- Win rate by turn order (`play_order_position`) and avg VP% by turn
  order -- grouped client-side, one bar per observed seat number, in seat
  order (not value-sorted, since seat order itself is the point).
- Win rate split by `held_largest_army` / `held_longest_road`
  (`heldWinRateRows()`) -- fixed "Held" / "Didn't hold" order so the two
  bars are always directly comparable.
- VP% trend across that player's games, chronological.

---

## Known approximations and caveats

- **Turn numbers** (`turn` on trades/robber moves) are derived by counting
  dice rolls, not read from an explicit field -- colonist doesn't log one.
- **`card_stolen`** is only known when the capturing player's own session
  was the thief or victim of that specific robbery.
- **Bank vs. port trade type** is inferred from the given-resource count
  (a ratio), not an explicit flag.
- **`held_largest_army`/`held_longest_road`** must check the achievement's
  *value*, not key presence -- see the per-player table above.
- **Robber production-denied/lost** is a simulation against replayed board
  state, not a value colonist reports directly -- it assumes a roll on a
  blocked hex would otherwise have produced (true by the rules, but this
  project doesn't cross-check it against anything colonist reports).
- **PortType**'s specific resource-to-port-type mapping (2-6 -> Lumber..Ore)
  is a best guess by elimination, not independently confirmed (see the enum's
  docstring in `decode_game.py`).

---

## Keeping this file current

Update this file in the same change that adds or modifies a stat. If a
stat's calculation lives in `decode_game.py`, `game_documents.py`,
`game_queries.py`, or is computed client-side in `stats.tsx`/
`game-detail.tsx`, this file should say so and describe the formula --
not just repeat the field name.
