from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.config import CORS_ALLOWED_ORIGINS
from server.db import close_mongo_connection, connect_to_mongo, get_db
from server.routes.admin import router as admin_router
from server.routes.games import router as games_router
from server.routes.stats import router as stats_router
from server.routes.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    connect_to_mongo()
    db = get_db()
    await db.raw_games.create_index("game_id", unique=True)
    await db.games.create_index("game_id", unique=True)
    await db.games.create_index("players.user_id")
    await db.games.create_index("played_at")
    await db.players.create_index("player_id", unique=True)
    await db.players.create_index(
        "colonist_user_id", unique=True, partialFilterExpression={"colonist_user_id": {"$type": "string"}}
    )
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    yield
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games_router)
app.include_router(stats_router)
app.include_router(users_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    try:
        await get_db().command("ping")
    except Exception:
        return {"status": "degraded", "db": "error"}
    return {"status": "ok", "db": "ok"}
