import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.article import Base


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    quiz_type: Mapped[str] = mapped_column(String(20))
    topics: Mapped[list] = mapped_column(JSONB, default=list)
    keywords: Mapped[list] = mapped_column(JSONB, default=list)
    article_count: Mapped[int] = mapped_column(Integer, default=0)
    num_questions: Mapped[int] = mapped_column(Integer)
    questions: Mapped[list] = mapped_column(JSONB, default=list)
    answers: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="generating")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_flashcard_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    source_articles: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
