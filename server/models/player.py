from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class Player(BaseModel):
    """A colonist.io identity (human or bot), deduped across games so the
    same person/bot resolves to one stable `player_id` regardless of how
    many games they've appeared in or whether they've renamed on colonist.io.
    """

    player_id: str
    colonist_user_id: Optional[str] = None
    username: str
    is_bot: bool
    first_seen_at: datetime
    last_seen_at: datetime
