# Colonist Replay Capture (Chrome extension)

Watches colonist.io's own network calls for `/api/replay/data-from-game-id` and
captures the response — no JWT needed, since it rides along with whatever
session the browser is already logged into. This is the primary way to get
a game's replay data into the backend (there's no automated JWT-based fetch
in this project) — just play/browse replays normally and capture as you go,
or paste a captured payload manually via the dashboard's `/ingest` page.

## How it works

- `inject.js` runs in the page's own JS context and monkey-patches
  `window.fetch`/`XMLHttpRequest` to see the response body when a matching
  request completes (Manifest V3's `webRequest` API can't read response
  bodies, and the `debugger` API triggers a intrusive "this extension is
  debugging this browser" banner — patching the page's own request functions
  avoids both).
- `content.js` relays captures from the page context to `background.js`.
- `background.js` stores captures (by game ID, most recent 25) in
  `chrome.storage.local`, badges the toolbar icon, and immediately attempts to
  send each freshly captured game to the backend (`POST`s
  `{"raw": <payload>}` to the configured backend URL — `server`'s
  `POST /api/games/ingest` endpoint accepts this shape directly) — no popup
  interaction needed for the common case.
- The popup lists captures with two actions per game: **Download JSON** (saves
  a `colonist-game-<id>.json` file via `chrome.downloads`) and **Send to
  backend** (falls back to "Resend"/manual retry — the same send logic
  `background.js` uses for the automatic attempt, triggered via a
  `SEND_CAPTURE` message so status handling, including clearing a stale auth
  token on 401, only lives in one place).

## Expiry

Captures older than 24h are dropped automatically — `background.js` runs an
hourly `chrome.alarms` prune, and the popup also prunes defensively on open
(in case the alarm hasn't fired yet, e.g. right after install). This just
keeps `chrome.storage.local` from accumulating stale games; it isn't a
statement about how long colonist.io itself keeps replays available.

## Send status

Each capture persists a send status (`unsent` / `sending` / `sent` /
`already stored` / `failed to send`, with the error on hover) in
`chrome.storage.local`, shown as a label under its timestamp — so it survives
closing and reopening the popup, not just the transient button text during a
send. Since sending is automatic, a game usually flips straight from
`sending` to `sent`/`already stored` before you even open the popup; **Send
to backend**/**Resend** exist for when the automatic attempt fails (e.g. the
backend was offline, or the token had expired) or you want to manually
re-ingest something. The toolbar badge reflects status too: it turns red with
a failure count whenever any capture has failed to send, otherwise it shows
the green total-captures count as before.

**Resend unsent/failed** appears above the list whenever there's at least one
capture that hasn't been successfully sent yet, and only retries those —
already-sent captures are left alone (though their per-row **Resend** button
still lets you manually re-send a specific one, e.g. after re-ingesting on
the backend).

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
stored in `chrome.storage.local` and attached to every send, automatic or
manual. A 401 (e.g. after an admin regenerates the token) clears the stored
token and the status line prompts you to paste a fresh one — captures that
failed for this reason sit as "Failed to send" until you do.
