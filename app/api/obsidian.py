import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.services import obsidian_service
from app.services.obsidian_sync import get_last_sync_time

router = APIRouter(prefix="/api/obsidian", tags=["obsidian"])


class TrackRequest(BaseModel):
    paths: list[str]


class SettingsRequest(BaseModel):
    attachment_path: str = ""


@router.get("/status")
async def obsidian_status(session: AsyncSession = Depends(get_session)):
    tracked = await obsidian_service.get_tracked_files(session)
    last_sync = get_last_sync_time()
    return {
        "configured": bool(settings.obsidian_vault_path),
        "vault_path": settings.obsidian_vault_path,
        "sync_interval_minutes": settings.obsidian_sync_interval_minutes,
        "last_sync_at": last_sync.isoformat() if last_sync else None,
        "tracked_count": len(tracked),
        "attachment_path": settings.obsidian_attachment_path,
    }


@router.get("/browse")
async def browse_vault(
    path: str = Query(""),
    session: AsyncSession = Depends(get_session),
):
    if not settings.obsidian_vault_path:
        raise HTTPException(status_code=400, detail="Obsidian vault path not configured")

    entries = obsidian_service.browse_vault(path)

    # Mark tracked files
    tracked_files = await obsidian_service.get_tracked_files(session)
    tracked_paths = {tf["relative_path"] for tf in tracked_files}
    for entry in entries:
        if not entry["is_dir"]:
            entry["is_tracked"] = entry["path"] in tracked_paths

    return {"entries": entries, "current_path": path}


@router.get("/tracked")
async def list_tracked(session: AsyncSession = Depends(get_session)):
    files = await obsidian_service.get_tracked_files(session)
    return {"files": files}


@router.post("/track")
async def track_files(
    data: TrackRequest,
    session: AsyncSession = Depends(get_session),
):
    if not settings.obsidian_vault_path:
        raise HTTPException(status_code=400, detail="Obsidian vault path not configured")
    count = await obsidian_service.track_files(session, data.paths)
    return {"tracked": count}


@router.post("/untrack")
async def untrack_files(
    data: TrackRequest,
    session: AsyncSession = Depends(get_session),
):
    count = await obsidian_service.untrack_files(session, data.paths)
    return {"untracked": count}


@router.post("/sync", status_code=202)
async def trigger_sync(session: AsyncSession = Depends(get_session)):
    if not settings.obsidian_vault_path:
        raise HTTPException(status_code=400, detail="Obsidian vault path not configured")

    from app.models.job import BackgroundJob
    from sqlalchemy import select

    # Deduplication: don't enqueue if a sync is already pending/processing
    existing = await session.execute(
        select(BackgroundJob).where(
            BackgroundJob.job_type == "sync_obsidian_vault",
            BackgroundJob.status.in_(["pending", "processing"]),
        )
    )
    if existing.scalar_one_or_none():
        return {"queued": False, "message": "Obsidian sync already in progress"}

    from app.services.job_worker import enqueue_job, trigger_worker
    await enqueue_job(session, "sync_obsidian_vault", "global")
    await session.commit()
    trigger_worker()
    return {"queued": True, "message": "Obsidian vault sync queued"}


@router.get("/image")
async def serve_vault_image(path: str = Query(...)):
    if not settings.obsidian_vault_path:
        raise HTTPException(status_code=400, detail="Obsidian vault not configured")
    try:
        file_path = obsidian_service.get_image_path(path)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Image not found")
    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(file_path, media_type=content_type)


@router.post("/settings")
async def update_settings(data: SettingsRequest):
    # Update runtime settings (won't persist to .env, but works for the session)
    settings.obsidian_attachment_path = data.attachment_path
    return {"attachment_path": settings.obsidian_attachment_path}
