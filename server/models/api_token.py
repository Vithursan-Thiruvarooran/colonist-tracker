from datetime import datetime

from pydantic import BaseModel


class ApiTokenResponse(BaseModel):
    token: str
    created_at: datetime
