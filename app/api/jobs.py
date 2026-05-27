import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.job import BackgroundJob
from app.schemas.job import JobResponse

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("", response_model=list[JobResponse])
async def list_jobs(session: AsyncSession = Depends(get_session)):
    """Retrieve all pending/processing background jobs, plus the top 20 most recently completed/failed jobs, with resolved labels."""
    # Query 1: Active jobs
    active_stmt = select(BackgroundJob).where(BackgroundJob.status.in_(["pending", "processing"]))
    active_res = await session.execute(active_stmt)
    active_jobs = active_res.scalars().all()

    # Query 2: Recently completed/failed jobs
    history_stmt = (
        select(BackgroundJob)
        .where(BackgroundJob.status.in_(["completed", "failed"]))
        .order_by(BackgroundJob.completed_at.desc())
        .limit(20)
    )
    history_res = await session.execute(history_stmt)
    history_jobs = history_res.scalars().all()

    # Combine and sort by created_at desc
    jobs = list(active_jobs) + list(history_jobs)
    jobs.sort(key=lambda j: j.created_at, reverse=True)

    from app.models.article import Article
    from app.models.quiz_attempt import QuizAttempt

    # Collect IDs for bulk lookup
    article_ids = []
    quiz_ids = []
    for job in jobs:
        if job.job_type in ("enrich_article", "generate_flashcards", "generate_flashcards_more"):
            try:
                article_ids.append(uuid.UUID(job.target_id))
            except (ValueError, TypeError):
                pass
        elif job.job_type in ("generate_quiz", "generate_weak_areas_quiz"):
            quiz_ids.append(job.target_id)

    # Bulk fetch article titles
    article_titles = {}
    if article_ids:
        art_res = await session.execute(
            select(Article.id, Article.title).where(Article.id.in_(article_ids))
        )
        article_titles = {str(row[0]): row[1] for row in art_res.all()}

    # Bulk fetch quiz labels
    quiz_labels = {}
    if quiz_ids:
        q_res = await session.execute(
            select(QuizAttempt.id, QuizAttempt.quiz_type, QuizAttempt.topics).where(QuizAttempt.id.in_(quiz_ids))
        )
        for q_id, q_type, q_topics in q_res.all():
            topics_str = ", ".join(q_topics) if q_topics else "All"
            quiz_labels[q_id] = f"{q_type.upper()} ({topics_str})"

    # Construct responses with labels
    response_jobs = []
    for job in jobs:
        label = None
        if job.job_type == "enrich_article":
            label = article_titles.get(job.target_id, f"Article: {job.target_id}")
        elif job.job_type in ("generate_quiz", "generate_weak_areas_quiz"):
            label = quiz_labels.get(job.target_id, f"Quiz: {job.target_id}")
        elif job.job_type in ("generate_flashcards", "generate_flashcards_more"):
            label = article_titles.get(job.target_id, f"Article: {job.target_id}")
        elif job.job_type == "sync_obsidian_vault":
            label = "Obsidian Vault"

        response_jobs.append({
            "id": job.id,
            "job_type": job.job_type,
            "target_id": job.target_id,
            "target_label": label,
            "payload": job.payload,
            "status": job.status,
            "error": job.error,
            "created_at": job.created_at,
            "started_at": job.started_at,
            "completed_at": job.completed_at,
        })

    return response_jobs


@router.delete("/{job_id}", status_code=204)
async def cancel_job(job_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    """Cancel a background job by deleting it. Active processing jobs will be interrupted."""
    job = await session.get(BackgroundJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status == "processing":
        from app.services.job_worker import cancel_active_job
        cancel_active_job(job_id)

    await session.delete(job)
    await session.commit()
