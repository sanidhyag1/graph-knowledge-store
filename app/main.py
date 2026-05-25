from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.graph.neo4j_client import init_constraints
        init_constraints()
    except Exception:
        pass

    # Create uploads directory
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    # Start Obsidian sync scheduler
    from app.services.obsidian_sync import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()

    try:
        from app.graph.neo4j_client import close_driver
        close_driver()
    except Exception:
        pass


app = FastAPI(title="Graph Knowledge Store", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
