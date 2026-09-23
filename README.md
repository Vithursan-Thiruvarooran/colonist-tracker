# colonist-data-extractor

Extracts structured game data (players, dice rolls, trades, builds, robber
moves, resource gains, final scores, winner, etc.) from a finished
[colonist.io](https://colonist.io) Catan game, stores it in MongoDB, and
serves it through a FastAPI backend + React dashboard (with a Chrome
extension as an alternative ingest path) — see `CLAUDE.md` for the full
architecture, which is kept more current than this file.

Game data comes from colonist.io's internal replay API: one request returns
the complete event-sourced game log, final scores/winner, and per-player
stats, with no gaps to work around and no DOM scraping involved. There's no
automated way to call that endpoint from this project (colonist.io's
Cloudflare layer blocks scripted requests to it) — instead, capture a raw
payload with the Chrome extension (`extension/`, see below) or by copying it
straight out of DevTools' Network tab while browsing a replay on colonist.io,
then decode it:

```bash
# Decode the raw codes (resource/piece/achievement/dev-card enums, message
# types) into human-readable text and pull out per-player stats.
python3 server/extractor/decode_game.py game_data.json -o decoded.json
```

## Running the server + app

Decoding is also available as a stored, queryable pipeline: post a raw
payload to the backend and it lands in MongoDB instead of a local JSON file.

```bash
# server/.env needs:
#   MONGODB_URI=mongodb://...
#   MONGODB_DB=colonist_tracker

# Backend — run from the repo root (server/extractor/ is part of the server
# package, so it shares this project's venv/requirements.txt):
source .venv/bin/activate
python -m uvicorn server.main:app --reload --port 8000

# Frontend — a separate Node project, run independently:
cd app
npm install
npm run dev   # http://localhost:5173
```

Ingest a captured payload through the dashboard's `/ingest` page, the Chrome
extension (below), or directly:

```bash
curl -X POST localhost:8000/colonist/api/games/ingest \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <admin token or ingest API token>' \
  -d '{"raw": { ... }}'
```

The raw payload lands in a separate
`raw_games` collection, keyed by `game_id` — the durable source of truth.
From it, `server/services/game_documents.py` derives the flat, queryable
document actually stored in `games` (below; roughly `decoded.json`'s shape
plus `source_username`/`player_color`/`fetched_at`), and
`server/services/timeline_documents.py` derives a per-event playback
document in `game_timelines`. Both are cheap to rebuild from `raw_games`
alone (`server/scripts/rebuild_games.py` / `rebuild_timelines.py`) whenever
their schema changes, without re-fetching from colonist.io — see `CLAUDE.md`
for the full storage architecture, which is kept more current than this file.

```jsonc
{
  "game_id": "254552508",
  "played_at": "2026-09-03T23:51:00Z",
  "player_color": 3,
  "source_username": "HalfBldPrnce",
  "fetched_at": "2026-09-03T23:51:00Z",
  // ...the rest of decode_game.py's decode() output, flattened onto this
  // document -- players, board, log, dice_roll_distribution, etc.
}
```

`GET /colonist/api/games` lists stored games (paginated, filterable by player);
`GET /colonist/api/games/{game_id}` returns one game's full detail;
`GET /colonist/api/games/{game_id}/timeline` returns its turn-by-turn replay data;
`GET /colonist/api/stats/*` serves the dashboard's cross-game stats. See
`server/routes/` for the full list.

### Auth

Every `/colonist/api/admin/*` route requires an admin login (email/username/password,
`POST /colonist/api/users/login`); new accounts stay `pending` until an admin
approves them. `POST /colonist/api/games/ingest` accepts either a logged-in admin's
bearer token or the single admin-managed ingest API token, so the Chrome
extension (below) can post captures without an interactive session. See
"Auth" in `CLAUDE.md` for the full picture.

### Browser extension (`extension/`)

The primary way to get a game's replay data into the backend, since
colonist.io's Cloudflare layer blocks automated requests to the replay
endpoint: a Manifest V3 Chrome extension that watches the colonist.io tab's
own network calls to the replay endpoint and posts captured payloads
straight to `POST /colonist/api/games/ingest`, authorized with the ingest API token
from the dashboard's `/admin` page. See `extension/README.md` for load/setup
instructions.

## `decoded.json` structure

```jsonc
{
  "game_id": "252749874",
  "play_order": ["Zeathro", "batecinho", "..."],   // usernames, in turn order
  "players": [
    {
      "color": 5,                     // colonist.io's numeric seat color, 1-6
      "user_id": "101600852",
      "name": "batecinho",
      "country_code": "HU",
      "is_bot": false,
      "is_winner": false,
      "rank": 2,
      "final_victory_points": 4,
      "victory_points_by_source": { "settlements": 2, "cities": 1 }
    }
  ],
  "settings": { "victory_points_to_win": 10, "is_ranked": false },
  "duration_ms": 1456656,
  "total_turns": 48,
  "dice_roll_distribution": [0, 3, 6, 4, 8, 2, 5, 5, 4, 3, 0],
  "resource_stats_by_player": { "<username>": { ... } },
  "activity_stats_by_player": { "<username>": { ... } },
  "log": [ { "index": 0, "type": 2, "player": null, "text": "Game started", "raw": { ... } } ]
}
```

- **`players[].victory_points_by_source`** — taken from
  `endGameState.players[color].victoryPoints`, a breakdown of that player's
  final VP total by source (see the `VictoryPointSource` mapping below).
  `settlements`/`cities`/`victory_point_cards` are always present (0 if
  unheld); `largest_army`/`longest_road` are only present for whichever
  player currently holds each bonus. Values sum to `final_victory_points`.
- **`dice_roll_distribution`** — 11 counts for dice totals 2 through 12, in
  order (index 0 = how many times a 2 was rolled, index 10 = how many 12s).
  Taken directly from the API's `endGameState.diceStats`.
- **`resource_stats_by_player[username]`** — taken from
  `endGameState.resourceStats`, keyed by color and remapped to username:
  - `totalResourceIncome` / `totalResourceLoss` / `totalResourceScore` — overall resource cards gained/lost/net across the game
  - `rollingIncome` / `rollingLoss` — from dice-roll production
  - `robbingIncome` / `robbingLoss` — from stealing/being stolen from
  - `devCardIncome` / `devCardLoss` — from playing development cards (e.g. Monopoly)
  - `tradeIncome` / `tradeLoss` — from player and bank/port trades
  - `goldIncome` — from the gold-producing tile variant, if the board uses it
- **`activity_stats_by_player[username]`** — taken from
  `endGameState.activityStats`: `proposedTrades`, `successfulTrades`,
  `resourcesUsed`, `resourceIncomeBlocked` (income lost to a full hand /
  discard), `devCardsBought`, `devCardsUsed`.
- **`log[]`** — the full event-sourced game log, decoded and player-attributed:
  - `type` — colonist.io's numeric message type (see mapping below)
  - `player` — the acting player's username, resolved from the numeric color
  - `text` — a human-readable one-line description, built by `describe()`
  - `raw` — the original message payload for that entry, with any embedded
    player-color codes also resolved to usernames (nothing is discarded —
    this is the field to read from if `text` doesn't cover a detail you need)

## Code → stat mappings used by `decode_game.py`

colonist.io doesn't publish its numeric codes, so every one used by this
script is reverse-engineered by cross-referencing the DOM-rendered log text
against the API's raw codes in a real game. Rather than being hardcoded
inline, each family of codes is defined as a Python `IntEnum` near the top of
`decode_game.py` — `ResourceCard`, `PieceType`, `Achievement`, `DevCard`,
`DistributionType`, `MessageType` — so if colonist.io's payload changes or a
new code turns up, there's exactly one place to update it. The tables below
mirror those enums for quick reference; see each enum's docstring in the
script for what's confirmed vs. still unknown.

| `ResourceCard` | cardEnum | Name |
|---|---|---|
| `LUMBER` | 1 | Lumber (Wood) |
| `BRICK` | 2 | Brick |
| `WOOL` | 3 | Wool (Sheep) |
| `GRAIN` | 4 | Grain (Wheat) |
| `ORE` | 5 | Ore |
| `ANY` | 9 | Any Resource (wildcard, e.g. a discard/steal placeholder) |

| `PieceType` | pieceEnum | Name |
|---|---|---|
| `ROAD` | 0 | Road |
| `SETTLEMENT` | 2 | Settlement |
| `CITY` | 3 | City |
| `ROBBER` | 5 | not buildable — carried on every `MessageType.ROBBER_MOVED` entry |

| `Achievement` | achievementEnum | Name |
|---|---|---|
| `LONGEST_ROAD` | 0 | Longest Road |
| `LARGEST_ARMY` | 1 | Largest Army |

| `DevCard` (on `MessageType.DEV_CARD_PLAYED`) | cardEnum | Name |
|---|---|---|
| `KNIGHT` | 11 | Knight |
| `VICTORY_POINT` | 12 | Victory Point — never "played" (no action); confirmed by matching an unplayed card left in a player's hand against their final `VICTORY_POINT_CARDS` count |
| `MONOPOLY` | 13 | Monopoly |
| `ROAD_BUILDING` | 14 | Road Building — confirmed by two consecutive free `FREE_PLACEMENT` roads from the same player right after the play |
| `YEAR_OF_PLENTY` | 15 | Year of Plenty — confirmed by a `YEAR_OF_PLENTY_RESOURCES` grant of exactly 2 chosen resources right after the play |

| `TileType` (terrain `type`, and the numerically-identical `resourceType` on a tileInfo payload) | code | Name |
|---|---|---|
| `DESERT` | 0 | Desert (never carries a `resourceType`) |
| `FOREST` | 1 | Forest → produces Lumber |
| `HILLS` | 2 | Hills → produces Brick |
| `PASTURE` | 3 | Pasture → produces Wool |
| `FIELDS` | 4 | Fields → produces Grain |
| `MOUNTAINS` | 5 | Mountains → produces Ore |

| `VictoryPointSource` (`endGameState.players[color].victoryPoints` keys) | key | Meaning |
|---|---|---|
| `SETTLEMENTS` | 0 | number of settlements |
| `CITIES` | 1 | number of cities |
| `VICTORY_POINT_CARDS` | 2 | number of victory point dev cards |
| `LARGEST_ARMY` | 3 | largest army bonus (present only for its holder) |
| `LONGEST_ROAD` | 4 | longest road bonus (present only for its holder) |

Confirmed directly (not reverse-engineered) — unlike the other mappings in
this section.

| `DistributionType` (on `MessageType.RESOURCE_DISTRIBUTION`) | distributionType | Meaning |
|---|---|---|
| `STARTING` | 0 | initial setup-phase resources |
| `ROLL` | 1 | regular dice-roll production |

| `MessageType` | Log `type` | Meaning |
|---|---|---|
| `CHAT` | 0 | chat message (a bare one with no `message` field is a reconnect notice — see `PLAYER_DISCONNECTED`) |
| `DEV_CARD_BOUGHT` | 1 | bought a development card |
| `GAME_START` | 2 | game start |
| `FREE_PLACEMENT` | 4 | a free piece placement — both setup-phase and each of Road Building's 2 free roads use this type |
| `PLACEMENT` | 5 | regular (paid) piece placement |
| `DICE_ROLL` | 10 | dice roll |
| `ROBBER_MOVED` | 11 | robber moved (carries `tileInfo`) |
| `ROBBERY_PRIVATE_THIEF` / `ROBBERY_PRIVATE_VICTIM` | 14 / 15 | private robbery reveal (sent only to thief/victim respectively) |
| `ROBBERY_PUBLIC` | 16 | public robbery (visible to everyone, no resource type shown) |
| `DEV_CARD_PLAYED` | 20 | played development card |
| `YEAR_OF_PLENTY_RESOURCES` | 21 | the 2 resources granted by a Year of Plenty play (`cardEnums`) |
| `PLAYER_DISCONNECTED` | 24 | player disconnected (`is10SecondRuleDisabled: true`); their reconnect appears as a bare `CHAT` entry with no `message` |
| `SEPARATOR` | 44 | log separator (`---`, e.g. turn boundary) |
| `WIN` | 45 | win |
| `RESOURCE_DISTRIBUTION` | 47 | resource distribution (dice production or starting resources) |
| `TILE_EVENT` | 49 | a producing tile's info broadcast alongside a dice roll (carries `tileInfo`) |
| `DISCARD` | 55 | discard (e.g. rolled a 7 over the hand limit) |
| `ACHIEVEMENT_NEW` | 66 | new achievement awarded |
| `ACHIEVEMENT_TRANSFERRED` | 68 | achievement transferred between players |
| `MONOPOLY_PLAYED` | 86 | Monopoly dev card effect |
| `TRADE_PLAYER` | 115 | player-to-player trade accepted |
| `TRADE_BANK` | 116 | bank/port trade |
| `TRADE_COUNTER_OFFER` | 117 | counter-offer in a trade negotiation |
| `TRADE_OFFER_OPEN` | 118 | open trade offer proposed |
| `BANK_RESOURCE_SHORTAGE` | 146 | a roll would need more of `cardEnum` than the bank's `bankCount` has left — no one in `playerColors` receives any (`distributedCount` stays 0) |

Two message types are observed but not yet decoded — both appeared only once,
immediately around a `ROBBER_MOVED` with no theft following: type `58`
(`{playerColor, pieceEnum: 5}`, right before the move) and type `139`
(`{playerCount}`, right after it). Plausibly related to how many players are
eligible to be robbed, but unconfirmed.

`tileInfo.tileType` / `resourceType` (board terrain types) are also not yet
decoded and are left as raw codes.

## Repository layout

```
server/
  extractor/
    decode_game.py                 # raw payload -> decoded/human-readable payload
  config.py                        # loads server/.env
  db/                              # motor connection, lifespan-managed
  models/                          # game.py, user.py, player.py, api_token.py
  services/
    game_ingest.py                 # decode+store a raw payload
    game_documents.py              # raw payload -> games collection document
    timeline_documents.py          # raw payload -> game_timelines collection document
    game_queries.py                # games/stats read-side queries
    auth.py, user_auth.py          # login, tokens, require_admin
    api_tokens.py                  # shared ingest API token
    player_registry.py             # link app users to players by username
  routes/
    games.py                       # POST /colonist/api/games/ingest, GET /colonist/api/games*
    stats.py                       # GET /colonist/api/stats/*
    users.py                       # signup/login
    admin.py                       # pending-user approval, ingest token
  scripts/
    rebuild_games.py               # reprocess raw_games -> games
    rebuild_timelines.py           # reprocess raw_games -> game_timelines
  main.py                          # FastAPI app
app/
  app/routes/
    home.tsx                       # games list / ingestion history (landing page)
    game-detail.tsx                # single game detail view
    game-replay.tsx                # turn-by-turn replay scrubber
    stats.tsx                      # cross-game stats
    ingest.tsx                     # paste-raw-JSON ingest form (admin-gated)
    auth.tsx                       # login / signup
    profile.tsx                    # logged-in user's profile
    admin.tsx                      # signup approval + ingest token panel (admin-gated)
  app/services/                    # api.ts fetch wrapper, auth.ts, games.ts
  app/components/                  # board/, charts/, ui/ (MatrixTable, EventLogList, ...)
extension/
  inject.js, content.js, background.js, popup.{html,js,css}  # capture + relay to backend
  manifest.json                    # Manifest V3 config
```
