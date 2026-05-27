from datetime import datetime

from pydantic import BaseModel, Field


class QuizGenerateRequest(BaseModel):
    topics: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    quiz_type: str = Field(pattern="^(mcq|short_answer|flashcard)$")
    num_questions: int = Field(default=5, ge=1, le=15)


class ArticleQuizRequest(BaseModel):
    quiz_type: str = Field(pattern="^(mcq|short_answer|flashcard)$")
    num_questions: int = Field(default=5, ge=1, le=15)


class WeakAreasRequest(BaseModel):
    quiz_type: str = Field(pattern="^(mcq|short_answer)$")
    num_questions: int = Field(default=5, ge=3, le=15)


class QuizGenerateResponse(BaseModel):
    quiz_id: str
    status: str


class QuizStatusResponse(BaseModel):
    quiz_id: str
    status: str
    progress: int
    total: int
    quiz_type: str
    topics: list[str]
    keywords: list[str]
    article_count: int
    questions: list[dict]
    source_articles: list[dict] | None = None
    error: str | None = None


class QuizSubmitRequest(BaseModel):
    answers: list[dict] = Field(default_factory=list)
    score: int
    total: int


class McqOption(BaseModel):
    label: str
    text: str


class McqQuestion(BaseModel):
    question: str
    options: list[McqOption]
    correct_index: int
    explanation: str


class ShortAnswerQuestion(BaseModel):
    question: str
    model_answer: str
    key_points: list[str]


class FlashcardItem(BaseModel):
    front: str
    back: str
    hint: str


class QuizResponse(BaseModel):
    quiz_id: str
    quiz_type: str
    topics: list[str]
    keywords: list[str]
    article_count: int
    questions: list[dict]
    answers: list[dict] | None = None
    score: int | None = None
    total: int | None = None
    status: str
    source_flashcard_ids: list[str | None] | None = None
    source_articles: list[dict] | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None


class QuizHistoryItem(BaseModel):
    quiz_id: str
    quiz_type: str
    topics: list[str]
    keywords: list[str]
    score: int | None = None
    total: int | None = None
    num_questions: int
    article_count: int
    status: str
    source_articles: list[dict] | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None


class QuizActiveResponse(BaseModel):
    quiz_id: str
    quiz_type: str
    topics: list[str]
    keywords: list[str]
    progress: int
    total: int
