import logging
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)

_sync_engine = None


def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(settings.postgres_sync_url, pool_size=2, max_overflow=2)
    return _sync_engine


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def extract_usage(response) -> tuple[int | None, int | None, int | None]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None, None
    try:
        return (
            getattr(usage, "prompt_tokens", None),
            getattr(usage, "completion_tokens", None),
            getattr(usage, "total_tokens", None),
        )
    except Exception:
        return None, None, None


def log_llm_call(
    operation: str,
    model: str,
    latency_ms: int,
    success: bool,
    input_text: str = "",
    output_text: str = "",
    input_texts: list[str] | None = None,
    error_message: str | None = None,
    num_ctx: int | None = None,
    temperature: float | None = None,
    article_id: uuid.UUID | None = None,
    api_usage: tuple[int | None, int | None, int | None] | None = None,
):
    from app.models.llm_call_log import LLMCallLog

    api_prompt, api_completion, api_total = api_usage or (None, None, None)

    input_chars = len(input_text) if input_text else 0
    if input_texts:
        input_chars += sum(len(t) for t in input_texts)
    output_chars = len(output_text) if output_text else 0

    prompt_tokens = api_prompt if api_prompt is not None else estimate_tokens(input_text)
    completion_tokens = api_completion if api_completion is not None else estimate_tokens(output_text)
    total_tokens = api_total if api_total is not None else (prompt_tokens + completion_tokens)

    try:
        engine = _get_sync_engine()
        with Session(engine) as session:
            log = LLMCallLog(
                operation=operation,
                model=model,
                latency_ms=latency_ms,
                success=success,
                error_message=error_message,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                input_chars=input_chars or None,
                output_chars=output_chars or None,
                input_text=input_text or None,
                output_text=output_text or None,
                num_ctx=num_ctx,
                temperature=temperature,
                article_id=article_id,
            )
            session.add(log)
            session.commit()
    except Exception as e:
        logger.warning("Failed to log LLM call: %s", e)
