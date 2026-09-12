from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from server.db import get_db
from server.models.api_token import ApiTokenResponse
from server.models.user import AdminUserRow
from server.services.api_tokens import get_or_create_ingest_token, regenerate_ingest_token
from server.services.auth import require_admin
from server.services.user_auth import set_user_status

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/ingest-token", response_model=ApiTokenResponse)
async def get_ingest_token(db=Depends(get_db)):
    return ApiTokenResponse(**await get_or_create_ingest_token(db))


@router.post("/ingest-token/regenerate", response_model=ApiTokenResponse)
async def regenerate_ingest_token_route(db=Depends(get_db)):
    return ApiTokenResponse(**await regenerate_ingest_token(db))


@router.get("/users", response_model=List[AdminUserRow])
async def list_users(status: Optional[str] = Query(default="pending"), db=Depends(get_db)):
    query = {} if status == "all" else {"status": status}
    return [AdminUserRow(**doc) async for doc in db.users.find(query, {"_id": 0}).sort("created_at", 1)]


@router.post("/users/{user_id}/approve", response_model=AdminUserRow)
async def approve_user(user_id: str, db=Depends(get_db)):
    try:
        user = await set_user_status(db, user_id, "approved")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return AdminUserRow(**user)


@router.post("/users/{user_id}/reject", response_model=AdminUserRow)
async def reject_user(user_id: str, db=Depends(get_db)):
    try:
        user = await set_user_status(db, user_id, "rejected")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return AdminUserRow(**user)
