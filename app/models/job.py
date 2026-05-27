import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.article import Base


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "enrich_article", "generate_quiz", "generate_weak_areas_quiz"
    target_id: Mapped[str] = mapped_column(String(50), nullable=False)  # Target resource identifier (UUID or string)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Store any extra dynamic parameters/args
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending", "processing", "completed", "failed"
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
