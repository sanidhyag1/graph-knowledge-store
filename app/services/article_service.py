import logging
import uuid
from asyncio import get_running_loop
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from fastapi import BackgroundTasks
from sqlalchemy import cast, delete, func, literal, select, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.schemas.article import ArticleCreate, ArticleIndexResponse, ArticleListResponse, ArticleListItem, ArticleUpdate
from app.services.embedding_service import generate_and_store_embeddings
from app.services.extraction_service import extract_metadata
from app.config import settings

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)


async def create_article(
    session: AsyncSession, data: ArticleCreate, background_tasks: BackgroundTasks
) -> Article:
    loop = get_running_loop()
    from app.services.llm_service import generate_title, normalize_markdown_equations

    title = data.title
    if not title or not title.strip():
        title = await loop.run_in_executor(_executor, generate_title, data.content)

    content = data.content
    if data.fix_equations:
        content = await loop.run_in_executor(_executor, normalize_markdown_equations, content)

    article = Article(title=title, content=content)
    session.add(article)
    await session.commit()
    await session.refresh(article)

    from app.services.job_worker import enqueue_job, trigger_worker
    await enqueue_job(session, "enrich_article", str(article.id))
    await session.commit()
    trigger_worker()
    return article


async def get_article(session: AsyncSession, article_id: uuid.UUID) -> Article | None:
    result = await session.execute(select(Article).where(Article.id == article_id))
    return result.scalar_one_or_none()


async def list_articles(
    session: AsyncSession, page: int = 1, limit: int = 20,
    *, topic: str | None = None, keyword: str | None = None,
) -> ArticleListResponse:
    offset = (page - 1) * limit

    stmt = select(Article).order_by(Article.updated_at.desc())
    count_stmt = select(func.count()).select_from(Article)

    if topic:
        cond = text("EXISTS (SELECT 1 FROM jsonb_array_elements_text(articles.topics) elem WHERE LOWER(elem) = LOWER(:topic))")
        stmt = stmt.where(cond).params(topic=topic)
        count_stmt = count_stmt.where(cond).params(topic=topic)
    if keyword:
        cond = text("EXISTS (SELECT 1 FROM jsonb_array_elements_text(articles.keywords) elem WHERE LOWER(elem) = LOWER(:keyword))")
        stmt = stmt.where(cond).params(keyword=keyword)
        count_stmt = count_stmt.where(cond).params(keyword=keyword)

    total_result = await session.execute(count_stmt)
    total = total_result.scalar() or 0

    result = await session.execute(stmt.offset(offset).limit(limit))
    articles = result.scalars().all()

    return ArticleListResponse(
        articles=[ArticleListItem.model_validate(a) for a in articles],
        total=total,
        page=page,
        limit=limit,
    )


async def get_articles_index(session: AsyncSession) -> ArticleIndexResponse:
    from app.schemas.article import ArticleIndexItem

    result = await session.execute(
        select(Article.id, Article.title, Article.summary, Article.topics, Article.keywords)
        .order_by(Article.updated_at.desc())
    )
    rows = result.all()
    articles = [
        ArticleIndexItem(id=r[0], title=r[1], summary=r[2], topics=r[3] or [], keywords=r[4] or [])
        for r in rows
    ]
    return ArticleIndexResponse(articles=articles)


async def update_article(
    session: AsyncSession,
    article_id: uuid.UUID,
    data: ArticleUpdate,
    background_tasks: BackgroundTasks,
) -> Article | None:
    article = await get_article(session, article_id)
    if not article:
        return None

    re_enrich = False
    if data.title is not None:
        article.title = data.title
    if data.content is not None:
        content = data.content
        if data.fix_equations:
            loop = get_running_loop()
            from app.services.llm_service import normalize_markdown_equations
            content = await loop.run_in_executor(_executor, normalize_markdown_equations, content)
        article.content = content
        re_enrich = True

    await session.commit()
    await session.refresh(article)

    if re_enrich:
        article.enrichment_status = "pending"
        await session.commit()
        from app.services.job_worker import enqueue_job, trigger_worker
        await enqueue_job(session, "enrich_article", str(article.id))
        await session.commit()
        trigger_worker()

    return article


async def update_manual_tags(
    session: AsyncSession,
    article_id: uuid.UUID,
    add_topics: list[str] | None = None,
    remove_topics: list[str] | None = None,
    add_keywords: list[str] | None = None,
    remove_keywords: list[str] | None = None,
) -> Article | None:
    article = await get_article(session, article_id)
    if not article:
        return None

    current_topics = set(article.manual_topics or [])
    current_topics |= set(add_topics or [])
    current_topics -= set(remove_topics or [])
    article.manual_topics = sorted(current_topics)

    current_keywords = set(article.manual_keywords or [])
    current_keywords |= set(add_keywords or [])
    current_keywords -= set(remove_keywords or [])
    article.manual_keywords = sorted(current_keywords)

    article.topics = sorted(set(article.topics or []) | set(add_topics or []))
    article.topics = [t for t in article.topics if t not in set(remove_topics or [])]

    article.keywords = sorted(set(article.keywords or []) | set(add_keywords or []))
    article.keywords = [k for k in article.keywords if k not in set(remove_keywords or [])]

    await session.commit()
    await session.refresh(article)

    from app.services.graph_service import sync_article_to_graph
    loop = get_running_loop()
    await loop.run_in_executor(
        _executor,
        partial(sync_article_to_graph, article_id, article.title, article.topics, article.keywords, article.entities or []),
    )

    return article


async def delete_article(session: AsyncSession, article_id: uuid.UUID) -> bool:
    article = await get_article(session, article_id)
    if not article:
        return False

    from app.services.graph_service import delete_article_from_graph
    loop = get_running_loop()
    await loop.run_in_executor(_executor, delete_article_from_graph, article_id)

    # Remove from Obsidian tracking if applicable
    from app.models.obsidian_tracked_file import ObsidianTrackedFile
    await session.execute(
        delete(ObsidianTrackedFile).where(ObsidianTrackedFile.article_id == article_id)
    )

    await session.execute(delete(Article).where(Article.id == article_id))
    await session.commit()
    return True


async def _enrich_article(article_id: uuid.UUID, title: str, content: str) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as session:
        try:
            result = await session.execute(
                select(Article).where(Article.id == article_id)
            )
            article = result.scalar_one_or_none()
            if not article:
                return

            article.enrichment_status = "processing"
            await session.commit()

            loop = get_running_loop()
            metadata = await loop.run_in_executor(_executor, extract_metadata, content)

            article.topics = sorted(set(metadata["topics"]) | set(article.manual_topics or []))
            article.keywords = sorted(set(metadata["keywords"]) | set(article.manual_keywords or []))
            article.entities = metadata["entities"]
            article.summary = metadata["summary"]
            article.enrichment_status = "completed"
            await session.commit()

            await generate_and_store_embeddings(session, article_id, f"{title}\n\n{content}")

            from app.services.graph_service import sync_article_to_graph
            await loop.run_in_executor(
                _executor,
                partial(sync_article_to_graph, article_id, title, metadata["topics"], metadata["keywords"], metadata["entities"]),
            )

            if settings.flashcard_auto_generate:
                try:
                    from app.services.flashcard_service import generate_flashcards_for_article
                    await generate_flashcards_for_article(session, article_id)
                except Exception as fe:
                    logger.warning("Flashcard auto-generation failed for %s: %s", article_id, fe)

            logger.info(f"Article {article_id} enriched, embedded, and synced to graph")
        except Exception as e:
            logger.error(f"Enrichment failed for article {article_id}: {e}")
            try:
                article.enrichment_status = "failed"
                await session.commit()
            except Exception:
                pass
