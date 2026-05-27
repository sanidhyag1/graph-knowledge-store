import uuid

from fastapi import APIRouter, HTTPException

from app.services.article_service import get_article_neighbors

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/article/{article_id}/neighbors")
async def article_neighbors(article_id: str, limit: int = 10):
    try:
        uid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid article ID")
    
    neighbors = await get_article_neighbors(uid, limit)
    return {"article_id": article_id, "neighbors": neighbors}
