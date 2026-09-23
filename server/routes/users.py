from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from server.db import get_db
from server.models.user import (
    DEFAULT_PLAYER_COLOR,
    SignupRequest,
    SignupResponse,
    UpdateProfileRequest,
    UserLoginRequest,
    UserLoginResponse,
    UserProfile,
)
from server.services.auth import create_user_token, get_current_user
from server.services.user_auth import login as login_user
from server.services.user_auth import signup as signup_user
from server.services.user_auth import update_profile as update_user_profile

router = APIRouter(prefix="/colonist/api/users", tags=["users"])


async def _build_profile(user: Dict[str, Any], db) -> UserProfile:
    colonist_user_id = None
    if user.get("player_id"):
        player = await db.players.find_one({"player_id": user["player_id"]}, {"colonist_user_id": 1})
        colonist_user_id = player["colonist_user_id"] if player else None

    return UserProfile(
        user_id=user["user_id"],
        email=user["email"],
        username=user["username"],
        player_id=user.get("player_id"),
        colonist_user_id=colonist_user_id,
        status=user["status"],
        is_admin=user["is_admin"],
        created_at=user["created_at"],
        color=user.get("color") or DEFAULT_PLAYER_COLOR,
    )


@router.post("/signup", response_model=SignupResponse)
async def signup(payload: SignupRequest, db=Depends(get_db)):
    try:
        user = await signup_user(db, payload.email, payload.username, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return SignupResponse(status=user["status"])


@router.post("/login", response_model=UserLoginResponse)
async def login(payload: UserLoginRequest, db=Depends(get_db)):
    try:
        user = await login_user(db, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return UserLoginResponse(token=create_user_token(user["user_id"]))


@router.get("/me", response_model=UserProfile)
async def me(user=Depends(get_current_user), db=Depends(get_db)):
    return await _build_profile(user, db)


@router.patch("/me", response_model=UserProfile)
async def update_me(payload: UpdateProfileRequest, user=Depends(get_current_user), db=Depends(get_db)):
    try:
        updated = await update_user_profile(
            db,
            user["user_id"],
            email=payload.email,
            username=payload.username,
            password=payload.password,
            color=payload.color,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await _build_profile(updated, db)
