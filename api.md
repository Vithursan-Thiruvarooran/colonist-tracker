# API reference

Every backend endpoint, its auth requirement, and what it actually does.
This file must be kept up to date whenever a route is added, removed, or
its behavior changes -- see the note at the bottom.

For exact request/response JSON Schemas, the live FastAPI docs
(`/docs`, Swagger UI; `/openapi.json` for the raw schema) are always
authoritative -- they're generated from `server/models/*.py` directly, so
they can't drift from the code the way a hand-written schema dump could.
This file is the narrative layer on top: what each route is *for*, what
auth it needs, and the non-obvious behavior (idempotency, side effects,
status-code meaning) that a schema alone doesn't capture. Route source:
`server/routes/*.py`; all mounted in `server/main.py`.

---

## Auth

Three tiers, all built on one HMAC-signed, 7-day bearer token
(`server/services/auth.py` -- no third-party auth library or JWT
dependency; signing key is `SECRET_KEY` in `server/.env`). Full mechanism
detail lives in `CLAUDE.md`'s Auth section; this is the per-route summary.

| Tier | FastAPI dependency | Who satisfies it |
|---|---|---|
| Public | none | anyone |
| User | `get_current_user` | any `users` doc with `status: "approved"` -- re-checked on every call, not just at login, so a rejected account loses access before its token expires |
| Admin | `require_admin` | an approved user with `is_admin: true` |
| Admin-or-ingest-token | `require_admin_or_ingest_token` | either an admin's bearer token, or the single shared ingest token (`server/services/api_tokens.py`) -- the one place the two auth mechanisms meet, since the Chrome extension can't do an interactive login |

A missing/invalid/expired token returns **401**. A valid token lacking the
required tier (e.g. a non-admin hitting an admin route) returns **403**.

---

## Games -- `/api/games` (`server/routes/games.py`)

### `POST /api/games/ingest`
**Auth:** admin-or-ingest-token.

Stores a raw colonist.io replay payload -- accepts either the unwrapped
`data` object or the full Network-tab response (`{"data": {...}}`);
`server/services/game_ingest.py`'s `_unwrap_raw()` normalizes either shape.
Body: `IngestGameRequest` (`{"raw": {...}}`).

Delegates to `ingest_raw_game()`, which:
1. Reads `databaseGameId` off the payload -- **400** if absent (not a valid
   replay).
2. If a `raw_games` doc with that `game_id` already exists, returns
   immediately without re-decoding: `{"status": "skipped", "reason":
   "already_stored"}`. Safe to re-submit the same game any number of times.
3. Otherwise decodes it (`decode_game.py`) and upserts all three derived
   collections (`raw_games`, `games`, `game_timelines`) plus the player
   registry, returning `{"status": "stored"}`.
4. A decode failure raises **400** with the underlying error message, not
   a 500 -- a malformed payload is treated as a client error.

`source_username` is always recorded as `"manual"` for this endpoint
(whether the caller was the dashboard's paste form or the extension) --
there's no per-caller identity threaded through, only `player_color`
(from the payload's own `playerPerspective` field).

Response: `FetchResult` -- `{game_id, status: "stored"|"skipped", reason}`.

### `GET /api/games`
**Auth:** public.

Paginated games list for the home page / ingestion history.

| Query param | Default | Notes |
|---|---|---|
| `limit` | 20 | 1-100 |
| `skip` | 0 | |
| `player` | none | matches a player's `user_id` **or** `name` (`$elemMatch` on `players`) |
| `sort_by` | `played_at` | or `fetched_at` (ingestion order rather than game chronology) |

Response: `List[GameSummary]` -- the trimmed list-view shape (`game_queries.py`'s
`_LIST_VIEW_EXCLUDED_FIELDS` drops `log`, per-player `resource_stats`/
`activity_stats`/`victory_points_by_source`/`trading`/`robber`, and the
game-level `trades`/`trading_stats`/`robber_moves`/`robber_stats` to keep a
page of games cheap).

### `GET /api/games/{game_id}`
**Auth:** public.

Full single-game detail -- every field `stats.md` documents, nothing
trimmed. Response: `GameDetail`. **404** if `game_id` isn't stored.

### `GET /api/games/{game_id}/timeline`
**Auth:** public.

The per-event playback document for the replay viewer
(`app/app/routes/game-replay.tsx`) -- `initial_board` plus one entry per
raw event, an order of magnitude bigger than `GameDetail` (see
`server/services/timeline_documents.py`'s docstring for why it's a
separate collection). Response: `GameTimeline`. **404** if not stored.

---

## Stats -- `/api/stats` (`server/routes/stats.py`)

All three are public, all three read the `games` collection only (no
`raw_games`/timeline access) -- see `stats.md` for exactly how each
aggregate is computed.

### `GET /api/stats/players`
One row per distinct player across every stored game (`get_player_stats()`
-- a Mongo `$group` by `user_id`). Response: `List[PlayerAggregateStats]`.

### `GET /api/stats/player-games`
One row per (game, player) observation, deliberately unaggregated
(`get_player_game_rows()` -- `$project`, no `$group`) for cross-game
correlation scatter charts. Response: `List[PlayerGameRow]`.

### `GET /api/stats/overview`
Fleet-wide numbers: total games, average duration/turns, combined dice
distribution (`get_stats_overview()`). Response: `StatsOverview`.

---

## Users -- `/api/users` (`server/routes/users.py`)

### `POST /api/users/signup`
**Auth:** public. Body: `SignupRequest` (`email`, `username`, `password`
min 8 chars).

`username` is matched case-insensitively against an existing `players` doc
(`find_player_by_username`) to link the account -- but a non-match is
**not** an error, it just leaves `player_id: null` on the created account
(re-checked later on admin approval and on profile edits that change the
username, so linking can catch up once that player's been seen in a
game). Only an invalid email format, an empty username, or an
already-registered email raises **400**.

New accounts are `pending` until an admin approves them
(`POST /api/admin/users/{user_id}/approve`) -- **except** the account whose
email matches `ADMIN_EMAIL` (`server/.env`), which self-approves and
becomes admin immediately (bootstraps the first admin). Response:
`SignupResponse` -- `{"status": "pending"|"approved"|"rejected"}`.

### `POST /api/users/login`
**Auth:** public. Body: `UserLoginRequest` (`email`, `password`). Wrong
credentials or a non-approved account raises **401** (not a distinct
"pending" error -- the client can't tell "wrong password" from "not
approved yet" from the status code alone, only from the message). Response:
`UserLoginResponse` -- `{"token": "..."}`.

### `GET /api/users/me`
**Auth:** user. Returns the caller's own profile, including their linked
`colonist_user_id` if their username matched a `players` doc, and their
`color` (hex, defaults to `#000000`, `DEFAULT_PLAYER_COLOR` in
`server/models/user.py`) -- the dashboard uses this to highlight the
viewer's own player in the board and per-player tables wherever their
username appears in a game, overriding the deterministic categorical
color assigned to everyone else (`app/app/lib/chartTheme.ts`'s
`resolvePlayerColor`). Response: `UserProfile`.

### `PATCH /api/users/me`
**Auth:** user. Body: `UpdateProfileRequest` -- any of `email`/`username`/
`password`/`color`, all optional (only supplied fields change). Changing
`username` re-runs `find_player_by_username` and updates `player_id`
accordingly (to a match, or back to `null` if the new username doesn't
match any `players` doc). `color` must be a 6-digit hex string
(`^#[0-9a-fA-F]{6}$`, enforced by the Pydantic model, **422** if not) --
it's a personal display preference only, not re-validated for uniqueness
against other players' colors. Only a conflicting **email** raises
**400** -- unlike email, `username` has no uniqueness check here (two
accounts can share a username; only an empty one is rejected). Response:
`UserProfile` (post-update).

---

## Admin -- `/api/admin` (`server/routes/admin.py`)

Every route on this router requires admin (`dependencies=[Depends(require_admin)]`
on the router itself, not per-route).

### `GET /api/admin/ingest-token`
Returns the single shared ingest token, creating it on first call
(`get_or_create_ingest_token()`). Response: `ApiTokenResponse` --
`{"token", "created_at"}`.

### `POST /api/admin/ingest-token/regenerate`
Issues a new ingest token, immediately invalidating the old one (any
Chrome extension still holding it starts getting 401s from
`/api/games/ingest` until re-pasted). Response: `ApiTokenResponse`.

### `GET /api/admin/users`
Lists signup accounts for the approval queue. Query param `status`
(default `"pending"`) -- `"all"` returns every status. Response:
`List[AdminUserRow]`, oldest-created first.

### `POST /api/admin/users/{user_id}/approve`
Sets the account to `approved`. If it doesn't already have a `player_id`
(e.g. their matching `players` doc didn't exist yet at signup, because
they hadn't appeared in a stored game), re-runs `find_player_by_username`
once to try linking it now. **404** if `user_id` doesn't exist. Response:
`AdminUserRow`.

### `POST /api/admin/users/{user_id}/reject`
Sets the account to `rejected` -- their existing token (if any) stops
working on its next call, since `get_current_user` re-checks `status`
every time. **404** if `user_id` doesn't exist. Response: `AdminUserRow`.

---

## Misc

### `GET /health`
**Auth:** public. Pings Mongo; returns `{"status": "ok", "db": "ok"}` or
`{"status": "degraded", "db": "error"}` (still HTTP 200 either way -- this
is a status payload, not a failing health check for a load balancer).

---

## Keeping this file current

Update this file in the same change that adds, removes, or changes the
behavior of a route. If you touch `server/routes/*.py`,
`server/services/auth.py`'s dependency tiers, or a route's side effects
(what it writes, what makes it idempotent, what error it raises and why),
this file should reflect it -- not just the route's existence, but why it
behaves the way it does. Field-by-field response shapes stay in `/docs`;
don't duplicate them here.
