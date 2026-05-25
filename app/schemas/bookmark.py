import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class BookmarkArticleItem(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None = None
    topics: list = Field(default_factory=list)
    enrichment_status: str = "pending"
    created_at: datetime
    updated_at: datetime
    source: str = "manual"
    bookmarked_at: datetime

    model_config = {"from_attributes": True}


class BookmarkListResponse(BaseModel):
    articles: list[BookmarkArticleItem]
    total: int
    page: int
    limit: int


class BookmarkToggleResponse(BaseModel):
    bookmarked: bool
