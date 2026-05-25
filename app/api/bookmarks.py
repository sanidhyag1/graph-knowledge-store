from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.bookmark import BookmarkArticleItem, BookmarkListResponse, BookmarkToggleResponse
from app.services import bookmark_service

router = APIRouter(prefix="/api/bookmarks", tags=["bookmarks"])


@router.post("/{article_id}", response_model=BookmarkToggleResponse)
async def toggle_bookmark(article_id: str, session: AsyncSession = Depends(get_session)):
    try:
        aid = UUID(article_id)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid article ID")
    bookmarked = await bookmark_service.toggle_bookmark(session, aid)
    return BookmarkToggleResponse(bookmarked=bookmarked)


@router.get("", response_model=BookmarkListResponse)
async def list_bookmarks(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    articles, total = await bookmark_service.list_bookmarks(session, page, limit)
    return BookmarkListResponse(
        articles=[BookmarkArticleItem(**a) for a in articles],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/ids")
async def get_bookmark_ids(session: AsyncSession = Depends(get_session)):
    ids = await bookmark_service.get_bookmarked_ids(session)
    return {"ids": list(ids)}
