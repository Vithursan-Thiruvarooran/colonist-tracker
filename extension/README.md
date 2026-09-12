# Colonist Replay Capture (Chrome extension)

Watches colonist.io's own network calls for `/api/replay/data-from-game-id` and
captures the response — no JWT needed, since it rides along with whatever
session the browser is already logged into. This is an alternative to
`server/extractor/fetch_game.py`'s JWT-based fetch, for when that endpoint is
blocking automated requests (see the rate-limit note in
`server/services/game_ingest.py`) or you'd rather just play/browse replays
normally and capture as you go.

## How it works

- `inject.js` runs in the page's own JS context and monkey-patches
  `window.fetch`/`XMLHttpRequest` to see the response body when a matching
  request completes (Manifest V3's `webRequest` API can't read response
  bodies, and the `debugger` API triggers a intrusive "this extension is
  debugging this browser" banner — patching the page's own request functions
  avoids both).
- `content.js` relays captures from the page context to `background.js`.
- `background.js` stores captures (by game ID, most recent 25) in
  `chrome.storage.local` and badges the toolbar icon.
- The popup lists captures with two actions per game: **Download JSON** (saves
  a `colonist-game-<id>.json` file via `chrome.downloads`) and **Send to
  backend** (`POST`s `{"raw": <payload>}` to the configured backend URL —
  `server`'s `POST /api/games/ingest` endpoint accepts this shape directly).

## Load it

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select
   this `extension/` directory.
2. Open colonist.io, play a game or open any replay so the client calls the
   replay endpoint.
3. Click the extension icon — captured game(s) show up there.

## Backend URL

Defaults to `http://localhost:8000/api/games/ingest` (already covered by the
manifest's `host_permissions`, so no CORS setup is needed on the FastAPI side
for the default case). Changing the URL in the popup requests permission for
that origin on save — needed because Chrome extensions bypass CORS only for
origins they hold host permission for.

## Authorizing the extension

`POST /api/games/ingest` requires a bearer token (see `server/services/auth.py`'s
`require_admin_or_ingest_token`). Since the extension can't do an interactive
login, it uses the single shared ingest API token an admin generates on the
dashboard's `/admin` page (`GET`/`POST /api/admin/ingest-token*`, admin-only).
Paste that token into the popup's **API token** field and click **Save** — it's
stored in `chrome.storage.local` and attached to every **Send to
backend**/**Send all** request automatically. A 401 (e.g. after an admin
regenerates the token) clears the stored token and the status line prompts you
to paste a fresh one.
