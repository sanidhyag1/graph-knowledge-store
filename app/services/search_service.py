import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import embedding_service as emb_service
from app.services.article_service import get_article_neighbors


async def hybrid_search(session: AsyncSession, query: str, limit: int = 10, alpha: float = 0.5) -> list[dict]:
    vector_results = await emb_service.search_similar(session, query, limit * 3)
    if not vector_results:
        return []

    article_scores: dict[str, dict] = {}
    for r in vector_results:
        aid = str(r["id"])
        article_scores[aid] = {
            **r,
            "vector_score": r["score"],
            "graph_score": 0.0,
        }

    for aid in article_scores:
        try:
            neighbors = get_article_neighbors(uuid.UUID(aid), limit=20)
            for n in neighbors:
                nid = n["id"]
                if nid in article_scores:
                    article_scores[nid]["graph_score"] += n["shared_nodes"]
        except Exception:
            pass

    max_graph = max((s["graph_score"] for s in article_scores.values()), default=1) or 1
    for s in article_scores.values():
        s["graph_score"] = s["graph_score"] / max_graph
        s["hybrid_score"] = alpha * s["vector_score"] + (1 - alpha) * s["graph_score"]

    ranked = sorted(article_scores.values(), key=lambda x: x["hybrid_score"], reverse=True)
    return ranked[:limit]
