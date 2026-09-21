from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["pending", "approved", "rejected"]
# 6-digit hex only (what <input type="color"> always emits) -- no 3-digit
# shorthand or named colors, so every stored value is trivially usable as a
# CSS color with no normalization.
_HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"
DEFAULT_PLAYER_COLOR = "#000000"


class SignupRequest(BaseModel):
    email: str
    username: str = Field(description="colonist.io username to link this account to")
    password: str = Field(min_length=8)


class SignupResponse(BaseModel):
    status: Status


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserLoginResponse(BaseModel):
    token: str


class UpdateProfileRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    color: Optional[str] = Field(default=None, pattern=_HEX_COLOR_PATTERN)


class UserProfile(BaseModel):
    user_id: str
    email: str
    username: str
    player_id: Optional[str] = None
    colonist_user_id: Optional[str] = None
    status: Status
    is_admin: bool
    created_at: datetime
    color: str = DEFAULT_PLAYER_COLOR


class AdminUserRow(BaseModel):
    user_id: str
    email: str
    username: str
    player_id: Optional[str] = None
    status: Status
    is_admin: bool
    created_at: datetime
    decided_at: Optional[datetime] = None
