import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ArticleCreate(BaseModel):
    title: str | None = Field(None, max_length=500)
    content: str
    fix_equations: bool = False


class ArticleUpdate(BaseModel):
    title: str | None = Field(None, max_length=500)
    content: str | None = None
    fix_equations: bool = False


class ArticleResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    summary: str | None = None
    source: str = "manual"
    obsidian_file_path: str | None = None
    topics: list = Field(default_factory=list)
    keywords: list = Field(default_factory=list)
    entities: list = Field(default_factory=list)
    enrichment_status: str = "pending"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListItem(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None = None
    source: str = "manual"
    topics: list = Field(default_factory=list)
    enrichment_status: str = "pending"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListResponse(BaseModel):
    articles: list[ArticleListItem]
    total: int
    page: int
    limit: int


class ArticleIndexItem(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None = None
    topics: list = Field(default_factory=list)
    keywords: list = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ArticleIndexResponse(BaseModel):
    articles: list[ArticleIndexItem]


class SearchResult(BaseModel):
    article: ArticleListItem
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str


class TagsUpdateRequest(BaseModel):
    add_topics: list[str] = Field(default_factory=list)
    remove_topics: list[str] = Field(default_factory=list)
    add_keywords: list[str] = Field(default_factory=list)
    remove_keywords: list[str] = Field(default_factory=list)
