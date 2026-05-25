from fastapi import APIRouter

from app.api.articles import router as articles_router
from app.api.bookmarks import router as bookmarks_router
from app.api.search import router as search_router
from app.api.graph import router as graph_router
from app.api.quiz import router as quiz_router
from app.api.llm_logs import router as llm_logs_router
from app.api.rag import router as rag_router
from app.api.flashcards import router as flashcards_router
from app.api.llm import router as llm_router

router = APIRouter()
router.include_router(articles_router)
router.include_router(bookmarks_router)
router.include_router(search_router)
router.include_router(graph_router)
router.include_router(quiz_router)
router.include_router(llm_logs_router)
router.include_router(rag_router)
router.include_router(flashcards_router)
router.include_router(llm_router)
