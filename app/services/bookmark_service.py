import uuid

from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.bookmark import Bookmark


async def toggle_bookmark(session: AsyncSession, article_id: uuid.UUID) -> bool:
    stmt = select(Bookmark).where(Bookmark.article_id == article_id)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        await session.delete(existing)
        await session.commit()
        return False

    bm = Bookmark(article_id=article_id)
    session.add(bm)
    await session.commit()
    return True


async def is_bookmarked(session: AsyncSession, article_id: uuid.UUID) -> bool:
    stmt = select(Bookmark).where(Bookmark.article_id == article_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


async def list_bookmarks(
    session: AsyncSession, page: int = 1, limit: int = 10
) -> tuple[list[dict], int]:
    count_stmt = select(func.count()).select_from(Bookmark)
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Bookmark, Article)
        .join(Article, Bookmark.article_id == Article.id)
        .order_by(Bookmark.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()

    articles = []
    for bm, art in rows:
        articles.append({
            "id": art.id,
            "title": art.title,
            "summary": art.summary,
            "topics": art.topics,
            "enrichment_status": art.enrichment_status,
            "created_at": art.created_at,
            "updated_at": art.updated_at,
            "bookmarked_at": bm.created_at,
        })

    return articles, total


async def get_bookmarked_ids(session: AsyncSession) -> set[str]:
    stmt = select(Bookmark.article_id)
    result = await session.execute(stmt)
    return {str(row[0]) for row in result.all()}
