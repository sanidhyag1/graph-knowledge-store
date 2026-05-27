import json
import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article import Article
from app.models.chat import ChatMessage, ChatSession
from app.services import embedding_service as emb_service
from app.services.llm_service import chat_messages, chat_messages_stream

logger = logging.getLogger(__name__)

RAG_SYSTEM = """You are a knowledgeable assistant that answers questions based ONLY on the provided article excerpts.

Rules:
- Answer the question using only information from the provided context
- If the context doesn't contain enough information to answer, say so honestly
- Cite which article(s) you're drawing from when possible
- When multiple articles are relevant, SYNTHESIZE information across them — don't just pick one
- If articles contain contradictory information, mention the discrepancy
- Be thorough but concise
- Use markdown formatting for clarity (headers, lists, code blocks, bold)
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX"""

RAG_PROMPT_TEMPLATE = """Based on the following articles, answer the question below.

CONTEXT:
{context}

QUESTION:
{query}

Provide a clear, well-structured answer. If the context doesn't fully answer the question, say what you can answer and what information is missing."""


async def retrieve_articles(session: AsyncSession, query: str, limit: int = 5) -> list[dict]:
    results = await emb_service.search_similar(session, query, limit)
    if not results:
        return []

    article_ids = [r["id"] for r in results]
    stmt = select(Article.id, Article.title, Article.content).where(Article.id.in_(article_ids))
    rows = (await session.execute(stmt)).all()

    articles_by_id = {str(row[0]): {"title": row[1], "content": row[2]} for row in rows}

    retrieved = []
    for r in results:
        aid = str(r["id"])
        article = articles_by_id.get(aid)
        if article:
            retrieved.append({
                "id": aid,
                "title": article["title"],
                "content": article["content"],
                "score": r["score"],
            })
    return retrieved


MAX_HISTORY_MESSAGES = 20
MAX_HISTORY_CHARS = 20000


def _trim_history(history: list[dict]) -> list[dict]:
    messages = history[-MAX_HISTORY_MESSAGES:]
    total = sum(len(m.get("content", "")) for m in messages)
    while total > MAX_HISTORY_CHARS and len(messages) > 2:
        removed = messages.pop(0)
        total -= len(removed.get("content", ""))
    return messages


def _build_context(articles: list[dict]) -> str:
    parts = []
    for i, a in enumerate(articles, 1):
        content = a["content"][:6000]
        parts.append(f"--- Article {i}: {a['title']} (relevance: {a['score']:.2f}) ---\n{content}")
    return "\n\n".join(parts)


def generate_answer(query: str, articles: list[dict], history: list[dict] | None = None) -> str:
    context = _build_context(articles)
    context_msg = RAG_PROMPT_TEMPLATE.format(context=context, query=query)
    num_ctx = min(len(context) + len(query) + (sum(len(m.get("content", "")) for m in (history or []))) + 1000, settings.llm_quiz_num_ctx)

    messages = [{"role": "system", "content": RAG_SYSTEM}]
    for m in (history or []):
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": context_msg})

    return chat_messages(messages, num_ctx)


async def ask(session: AsyncSession, query: str, session_id: str | None = None) -> dict:
    articles = await retrieve_articles(session, query, limit=5)

    history = None
    if session_id:
        existing = (await session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )).scalars().all()
        history = [{"role": m.role, "content": m.content} for m in existing]
        history = _trim_history(history)

    if not articles:
        answer = "I couldn't find any relevant articles in your knowledge base to answer this question. Try adding more articles on this topic."
        sources = []
    else:
        from functools import partial
        import asyncio

        loop = asyncio.get_event_loop()
        answer = await loop.run_in_executor(
            None, partial(generate_answer, query, articles, history)
        )
        sources = [{"id": a["id"], "title": a["title"], "score": round(a["score"], 3)} for a in articles]

    if session_id:
        chat_session = await session.get(ChatSession, session_id)
        if chat_session:
            session.add(ChatMessage(
                session_id=session_id,
                role="user",
                content=query,
            ))
            session.add(ChatMessage(
                session_id=session_id,
                role="assistant",
                content=answer,
                sources=sources,
            ))

            messages = (await session.execute(
                select(ChatMessage).where(ChatMessage.session_id == session_id)
            )).scalars().all()
            if len(messages) <= 2:
                chat_session.title = query[:200]
                session.add(chat_session)

            chat_session.updated_at = datetime.now(timezone.utc)
            session.add(chat_session)
            await session.commit()

    return {"answer": answer, "sources": sources}


async def prepare_ask(session: AsyncSession, query: str, session_id: str | None = None) -> tuple[list[dict], list[dict] | None]:
    articles = await retrieve_articles(session, query, limit=5)
    history = None
    if session_id:
        existing = (await session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )).scalars().all()
        history = [{"role": m.role, "content": m.content} for m in existing]
        history = _trim_history(history)
    return articles, history


def generate_answer_stream(query: str, articles: list[dict], history: list[dict] | None = None):
    context = _build_context(articles)
    context_msg = RAG_PROMPT_TEMPLATE.format(context=context, query=query)
    num_ctx = min(len(context) + len(query) + (sum(len(m.get("content", "")) for m in (history or []))) + 1000, settings.llm_quiz_num_ctx)

    messages = [{"role": "system", "content": RAG_SYSTEM}]
    for m in (history or []):
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": context_msg})

    yield from chat_messages_stream(messages, num_ctx)


async def save_messages(session: AsyncSession, session_id: str, query: str, answer: str, sources: list[dict]) -> None:
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        return
    session.add(ChatMessage(session_id=session_id, role="user", content=query))
    session.add(ChatMessage(session_id=session_id, role="assistant", content=answer, sources=sources))

    count = (await session.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id)
    )).scalars().all()
    if len(count) <= 2:
        chat_session.title = query[:200]
        session.add(chat_session)

    chat_session.updated_at = datetime.now(timezone.utc)
    session.add(chat_session)
    await session.commit()


async def create_session(session: AsyncSession) -> ChatSession:
    cs = ChatSession()
    session.add(cs)
    await session.commit()
    await session.refresh(cs)
    return cs


async def list_sessions(session: AsyncSession, limit: int = 50) -> list[ChatSession]:
    stmt = (
        select(ChatSession)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_messages(session: AsyncSession, session_id: str) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_session(session: AsyncSession, session_id: str) -> bool:
    cs = await session.get(ChatSession, session_id)
    if not cs:
        return False
    await session.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
    await session.delete(cs)
    await session.commit()
    return True
