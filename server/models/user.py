from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["pending", "approved", "rejected"]


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


class UserProfile(BaseModel):
    user_id: str
    email: str
    username: str
    player_id: Optional[str] = None
    colonist_user_id: Optional[str] = None
    status: Status
    is_admin: bool
    created_at: datetime


class AdminUserRow(BaseModel):
    user_id: str
    email: str
    username: str
    player_id: Optional[str] = None
    status: Status
    is_admin: bool
    created_at: datetime
    decided_at: Optional[datetime] = None
