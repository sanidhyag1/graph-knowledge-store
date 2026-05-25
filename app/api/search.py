from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.article import SearchResponse
from app.services import embedding_service as emb_service
from app.services.search_service import hybrid_search

router = APIRouter(prefix="/api/search", tags=["search"])


def _format_result(r: dict) -> dict:
    return {
        "article": {
            "id": r["id"],
            "title": r["title"],
            "summary": r.get("summary"),
            "topics": r.get("topics", []),
            "enrichment_status": r.get("enrichment_status", "pending"),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        },
        "score": r.get("hybrid_score", r.get("score", 0.0)),
    }


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=100),
    mode: str = Query("semantic", pattern="^(semantic|hybrid)$"),
    alpha: float = Query(0.5, ge=0.0, le=1.0),
    session: AsyncSession = Depends(get_session),
):
    if mode == "hybrid":
        results = await hybrid_search(session, q, limit, alpha)
    else:
        results = await emb_service.search_similar(session, q, limit)

    return SearchResponse(
        results=[_format_result(r) for r in results],
        query=q,
    )
