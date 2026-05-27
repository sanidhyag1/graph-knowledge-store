import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.database import async_session_factory
from app.models.job import BackgroundJob

logger = logging.getLogger(__name__)

_job_event = asyncio.Event()
_worker_task: asyncio.Task | None = None
_active_jobs: dict[uuid.UUID, asyncio.Task] = {}
_shutdown = False


def trigger_worker():
    """Trigger the worker to check for new jobs immediately."""
    _job_event.set()


def cancel_active_job(job_id: uuid.UUID) -> bool:
    """Attempt to cancel a running job task."""
    task = _active_jobs.get(job_id)
    if task and not task.done():
        task.cancel()
        return True
    return False


async def recover_stuck_jobs():
    """Recover jobs that were left in processing state due to server crash/restart."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(
                update(BackgroundJob)
                .where(BackgroundJob.status == "processing")
                .values(status="pending", started_at=None)
            )
            await session.commit()
            if result.rowcount > 0:
                logger.info("Recovered %d stuck background jobs.", result.rowcount)
    except Exception as e:
        logger.error("Failed to recover stuck background jobs: %s", e)


async def _process_job(job_id: uuid.UUID):
    """Retrieve and process a single background job."""
    async with async_session_factory() as session:
        job = await session.get(BackgroundJob, job_id)
        if not job:
            return

        job_type = job.job_type
        target_id = job.target_id
        payload = job.payload or {}

    logger.info("Starting background job %s of type %s on target %s", job_id, job_type, target_id)

    try:
        if job_type == "enrich_article":
            # Fetch article contents
            from app.models.article import Article
            async with async_session_factory() as session:
                article = await session.get(Article, uuid.UUID(target_id))
                if not article:
                    raise ValueError(f"Article {target_id} not found")
                title = article.title
                content = article.content

            from app.services.article_service import _enrich_article
            await _enrich_article(uuid.UUID(target_id), title, content)

        elif job_type == "generate_quiz":
            from app.services.quiz_service import run_generation
            await run_generation(target_id)

        elif job_type == "generate_weak_areas_quiz":
            from app.services.quiz_service import run_weak_areas_generation
            await run_weak_areas_generation(target_id)

        elif job_type == "generate_flashcards":
            from app.services.flashcard_service import regenerate_flashcards
            async with async_session_factory() as session:
                await regenerate_flashcards(session, uuid.UUID(target_id))

        elif job_type == "generate_flashcards_more":
            from app.services.flashcard_service import generate_flashcards_for_article
            async with async_session_factory() as session:
                n = payload.get("n", 5)
                await generate_flashcards_for_article(session, uuid.UUID(target_id), n=n)

        elif job_type == "sync_obsidian_vault":
            from app.services.obsidian_sync import run_sync
            await run_sync()

        else:
            raise ValueError(f"Unknown job type: {job_type}")

        async with async_session_factory() as session:
            db_job = await session.get(BackgroundJob, job_id)
            if db_job:
                db_job.status = "completed"
                db_job.completed_at = datetime.now(timezone.utc)
                await session.commit()
        logger.info("Completed background job %s", job_id)

    except asyncio.CancelledError:
        logger.info("Background job %s cancelled, reverting to pending", job_id)
        async with async_session_factory() as session:
            db_job = await session.get(BackgroundJob, job_id)
            if db_job:
                db_job.status = "pending"
                db_job.started_at = None
                await session.commit()
        raise

    except Exception as e:
        logger.exception("Background job %s failed", job_id)
        async with async_session_factory() as session:
            db_job = await session.get(BackgroundJob, job_id)
            if db_job:
                db_job.status = "failed"
                db_job.error = str(e)
                db_job.completed_at = datetime.now(timezone.utc)
                await session.commit()


async def _worker_loop():
    """Continuous loop polling for pending background jobs."""
    logger.info("Background job worker loop started.")
    await recover_stuck_jobs()

    global _shutdown
    while not _shutdown:
        try:
            # Safely select and lock next pending job
            async with async_session_factory() as session:
                stmt = (
                    select(BackgroundJob)
                    .where(BackgroundJob.status == "pending")
                    .order_by(BackgroundJob.created_at.asc())
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                res = await session.execute(stmt)
                job = res.scalar_one_or_none()
                
                if job:
                    job.status = "processing"
                    job.started_at = datetime.now(timezone.utc)
                    await session.commit()
                    job_id = job.id
                else:
                    job_id = None

            if job_id:
                task = asyncio.create_task(_process_job(job_id))
                _active_jobs[job_id] = task
                try:
                    await task
                finally:
                    _active_jobs.pop(job_id, None)
            else:
                # Wait for immediate trigger or timeout to poll again
                try:
                    await asyncio.wait_for(_job_event.wait(), timeout=10.0)
                except asyncio.TimeoutError:
                    pass
                _job_event.clear()

        except asyncio.CancelledError:
            logger.info("Background worker loop cancelled.")
            break
        except Exception as e:
            logger.error("Error in background job worker loop: %s", e)
            await asyncio.sleep(5)


def start_worker():
    """Start the background worker task."""
    global _worker_task, _shutdown
    _shutdown = False
    if _worker_task is None:
        _worker_task = asyncio.create_task(_worker_loop())
        logger.info("Started background job worker task.")


def stop_worker():
    """Cancel the background worker task."""
    global _worker_task, _shutdown
    _shutdown = True
    if _worker_task:
        _worker_task.cancel()
        _worker_task = None
        logger.info("Stopped background job worker task.")


async def enqueue_job(session, job_type: str, target_id: str, payload: dict = None) -> BackgroundJob:
    """Create a new background job in the session."""
    job = BackgroundJob(job_type=job_type, target_id=str(target_id), payload=payload)
    session.add(job)
    return job

