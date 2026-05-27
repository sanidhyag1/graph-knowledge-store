import asyncio
import logging
from datetime import datetime, timezone

from app.config import settings
from app.database import async_session_factory
from app.services import obsidian_service

logger = logging.getLogger(__name__)

_last_sync_at: datetime | None = None
_sync_task: asyncio.Task | None = None


def get_last_sync_time() -> datetime | None:
    return _last_sync_at


async def run_sync() -> dict:
    global _last_sync_at
    logger.info("Running Obsidian sync...")
    async with async_session_factory() as session:
        result = await obsidian_service.sync_tracked_files(session)
    _last_sync_at = datetime.now(timezone.utc)
    return result


async def _sync_loop():
    interval = settings.obsidian_sync_interval_minutes * 60
    while True:
        await asyncio.sleep(interval)
        try:
            # Route periodic syncs through the queue for visibility and error tracking
            from app.models.job import BackgroundJob
            from sqlalchemy import select

            async with async_session_factory() as session:
                # Only enqueue if no sync is already pending/processing
                existing = await session.execute(
                    select(BackgroundJob).where(
                        BackgroundJob.job_type == "sync_obsidian_vault",
                        BackgroundJob.status.in_(["pending", "processing"]),
                    )
                )
                if not existing.scalar_one_or_none():
                    from app.services.job_worker import enqueue_job, trigger_worker
                    await enqueue_job(session, "sync_obsidian_vault", "global")
                    await session.commit()
                    trigger_worker()
                    logger.info("Scheduled Obsidian sync enqueued via background queue.")
                else:
                    logger.info("Scheduled Obsidian sync skipped — a sync job is already active.")
        except Exception as e:
            logger.error(f"Obsidian scheduled sync error: {e}")


def start_scheduler():
    global _sync_task
    if not settings.obsidian_vault_path:
        logger.info("Obsidian vault path not configured, skipping sync scheduler")
        return
    logger.info(f"Starting Obsidian sync scheduler (every {settings.obsidian_sync_interval_minutes} min)")
    _sync_task = asyncio.create_task(_sync_loop())


def stop_scheduler():
    global _sync_task
    if _sync_task:
        _sync_task.cancel()
        _sync_task = None
