import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LLMCallLogResponse(BaseModel):
    id: uuid.UUID
    operation: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: int
    success: bool
    error_message: str | None = None
    input_chars: int | None = None
    output_chars: int | None = None
    input_text: str | None = None
    output_text: str | None = None
    num_ctx: int | None = None
    temperature: float | None = None
    article_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LLMCallLogListResponse(BaseModel):
    logs: list[LLMCallLogResponse]
    total: int
    page: int
    limit: int


class LLMOperationStats(BaseModel):
    operation: str
    call_count: int
    success_count: int
    avg_latency_ms: float
    total_tokens: int
    avg_prompt_tokens: float
    avg_completion_tokens: float


class LLMStatsResponse(BaseModel):
    total_calls: int
    total_success: int
    total_failures: int
    success_rate: float
    avg_latency_ms: float
    total_tokens: int
    total_prompt_tokens: int
    total_completion_tokens: int
    operations: list[LLMOperationStats]
    recent_errors: list[LLMCallLogResponse] = Field(default_factory=list)
