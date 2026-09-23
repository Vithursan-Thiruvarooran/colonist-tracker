# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Extracts structured game data (players, dice rolls, trades, builds, robber moves, resource gains, final scores, winner, etc.) for a completed [colonist.io](https://colonist.io) Catan game. colonist.io's internal replay API is the primary source of truth: it returns the complete event-sourced game log plus per-player stats in one response, so there's no HTML/DOM scraping involved.

This is a personal project built in phases:

1. **Extractor** — a Python script (`server/extractor/decode_game.py`) that decodes a colonist.io game's raw replay payload (manually pasted or captured by the Chrome extension, see Phase 4) into structured data (e.g. JSON) per game.
2. **Storage** — a FastAPI backend accepts a raw replay payload (manually pasted or extension-captured) and upserts both the raw and decoded payloads into MongoDB.
3. **Dashboard** — a React frontend (same split as the `scrabble-score-tracker` sibling project): a home page listing stored games (doubling as ingestion history), a game detail view, cross-game stats, a profile page, and a separate ingest page for pasting a raw replay payload -- gated behind an admin login, like the other mutating endpoints (see Auth below).
4. **Browser capture (primary ingest path)** — a Chrome extension (`extension/`) that watches the colonist.io tab's own network calls to the replay endpoint and captures the response client-side, riding along with whatever session is already logged into the browser (there's no automated JWT-based fetch in this project — colonist.io's Cloudflare layer has been observed to block automated requests to the replay endpoint). Feeds the same `POST /colonist/api/games/ingest` endpoint as manually-pasted payloads, authorized with the admin-managed ingest API token (see Auth below) instead of a login.

## Repository Structure

```
├── server/
│   ├── extractor/  # Phase 1: decode_game.py
│   ├── config.py, db/, models/, routes/, services/, main.py  # Phase 2/3: FastAPI backend
├── app/            # Phase 3: React Router frontend — the fetch-trigger UI
└── extension/      # Phase 4: Chrome extension — captures replay payloads client-side
```

`server/extractor/` isn't its own top-level package — it lives inside `server/` since the FastAPI backend is its only importer.

## Python Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Use `venv` + `requirements.txt` (matches the `scrabble-score-tracker` sibling project), not poetry/uv.

**Deviation from the sibling project's convention:** there's one root `.venv`/`requirements.txt` for all of `server/` (including `server/extractor/`), rather than `server/` getting its own like the sibling project's backend does. Env vars, however, follow the sibling project's convention: `server/.env`, not a root `.env`. Run the backend from the repo root so `server` resolves as a package:

```bash
python -m uvicorn server.main:app --reload --port 8000
```

`app/` remains a fully separate Node project with its own `package.json`/`node_modules`, run independently:

```bash
cd app
npm install
npm run dev   # http://localhost:5173
```

## Extractor Notes

- `stats.md` (repo root) documents how every stat -- per-player, per-game, and cross-game -- is calculated and exactly where in the code it comes from. Update it in the same change whenever a stat is added, renamed, or its calculation changes; don't let it drift from `decode_game.py`/`game_documents.py`/`game_queries.py`/`stats.tsx`.
- Input is a finished colonist.io game's raw replay data, from colonist.io's internal replay API — obtained via a manually-pasted payload or the Chrome extension's capture (Phase 4), not a saved HTML file or live scrape.
- `server/extractor/decode_game.py` turns that raw API JSON into human-readable structured data, using `IntEnum`s (resource/piece/achievement/dev-card codes, message types) reverse-engineered and cross-validated against real games — see each enum's docstring for what's confirmed vs. still unknown.
- `decode()` is a plain function independent of its CLI `main()` — `server/services/` imports and calls it directly rather than shelling out or duplicating logic.
- Store sample/fixture JSON files locally for development, but don't commit real opponents' data if it could identify them without their knowledge.

## Storage (Phase 2) — `server/`

- `api.md` (repo root) documents every backend endpoint -- auth tier, request/response shape, and the non-obvious behavior (idempotency, side effects, why a given status code) that the auto-generated `/docs` schema alone doesn't capture. Update it in the same change whenever a route in `server/routes/*.py` is added, removed, or its behavior changes; don't let it drift.
- MongoDB via async `motor`, connection managed via FastAPI's lifespan (`server/db/__init__.py`'s `connect_to_mongo()`/`close_mongo_connection()`/`get_db()`), matching the `scrabble-score-tracker` pattern.
- `server/config.py` loads `server/.env` — `MONGODB_URI`, `MONGODB_DB`, `SECRET_KEY`, `ADMIN_EMAIL`, `CORS_ALLOWED_ORIGINS`.
- `POST /colonist/api/games/ingest` (stores a manually-pasted or extension-captured raw payload) lives in `server/routes/games.py` and `server/services/game_ingest.py`. Games already present (by `game_id`, a unique index) are skipped — safe to re-submit. `GET /colonist/api/games`, `GET /colonist/api/games/{game_id}`, and `server/routes/stats.py`'s endpoints serve the dashboard's read side.
- Three collections, each with one job: `raw_games` (`{game_id, raw, source_username, player_color, fetched_at}` — exactly what was pasted or captured, the durable source of truth, never transformed), `games` (the derived, queryable document `server/services/game_documents.py`'s `build_game_document()` builds from `decode()`'s output — everything the dashboard's list/detail/stats views read), and `game_timelines` (the derived, per-event playback document `server/services/timeline_documents.py`'s `build_timeline_document()` builds, kept in its own collection since it's an order of magnitude bigger than `games` and never touched by a cross-game aggregation). All three are keyed by `game_id` (unique index) and reprocessable from `raw_games` alone via `server/scripts/rebuild_games.py` / `rebuild_timelines.py` whenever their schema changes, without re-fetching from colonist.io.
- `GET /colonist/api/games/{game_id}/timeline` serves the replay document to `app/app/routes/game-replay.tsx` (`/games/:gameId/replay`, linked from the game detail page) — a scrubber/play/pause viewer that folds the timeline's per-step deltas onto its `initial_board` (`app/app/lib/timelineFold.ts`) and reuses `CatanBoard` unchanged. `GET /colonist/api/stats/player-games` serves one flat row per (game, player) — pips, resource/activity/dev-card stats — for the `/stats` page's cross-game correlation charts, as opposed to `GET /colonist/api/stats/players`' one-row-per-player rollup.
- `GameDetail.robbery_matrix`/`trade_matrix`/`rejected_trade_matrix` (`{actor_name: {other_player_name: count}}`, all directional -- thief→victim, proposer→accepter, proposer→rejecter) are decoded from `MessageType.ROBBERY_PUBLIC`/`TRADE_PLAYER` log entries and `eventHistory.events[*].stateChange.tradeState` (colonist logs no explicit "trade rejected" message; rejection is derived from a trade offer's `playerResponses` codes -- see `decode_game.py`'s `robbery_matrix()`/`trade_matrix()`/`rejected_trade_matrix()`) and rendered as heatmap-style tables (`app/app/components/ui/MatrixTable.tsx`) on the game detail page.
- Mongo I/O stays natively async via `motor`; `server/services/game_ingest.py` keeps a small `asyncio.to_thread` backport (this project's venv is Python 3.8) around for any future blocking work.

## Auth

- One login: email/username/password app accounts (`server/models/user.py`, `server/services/user_auth.py`) -- no separate shared-password gate. `POST /colonist/api/users/signup` and `POST /colonist/api/users/login` (`server/routes/users.py`) handle signup/login; signup links the account to an existing `players` doc by matching `username` case-insensitively (`server/services/player_registry.find_player_by_username`), re-checked per-user on admin approval and on profile edits that change the username. Separately, `relink_users_to_players` does a bulk sweep of every still-unlinked user after each game ingest, since a new game can bring in a `players` doc that lets a previously-unmatched signup finally link.
- New accounts are `pending` until an admin approves them via `POST /colonist/api/admin/users/{user_id}/{approve,reject}` (`server/routes/admin.py`), except the account whose email matches `ADMIN_EMAIL` (`server/.env`), which self-approves and gets `is_admin=true` on signup -- solves bootstrapping the first admin.
- `is_admin` gates all data mutation: `require_admin` (`server/services/auth.py`) is required by every `/colonist/api/admin/*` route. `POST /colonist/api/games/ingest` uses `require_admin_or_ingest_token` instead, since the Chrome extension can't do an interactive login -- it accepts either a logged-in admin's bearer token or the single shared ingest API token (`server/services/api_tokens.py`, an `api_tokens` singleton doc), which only an admin can view or regenerate (`GET`/`POST /colonist/api/admin/ingest-token*`).
- All bearer tokens are signed, 7-day tokens (`server/services/auth.py`); the signing key is `SECRET_KEY` (`server/.env`), independent of any user's password.
- The dashboard (`app/app/services/auth.ts`, `routes/login.tsx`) stores the token in `localStorage` and attaches it in `services/api.ts`'s `apiFetch`; a 401 clears it and redirects to `/login?next=<path>`. `routes/profile.tsx` lets a logged-in user view/edit their email, username, and password, and see their linked player. The Chrome extension holds only the admin-generated ingest token in `chrome.storage.local` (see `extension/README.md`) -- it never logs in itself.

## Dashboard (Phase 3) — `app/`

- React Router v7 + TypeScript + Vite + Tailwind v4, mirroring `scrabble-score-tracker/app`'s conventions: a thin `apiFetch<T>` wrapper in `services/api.ts`, `VITE_API_URL` env var, no Redux/React Query.
- Routes: `/` (`routes/home.tsx`, the games list / ingestion history -- the landing page), `/games/:gameId` (detail), `/games/:gameId/replay` (turn-by-turn playback, see Storage above), `/ingest` (paste-raw-JSON form, admin-gated), `/stats`, `/login`, `/signup`, `/profile`, `/admin` (pending-signup approval and the ingest API token panel, admin-gated).

## Browser capture (Phase 4) — `extension/`

- A Manifest V3 Chrome extension, independent of the Python/Node halves of this repo — no build step, loaded unpacked. See `extension/README.md` for load instructions and the data flow (`inject.js` patches `window.fetch`/`XMLHttpRequest` in the colonist.io page's own JS context to see the replay endpoint's response, `content.js` relays it to `background.js`, which stores it; the popup offers per-capture "Download JSON" and "Send to backend" actions).
- "Send to backend" posts `{"raw": <captured payload>}` to `POST /colonist/api/games/ingest` (`server/services/game_ingest.py`'s `ingest_raw_game`) — the same endpoint used for manually-pasted payloads, already tolerant of both the wrapped (`{"data": {...}}`) and unwrapped payload shape. That endpoint requires a bearer token (see Auth above), so the popup has a field for pasting the admin-generated ingest API token (from the dashboard's `/admin` page) directly into `chrome.storage.local` -- no login exchange, since the token itself is already a valid bearer credential.
- This is the primary way to get a game's replay data into the backend — colonist.io's Cloudflare layer has been observed to block automated requests to the replay endpoint, so this path rides along with whatever session is already logged into the browser instead.
