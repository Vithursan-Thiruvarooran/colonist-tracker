"""Fetch a colonist.io profile's match history.

Unlike the per-game replay endpoint (see extractor/fetch_game.py), this
endpoint is public and needs no session JWT -- it's what colonist.io's
profile page itself calls.

Confirmed via a captured browser request:
    GET https://colonist.io/api/profile/<username>/history

Response shape (fields relevant to us):
    {
        "profileUserId": "<user id>",
        "gameDatas": [
            {
                "id": "<game id>",
                "finished": bool,
                "hasReplay": bool,
                "startTime": "<epoch ms, as a string>",
                "players": [
                    {"userId": "...", "playerColor": <int>, ...},
                    ...
                ],
                ...
            },
            ...
        ]
    }

There's no pagination/limit query param -- it always returns the same fixed
recent batch (observed to be the last 100 games), ordered oldest to newest.
"""
from __future__ import annotations

import requests

from server.extractor.fetch_game import USER_AGENT

HISTORY_URL_TEMPLATE = "https://colonist.io/api/profile/{username}/history"


def fetch_profile_history(username: str) -> dict:
    response = requests.get(
        HISTORY_URL_TEMPLATE.format(username=username),
        headers={
            "accept": "application/json, text/plain, */*",
            "user-agent": USER_AGENT,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
