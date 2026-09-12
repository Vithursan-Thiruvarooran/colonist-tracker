#!/usr/bin/env python3
"""Fetch a colonist.io game's full event history via its internal API.

This replaces scraping the saved HTML / virtualized log panel entirely: the
API returns the complete event-sourced game log, final scores/winner, and
per-player stats in one response.

Requires a logged-in session's JWT (the `jwt_colonist.io` cookie value).
Grab it from DevTools -> Application -> Cookies on colonist.io while logged
in, and put it in a `.env` file in `server/`:

    COLONIST_JWT=<value>

The JWT is a real credential for your colonist.io account -- keep `.env`
out of git (it's already in .gitignore) and never share its value.

Usage:
    python3 server/extractor/fetch_game.py <game_id> <player_color> [-o out.json]

<player_color> is your own seat color for that game (the `playerColor=`
query param in the replay URL you'd view in a browser, e.g.
https://colonist.io/replay?gameId=252749874&playerColor=5 -> 5). The API
validates that this matches the account owning the JWT.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

API_URL = "https://colonist.io/api/replay/data-from-game-id"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def fetch_game(game_id: str, player_color: int, jwt: str) -> dict:
    response = requests.get(
        API_URL,
        params={"gameId": game_id, "playerColor": player_color},
        cookies={"jwt_colonist.io": jwt},
        headers={
            "accept": "application/json, text/plain, */*",
            "user-agent": USER_AGENT,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(f"colonist.io API error: {payload['error']}")
    return payload["data"]


def main() -> None:
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("game_id")
    parser.add_argument("player_color", type=int)
    parser.add_argument("-o", "--output", type=Path, help="Write JSON to this path instead of stdout")
    args = parser.parse_args()

    jwt = os.environ.get("COLONIST_JWT")
    if not jwt:
        parser.error("COLONIST_JWT not set. Add it to server/.env (see server/.env.example).")

    try:
        data = fetch_game(args.game_id, args.player_color, jwt)
    except requests.HTTPError as exc:
        parser.error(f"request failed: {exc}")

    output_text = json.dumps(data, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(output_text, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(output_text)


if __name__ == "__main__":
    main()
