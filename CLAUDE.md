# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Extracts structured game data (players, dice rolls, trades, builds, robber moves, resource gains, final scores, winner, etc.) for a completed [colonist.io](https://colonist.io) Catan game. colonist.io's internal replay API is the primary source of truth: it returns the complete event-sourced game log plus per-player stats in one response, so there's no HTML/DOM scraping involved.

This is a personal project built in phases:

1. **Extractor** — Python scripts (`server/extractor/`) that fetch a colonist.io game's raw replay data from its API and decode it into structured data (e.g. JSON) per game.
2. **Storage** — a FastAPI backend triggers batch fetches (via colonist.io's public profile-history endpoint) and upserts both the raw and decoded payloads into MongoDB.
3. **Dashboard** — a React frontend (same split as the `scrabble-score-tracker` sibling project): a home page listing stored games (doubling as ingestion history), a game detail view, cross-game stats, a profile page, and a separate ingest page for pasting a raw replay payload -- gated behind an admin login, like the other mutating endpoints (see Auth below).
4. **Browser capture (alternative ingest path)** — a Chrome extension (`extension/`) that watches the colonist.io tab's own network calls to the replay endpoint and captures the response client-side, for when the JWT-based fetch in `server/extractor/fetch_game.py` is impractical (e.g. Cloudflare blocking automated requests). Feeds the same `POST /api/games/ingest` endpoint as manually-pasted payloads, authorized with the admin-managed ingest API token (see Auth below) instead of a login.

## Repository Structure

```
├── server/
│   ├── extractor/  # Phase 1: fetch_game.py / decode_game.py
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

- Input is a finished colonist.io game's raw replay data, fetched from colonist.io's internal replay API (`server/extractor/fetch_game.py`) using a logged-in session's JWT — not a saved HTML file or live scrape.
- `server/extractor/decode_game.py` turns that raw API JSON into human-readable structured data, using `IntEnum`s (resource/piece/achievement/dev-card codes, message types) reverse-engineered and cross-validated against real games — see each enum's docstring for what's confirmed vs. still unknown.
- Both `fetch_game()` and `decode()` are plain functions independent of their CLI `main()`s — `server/services/` imports and calls them directly rather than shelling out or duplicating logic.
- Store sample/fixture JSON files locally for development, but don't commit real opponents' data if it could identify them without their knowledge.

## Storage (Phase 2) — `server/`

- MongoDB via async `motor`, connection managed via FastAPI's lifespan (`server/db/__init__.py`'s `connect_to_mongo()`/`close_mongo_connection()`/`get_db()`), matching the `scrabble-score-tracker` pattern.
- `server/config.py` loads `server/.env` (the same file the extractor CLI scripts read) — `MONGODB_URI`, `MONGODB_DB`, `COLONIST_JWT`, `COLONIST_USERNAME`, `CORS_ALLOWED_ORIGINS`, `AUTH_PASSWORD`.
- `POST /api/games/fetch` (given `{count, username?}`, pulls `username`'s -- or `COLONIST_USERNAME`'s -- match history from colonist.io's public `GET /api/profile/{username}/history` endpoint (`server/services/colonist_history.py`), filters to `finished && hasReplay`, takes the most recent `count`, resolves each game's `player_color` by matching `profileUserId` against that game's `players[]`, then fetches+decodes+upserts each) and `POST /api/games/ingest` (stores a manually-pasted or extension-captured raw payload) both live in `server/routes/games.py` and share `server/services/game_ingest.py`. Games already present (by `game_id`, a unique index) are skipped — safe to re-trigger. `GET /api/games`, `GET /api/games/{game_id}`, and `server/routes/stats.py`'s endpoints serve the dashboard's read side.
- Each `games` document holds **both** `raw` (exactly what `fetch_game()` returns) and `decoded` (exactly what `decode()` returns), plus `player_color`, `source_username`, `fetched_at`.
- Blocking `requests` calls to colonist.io are offloaded to a thread (a small `asyncio.to_thread` backport, since this project's venv is Python 3.8) so they don't block the event loop; Mongo I/O stays natively async via `motor`. Replay-endpoint calls are also paced with a short delay between requests — colonist.io's Cloudflare layer has been observed to silently block a burst of automated requests to that endpoint.

## Auth

- One login: email/username/password app accounts (`server/models/user.py`, `server/services/user_auth.py`) -- no separate shared-password gate. `POST /api/users/signup` and `POST /api/users/login` (`server/routes/users.py`) handle signup/login; signup links the account to an existing `players` doc by matching `username` case-insensitively (`server/services/player_registry.find_player_by_username`), re-checked on every admin approval (`relink_users_to_players`) and on profile edits that change the username.
- New accounts are `pending` until an admin approves them via `POST /api/admin/users/{user_id}/{approve,reject}` (`server/routes/admin.py`), except the account whose email matches `ADMIN_EMAIL` (`server/.env`), which self-approves and gets `is_admin=true` on signup -- solves bootstrapping the first admin.
- `is_admin` gates all data mutation: `require_admin` (`server/services/auth.py`) is required by `POST /api/games/fetch` and every `/api/admin/*` route. `POST /api/games/ingest` uses `require_admin_or_ingest_token` instead, since the Chrome extension can't do an interactive login -- it accepts either a logged-in admin's bearer token or the single shared ingest API token (`server/services/api_tokens.py`, an `api_tokens` singleton doc), which only an admin can view or regenerate (`GET`/`POST /api/admin/ingest-token*`).
- All bearer tokens are signed, 7-day tokens (`server/services/auth.py`); the signing key is `SECRET_KEY` (`server/.env`), independent of any user's password.
- The dashboard (`app/app/services/auth.ts`, `routes/login.tsx`) stores the token in `localStorage` and attaches it in `services/api.ts`'s `apiFetch`; a 401 clears it and redirects to `/login?next=<path>`. `routes/profile.tsx` lets a logged-in user view/edit their email, username, and password, and see their linked player. The Chrome extension holds only the admin-generated ingest token in `chrome.storage.local` (see `extension/README.md`) -- it never logs in itself.

## Dashboard (Phase 3) — `app/`

- React Router v7 + TypeScript + Vite + Tailwind v4, mirroring `scrabble-score-tracker/app`'s conventions: a thin `apiFetch<T>` wrapper in `services/api.ts`, `VITE_API_URL` env var, no Redux/React Query.
- Routes: `/` (`routes/home.tsx`, the games list / ingestion history -- the landing page), `/games/:gameId` (detail), `/ingest` (paste-raw-JSON form, admin-gated), `/stats`, `/login`, `/signup`, `/profile`, `/admin` (pending-signup approval and the ingest API token panel, admin-gated). There's deliberately no frontend for `POST /api/games/fetch` -- it's reachable directly (curl/Postman) but not wired into the UI.

## Browser capture (Phase 4) — `extension/`

- A Manifest V3 Chrome extension, independent of the Python/Node halves of this repo — no build step, loaded unpacked. See `extension/README.md` for load instructions and the data flow (`inject.js` patches `window.fetch`/`XMLHttpRequest` in the colonist.io page's own JS context to see the replay endpoint's response, `content.js` relays it to `background.js`, which stores it; the popup offers per-capture "Download JSON" and "Send to backend" actions).
- "Send to backend" posts `{"raw": <captured payload>}` to `POST /api/games/ingest` (`server/services/game_ingest.py`'s `ingest_raw_game`) — the same endpoint used for manually-pasted payloads, already tolerant of both the wrapped (`{"data": {...}}`) and unwrapped payload shape. That endpoint requires a bearer token (see Auth above), so the popup has a field for pasting the admin-generated ingest API token (from the dashboard's `/admin` page) directly into `chrome.storage.local` -- no login exchange, since the token itself is already a valid bearer credential.
- Exists as an alternative to the JWT-based fetch in `server/extractor/fetch_game.py` for when colonist.io's Cloudflare layer is blocking automated requests to the replay endpoint (see the rate-limit note in `server/services/game_ingest.py`) — this path rides along with whatever session is already logged into the browser instead.
