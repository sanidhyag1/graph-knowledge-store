import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_serializer, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.article import Article
from app.models.flashcard import Flashcard
from app.models.job import BackgroundJob
from app.services import flashcard_service
from app.services.spaced_rep import review_card
from app.config import settings

router = APIRouter(prefix="/api/study", tags=["study"])


class ReviewRequest(BaseModel):
    rating: int


class FlashcardOut(BaseModel):
    id: str
    article_id: str
    front: str
    back: str
    hint: str | None
    state: str
    due: datetime | None
    interval: int
    ease_factor: float
    step: int
    repetitions: int
    lapses: int
    last_review: datetime | None
    last_rating: int | None
    created_at: datetime

    @field_validator("article_id", mode="before")
    @classmethod
    def coerce_article_id(cls, v: object) -> str:
        return str(v)

    model_config = {"from_attributes": True}


class DeckInfo(BaseModel):
    article_id: str
    title: str
    total: int
    new: int
    learning: int
    review: int
    relearning: int
    mature: int
    due_now: int


class StudyStats(BaseModel):
    total_cards: int
    new_cards: int
    learning: int
    review: int
    relearning: int
    due_now: int
    reviews_today: int
    correct_today: int
    retention_rate: float
    streak_days: int


@router.get("/stats", response_model=StudyStats)
async def get_study_stats(session: AsyncSession = Depends(get_session)):
    counts = await flashcard_service.get_flashcard_counts(session)

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    reviewed_today = (await session.execute(
        select(func.count()).select_from(Flashcard).where(
            Flashcard.last_review >= today_start
        )
    )).scalar() or 0

    correct_today = (await session.execute(
        select(func.count()).select_from(Flashcard).where(
            Flashcard.last_review >= today_start,
            Flashcard.last_rating >= 3,
        )
    )).scalar() or 0

    retention_rate = (correct_today / reviewed_today * 100) if reviewed_today > 0 else 0.0

    streak = 0
    if reviewed_today > 0:
        streak = 1
        check_date = today_start - __import__("datetime").timedelta(days=1)
        for _ in range(365):
            next_day = check_date + __import__("datetime").timedelta(days=1)
            count = (await session.execute(
                select(func.count()).select_from(Flashcard).where(
                    Flashcard.last_review >= check_date,
                    Flashcard.last_review < next_day,
                )
            )).scalar() or 0
            if count > 0:
                streak += 1
                check_date -= __import__("datetime").timedelta(days=1)
            else:
                break

    return StudyStats(
        total_cards=counts["total"],
        new_cards=counts["new"],
        learning=counts["learning"],
        review=counts["review"],
        relearning=counts["relearning"],
        due_now=counts["due_now"],
        reviews_today=reviewed_today,
        correct_today=correct_today,
        retention_rate=round(retention_rate, 1),
        streak_days=streak,
    )


@router.get("/due", response_model=list[FlashcardOut])
async def get_due_cards(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    stmt = (
        select(Flashcard)
        .where(
            Flashcard.state.in_(["learning", "relearning", "review"]),
            Flashcard.due <= now,
        )
        .order_by(Flashcard.due)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/new", response_model=list[FlashcardOut])
async def get_new_cards(
    limit: int | None = None,
    session: AsyncSession = Depends(get_session),
):
    daily_limit = limit if limit is not None else settings.flashcard_daily_new_limit

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    studied_today = (await session.execute(
        select(func.count()).select_from(Flashcard).where(
            Flashcard.state != "new",
            Flashcard.last_review >= today_start,
        )
    )).scalar() or 0

    remaining = max(0, daily_limit - studied_today) if daily_limit > 0 else 100
    if remaining <= 0:
        return []

    stmt = (
        select(Flashcard)
        .where(Flashcard.state == "new")
        .order_by(Flashcard.created_at)
        .limit(remaining)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("/review/{card_id}", response_model=FlashcardOut)
async def submit_review(
    card_id: str,
    req: ReviewRequest,
    session: AsyncSession = Depends(get_session),
):
    if req.rating not in (1, 2, 3, 4):
        raise HTTPException(status_code=400, detail="Rating must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)")

    result = await session.execute(select(Flashcard).where(Flashcard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    review_card(card, req.rating)
    await session.commit()
    await session.refresh(card)
    return card


@router.get("/decks", response_model=list[DeckInfo])
async def get_decks(session: AsyncSession = Depends(get_session)):
    now = datetime.now(timezone.utc)

    articles_result = await session.execute(
        select(Article.id, Article.title).order_by(Article.updated_at.desc())
    )
    articles = {str(row[0]): row[1] for row in articles_result.all()}

    if not articles:
        return []

    counts_stmt = (
        select(
            Flashcard.article_id,
            func.count().label("total"),
            func.count().filter(Flashcard.state == "new").label("new"),
            func.count().filter(Flashcard.state == "learning").label("learning"),
            func.count().filter(Flashcard.state == "review").label("review"),
            func.count().filter(Flashcard.state == "relearning").label("relearning"),
            func.count().filter(Flashcard.state == "review", Flashcard.repetitions >= 5).label("mature"),
            func.count().filter(
                Flashcard.state.in_(["learning", "relearning", "review"]),
                Flashcard.due <= now,
            ).label("due_now"),
        )
        .group_by(Flashcard.article_id)
    )
    counts_result = await session.execute(counts_stmt)
    article_counts = {}
    for row in counts_result.all():
        article_counts[str(row[0])] = row

    decks = []
    for article_id, title in articles.items():
        if article_id in article_counts:
            row = article_counts[article_id]
            decks.append(DeckInfo(
                article_id=article_id,
                title=title,
                total=row.total,
                new=row.new,
                learning=row.learning,
                review=row.review,
                relearning=row.relearning,
                mature=row.mature,
                due_now=row.due_now,
            ))
        else:
            decks.append(DeckInfo(
                article_id=article_id,
                title=title,
                total=0, new=0, learning=0, review=0, relearning=0, mature=0, due_now=0,
            ))
    return decks


@router.get("/deck/{article_id}", response_model=list[FlashcardOut])
async def get_deck_cards(
    article_id: str,
    session: AsyncSession = Depends(get_session),
):
    cards = await flashcard_service.get_flashcards_for_article(session, uuid.UUID(article_id))
    return cards


@router.post("/generate/{article_id}", status_code=202)
async def generate_cards(
    article_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Queue flashcard (re)generation for an article. Returns 202 immediately."""
    from app.services.job_worker import enqueue_job, trigger_worker

    # Deduplication: don't enqueue if a job is already active for this article
    existing = await session.execute(
        select(BackgroundJob).where(
            BackgroundJob.job_type == "generate_flashcards",
            BackgroundJob.target_id == article_id,
            BackgroundJob.status.in_(["pending", "processing"]),
        )
    )
    if existing.scalar_one_or_none():
        return {"queued": False, "message": "Generation already in progress for this article"}

    await enqueue_job(session, "generate_flashcards", article_id)
    await session.commit()
    trigger_worker()
    return {"queued": True, "message": "Flashcard generation queued"}


@router.post("/generate-more/{article_id}", status_code=202)
async def generate_more_cards(
    article_id: str,
    n: int = 5,
    session: AsyncSession = Depends(get_session),
):
    """Queue generation of N additional flashcards for an article. Returns 202 immediately."""
    from app.services.job_worker import enqueue_job, trigger_worker

    existing = await session.execute(
        select(BackgroundJob).where(
            BackgroundJob.job_type.in_(["generate_flashcards", "generate_flashcards_more"]),
            BackgroundJob.target_id == article_id,
            BackgroundJob.status.in_(["pending", "processing"]),
        )
    )
    if existing.scalar_one_or_none():
        return {"queued": False, "message": "Generation already in progress for this article"}

    await enqueue_job(session, "generate_flashcards_more", article_id, payload={"n": n})
    await session.commit()
    trigger_worker()
    return {"queued": True, "message": "Flashcard generation queued"}


@router.post("/generate-all-missing", status_code=202)
async def generate_all_missing(session: AsyncSession = Depends(get_session)):
    """Queue one flashcard generation job per article that has no flashcards. Returns 202 immediately."""
    from app.services.job_worker import enqueue_job, trigger_worker

    articles_with_cards = (await session.execute(
        select(Flashcard.article_id).distinct()
    )).scalars().all()
    articles_with_cards_set = {str(a) for a in articles_with_cards}

    # Also skip articles that already have a pending/processing generate job
    active_jobs = (await session.execute(
        select(BackgroundJob.target_id).where(
            BackgroundJob.job_type == "generate_flashcards",
            BackgroundJob.status.in_(["pending", "processing"]),
        )
    )).scalars().all()
    already_queued = {str(t) for t in active_jobs}

    all_articles = (await session.execute(
        select(Article.id).order_by(Article.updated_at.desc())
    )).scalars().all()

    queued = 0
    for article_id in all_articles:
        aid_str = str(article_id)
        if aid_str in articles_with_cards_set or aid_str in already_queued:
            continue
        await enqueue_job(session, "generate_flashcards", aid_str)
        queued += 1

    await session.commit()
    if queued:
        trigger_worker()
    return {"queued": queued, "message": f"Queued flashcard generation for {queued} article(s)"}


@router.get("/due-count")
async def get_due_count(session: AsyncSession = Depends(get_session)):
    counts = await flashcard_service.get_flashcard_counts(session)
    return {"due_now": counts["due_now"], "new": counts["new"]}


@router.get("/card/{card_id}", response_model=FlashcardOut)
async def get_card(
    card_id: str,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Flashcard).where(Flashcard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    return card
