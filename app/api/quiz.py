import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.quiz_attempt import QuizAttempt
from app.schemas.quiz import (
    ArticleQuizRequest,
    QuizActiveResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizHistoryItem,
    QuizResponse,
    QuizStatusResponse,
    QuizSubmitRequest,
    WeakAreasRequest,
)
from app.services import quiz_service

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizGenerateResponse)
async def generate_quiz(
    req: QuizGenerateRequest,
    session: AsyncSession = Depends(get_session),
):
    if not req.topics and not req.keywords:
        raise HTTPException(status_code=400, detail="Provide at least one topic or keyword")

    articles = await quiz_service.fetch_articles(session, topics=req.topics, keywords=req.keywords)
    if not articles:
        raise HTTPException(status_code=404, detail="No articles found for the given filters")

    n = min(req.num_questions, len(articles) * 4)

    attempt = QuizAttempt(
        quiz_type=req.quiz_type,
        topics=req.topics,
        keywords=req.keywords,
        num_questions=n,
        article_count=len(articles),
        status="generating",
        source_articles=[{"id": a.id, "title": a.title} for a in articles],
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)

    quiz_id = attempt.id
    asyncio.create_task(quiz_service.run_generation(quiz_id, articles))

    return QuizGenerateResponse(quiz_id=quiz_id, status="generating")


@router.post("/generate/article/{article_id}", response_model=QuizGenerateResponse)
async def generate_article_quiz(
    article_id: str,
    req: ArticleQuizRequest,
    session: AsyncSession = Depends(get_session),
):
    article = await quiz_service.fetch_article_by_id(session, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    articles = [article]

    attempt = QuizAttempt(
        quiz_type=req.quiz_type,
        topics=article.topics,
        keywords=article.keywords,
        num_questions=10,
        article_count=1,
        status="generating",
        source_articles=[{"id": article.id, "title": article.title}],
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)

    quiz_id = attempt.id
    asyncio.create_task(quiz_service.run_generation(quiz_id, articles))

    return QuizGenerateResponse(quiz_id=quiz_id, status="generating")


@router.post("/generate/weak", response_model=QuizGenerateResponse)
async def generate_weak_areas_quiz(
    req: WeakAreasRequest,
    session: AsyncSession = Depends(get_session),
):
    from app.models.flashcard import Flashcard
    from sqlalchemy import func as sql_func, select as sql_select

    reviewed_count = (await session.execute(
        sql_select(sql_func.count()).select_from(Flashcard).where(Flashcard.state != "new")
    )).scalar() or 0

    if reviewed_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No reviewed flashcards found. Study some flashcards first to identify weak areas.",
        )

    n = req.num_questions

    attempt = QuizAttempt(
        quiz_type=req.quiz_type,
        topics=["weak-areas"],
        keywords=[],
        num_questions=n,
        article_count=0,
        status="generating",
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)

    quiz_id = attempt.id
    asyncio.create_task(quiz_service.run_weak_areas_generation(quiz_id))

    return QuizGenerateResponse(quiz_id=quiz_id, status="generating")


@router.get("/active/now", response_model=QuizActiveResponse | None)
async def active_quiz(session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_active_quiz(session)
    if not attempt:
        return None

    return QuizActiveResponse(
        quiz_id=attempt.id,
        quiz_type=attempt.quiz_type,
        topics=attempt.topics or [],
        keywords=attempt.keywords or [],
        progress=len(attempt.questions or []),
        total=attempt.num_questions,
    )


@router.get("/history/list", response_model=list[QuizHistoryItem])
async def quiz_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    attempts = await quiz_service.list_quiz_history(session, limit=limit, offset=offset)
    return [
        QuizHistoryItem(
            quiz_id=a.id,
            quiz_type=a.quiz_type,
            topics=a.topics or [],
            keywords=a.keywords or [],
            score=a.score,
            total=a.num_questions if a.status == "completed" else None,
            num_questions=a.num_questions,
            article_count=a.article_count,
            status=a.status,
            source_articles=a.source_articles,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a in attempts
    ]


@router.get("/status/{quiz_id}", response_model=QuizStatusResponse)
async def quiz_status(quiz_id: str, session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_quiz_attempt(session, quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return QuizStatusResponse(
        quiz_id=attempt.id,
        status=attempt.status,
        progress=len(attempt.questions or []),
        total=attempt.num_questions,
        quiz_type=attempt.quiz_type,
        topics=attempt.topics or [],
        keywords=attempt.keywords or [],
        article_count=attempt.article_count,
        questions=attempt.questions or [],
        source_articles=attempt.source_articles,
        error=attempt.error,
    )


@router.get("/result/{quiz_id}", response_model=QuizResponse)
async def quiz_result(quiz_id: str, session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_quiz_attempt(session, quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if attempt.status == "generating":
        raise HTTPException(status_code=202, detail="Quiz still generating")
    if attempt.status == "failed":
        raise HTTPException(status_code=500, detail=attempt.error or "Quiz generation failed")

    return _attempt_to_response(attempt)


class BatchDeleteRequest(BaseModel):
    quiz_ids: list[str]


@router.post("/delete/batch", status_code=200)
async def delete_quizzes_batch(
    req: BatchDeleteRequest,
    session: AsyncSession = Depends(get_session),
):
    if not req.quiz_ids:
        raise HTTPException(status_code=400, detail="No quiz IDs provided")
    deleted = await quiz_service.delete_quizzes_batch(session, req.quiz_ids)
    return {"deleted": deleted}


@router.delete("/delete/all", status_code=200)
async def delete_all_quizzes(session: AsyncSession = Depends(get_session)):
    deleted = await quiz_service.delete_all_quizzes(session)
    return {"deleted": deleted}


@router.delete("/{quiz_id}", status_code=204)
async def delete_quiz(quiz_id: str, session: AsyncSession = Depends(get_session)):
    deleted = await quiz_service.delete_quiz(session, quiz_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Quiz not found")


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: str, session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_quiz_attempt(session, quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return _attempt_to_response(attempt)


@router.post("/{quiz_id}/submit", response_model=QuizResponse)
async def submit_quiz(
    quiz_id: str,
    req: QuizSubmitRequest,
    session: AsyncSession = Depends(get_session),
):
    attempt = await quiz_service.submit_quiz_answers(
        session, quiz_id, req.answers, req.score, req.total,
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return _attempt_to_response(attempt)


def _attempt_to_response(a: QuizAttempt) -> QuizResponse:
    return QuizResponse(
        quiz_id=a.id,
        quiz_type=a.quiz_type,
        topics=a.topics or [],
        keywords=a.keywords or [],
        article_count=a.article_count,
        questions=a.questions or [],
        answers=a.answers,
        score=a.score,
        total=a.num_questions,
        status=a.status,
        source_flashcard_ids=a.source_flashcard_ids,
        source_articles=a.source_articles,
        created_at=a.created_at,
        completed_at=a.completed_at,
    )
