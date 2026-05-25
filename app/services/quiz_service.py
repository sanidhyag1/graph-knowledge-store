import asyncio
import json
import logging
import random
import re
from functools import partial

from pydantic import TypeAdapter, ValidationError
from app.schemas.quiz import McqQuestion, ShortAnswerQuestion, FlashcardItem

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article import Article
from app.models.quiz_attempt import QuizAttempt
from app.services.llm_service import chat
from app.database import async_session_factory

logger = logging.getLogger(__name__)


def _questions_for_length(content_len: int) -> int:
    if content_len < 2000:
        return 1
    if content_len < 5000:
        return 2
    if content_len < 10000:
        return 3
    return 4


CHUNK_SIZE = 10000  # ~2500 tokens — safe for 8192 context window

def _chunk_content(content: str) -> list[str]:
    """Split article content into chunks of roughly CHUNK_SIZE characters.
    
    Splits on paragraph boundaries (double newlines) to avoid cutting
    sentences in half. If a single paragraph exceeds CHUNK_SIZE, it is
    included as its own chunk (never mid-sentence split).
    """
    if len(content) <= CHUNK_SIZE:
        return [content]

    paragraphs = content.split("\n\n")
    chunks = []
    current_chunk = ""

    for para in paragraphs:
        # If adding this paragraph would exceed the limit, save current chunk and start new one
        if current_chunk and len(current_chunk) + len(para) + 2 > CHUNK_SIZE:
            chunks.append(current_chunk.strip())
            current_chunk = para
        else:
            current_chunk = current_chunk + "\n\n" + para if current_chunk else para

    # Don't forget the last chunk
    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks if chunks else [content[:CHUNK_SIZE]]


def _assess_question_count(content: str, title: str, quiz_type: str) -> int:
    # Use first chunk for LLM assessment, but scale by total number of chunks
    chunks = _chunk_content(content)
    sample_chunk = chunks[0]

    prompt = ASSESS_PROMPT.format(quiz_type=quiz_type, title=title, content=sample_chunk)
    ctx_size = 8192

    raw = chat(prompt, "You are a helpful assistant that responds with only integers.", num_ctx=ctx_size)
    text = raw.strip()
    match = re.search(r'\d+', text)

    if match:
        per_chunk = max(1, min(int(match.group()), 15))
    else:
        logger.warning("Assessment returned unparseable response: %s, falling back", text[:200])
        per_chunk = _questions_for_length(len(sample_chunk))

    # Scale by number of chunks, cap at 15
    total = min(per_chunk * len(chunks), 15)
    return max(1, total)


MCQ_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {{n}} multiple-choice question(s) from the given article.

RULES:
- Test UNDERSTANDING and SYNTHESIS, not copy-paste facts
- Each question must have exactly 4 options labeled A, B, C, D
- Only ONE option is correct
- Wrong options (distractors) should be plausible but clearly incorrect to someone who understood the material
- Include a brief explanation of why the correct answer is right
- Questions should range from moderate to challenging
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
[
  {{
    "question": "string",
    "options": [
      {{"label": "A", "text": "string"}},
      {{"label": "B", "text": "string"}},
      {{"label": "C", "text": "string"}},
      {{"label": "D", "text": "string"}}
    ],
    "correct_index": 0,
    "explanation": "string"
  }}
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

SHORT_ANSWER_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {{n}} short-answer question(s) from the given article.

RULES:
- Questions should require 1-3 sentence answers
- Test COMPREHENSION, APPLICATION, and ANALYSIS — not regurgitation
- Provide a model answer and 2-4 key points that a good answer should cover
- Questions should range from moderate to challenging
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
[
  {{
    "question": "string",
    "model_answer": "string",
    "key_points": ["string"]
  }}
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

FLASHCARD_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {{n}} flashcard(s) from the given article.

RULES:
- Front: A concept name, term, or focused question (concise, 1-2 lines max)
- Back: A clear, complete explanation (2-4 sentences)
- Hint: A brief clue that helps recall without giving away the answer
- Cover KEY concepts, definitions, relationships, and important details
- Prioritize the most important and testable knowledge
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
[
  {{
    "front": "string",
    "back": "string",
    "hint": "string"
  }}
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

DEDUP_SECTION = """
PREVIOUSLY GENERATED QUESTIONS (do NOT repeat or create similar questions):
{existing}
"""

ARTICLE_PROMPT_TEMPLATE = """ARTICLE TITLE: {title}

ARTICLE CONTENT:
{content}

Remember: respond with ONLY a JSON array. Start with [ and end with ]. No other text."""

WEAK_AREAS_FOCUS = """

FOCUS AREAS — the learner struggles with these concepts. Generate questions that specifically test understanding of them:
{focus_concepts}

Make sure at least half the questions directly relate to these focus areas."""

WEAK_AREAS_MCQ_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {n} multiple-choice question(s) that test the learner's understanding of specific concepts they are struggling with.

RULES:
- Each question must have exactly 4 options labeled A, B, C, D
- Only ONE option is correct
- Wrong options (distractors) should be plausible but clearly incorrect
- Include a brief explanation of why the correct answer is right
- Focus on the CONCEPTS listed as weak areas — test deep understanding, not surface facts
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
[
  {{
    "question": "string",
    "options": [
      {{"label": "A", "text": "string"}},
      {{"label": "B", "text": "string"}},
      {{"label": "C", "text": "string"}},
      {{"label": "D", "text": "string"}}
    ],
    "correct_index": 0,
    "explanation": "string"
  }}
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

ASSESS_PROMPT = """You are an expert educator. Read the following article and determine how many distinct, high-quality {quiz_type} questions can be generated from it.

Consider:
- How many separate concepts, facts, relationships, or procedures are covered
- Whether there is enough depth for questions that test understanding (not just recall)
- Whether the concepts are distinct enough to avoid repetitive questions

Respond with ONLY a single integer between 1 and 15. No explanation, no other text.

ARTICLE TITLE: {title}

ARTICLE CONTENT:
{content}"""


class ArticleInfo:
    __slots__ = ("title", "summary", "topics", "keywords", "content")

    def __init__(self, title: str, summary: str | None, topics: list, keywords: list, content: str):
        self.title = title
        self.summary = summary or ""
        self.topics = topics or []
        self.keywords = keywords or []
        self.content = content


async def fetch_articles(
    session: AsyncSession,
    topics: list[str] | None = None,
    keywords: list[str] | None = None,
) -> list[ArticleInfo]:
    stmt = select(
        Article.title, Article.summary, Article.topics, Article.keywords, Article.content,
    ).order_by(Article.updated_at.desc())

    or_clauses = []
    params = {}
    for i, t in enumerate(topics or []):
        key = f"topic_{i}"
        or_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements_text(articles.topics) elem WHERE LOWER(elem) = LOWER(:{key}))")
        params[key] = t
    for i, k in enumerate(keywords or []):
        key = f"kw_{i}"
        or_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements_text(articles.keywords) elem WHERE LOWER(elem) = LOWER(:{key}))")
        params[key] = k

    if or_clauses:
        stmt = stmt.where(text(" OR ".join(or_clauses))).params(**params)

    result = await session.execute(stmt.limit(30))
    rows = result.all()

    articles = []
    for title, summary, topics_list, keywords_list, content in rows:
        articles.append(ArticleInfo(
            title=title,
            summary=summary,
            topics=topics_list or [],
            keywords=keywords_list or [],
            content=content,
        ))
    return articles


async def fetch_article_by_id(session: AsyncSession, article_id: str) -> ArticleInfo | None:
    stmt = select(
        Article.title, Article.summary, Article.topics, Article.keywords, Article.content,
    ).where(Article.id == article_id)
    result = await session.execute(stmt)
    row = result.first()
    if not row:
        return None
    title, summary, topics, keywords, content = row
    return ArticleInfo(
        title=title,
        summary=summary,
        topics=topics or [],
        keywords=keywords or [],
        content=content,
    )


def _build_existing_questions_section(questions: list[dict], quiz_type: str) -> str:
    if not questions:
        return ""
    lines = []
    for i, q in enumerate(questions, 1):
        if quiz_type == "mcq":
            lines.append(f'{i}. "{q.get("question", "")}"')
        elif quiz_type == "short_answer":
            lines.append(f'{i}. "{q.get("question", "")}"')
        elif quiz_type == "flashcard":
            lines.append(f'{i}. Front: "{q.get("front", "")}"')
    return DEDUP_SECTION.format(existing="\n".join(lines))


def _get_system_prompt(quiz_type: str, n: int) -> str:
    if quiz_type == "mcq":
        return MCQ_SYSTEM.format(n=n)
    elif quiz_type == "short_answer":
        return SHORT_ANSWER_SYSTEM.format(n=n)
    else:
        return FLASHCARD_SYSTEM.format(n=n)


def _extract_question_text(q: dict, quiz_type: str) -> str:
    if quiz_type == "flashcard":
        return q.get("front", "").lower()
    return q.get("question", "").lower()


def _is_duplicate(new_q: dict, existing: list[dict], quiz_type: str) -> bool:
    new_text = _extract_question_text(new_q, quiz_type)
    for existing_q in existing:
        existing_text = _extract_question_text(existing_q, quiz_type)
        if new_text == existing_text:
            return True
        shorter, longer = sorted([new_text, existing_text], key=len)
        if len(shorter) > 20 and shorter in longer:
            return True
    return False


async def run_generation(quiz_id: str, articles: list[ArticleInfo]) -> None:
    loop = asyncio.get_event_loop()
    async with async_session_factory() as session:
        result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
        attempt = result.scalar_one_or_none()
        if not attempt:
            logger.error("QuizAttempt %s not found for generation", quiz_id)
            return

        try:
            questions: list[dict] = list(attempt.questions) if attempt.questions else []

            use_llm_assessment = len(articles) == 1 and attempt.num_questions >= 10

            if use_llm_assessment:
                article = articles[0]
                logger.info(f"Running LLM assessment for article '{article.title}'...")
                assessed = await loop.run_in_executor(
                    None, partial(_assess_question_count, article.content, article.title, attempt.quiz_type),
                )
                assessed = min(assessed, 15)
                attempt.num_questions = assessed
                logger.info("LLM assessed %d questions for article '%s'", assessed, article.title)
                await session.commit()

            # Build a flat list of (article_title, chunk_text) pairs
            all_chunks = []
            for article in articles:
                chunks = _chunk_content(article.content)
                for chunk in chunks:
                    all_chunks.append((article.title, chunk))

            random.shuffle(all_chunks)
            chunk_idx = 0
            rounds = 0
            max_rounds = len(all_chunks) * 3  # Allow multiple passes over chunks

            while len(questions) < attempt.num_questions and rounds < max_rounds:
                remaining = attempt.num_questions - len(questions)
                title, chunk_text = all_chunks[chunk_idx % len(all_chunks)]

                k = min(_questions_for_length(len(chunk_text)), remaining)

                system = _get_system_prompt(attempt.quiz_type, k)
                dedup_section = _build_existing_questions_section(questions, attempt.quiz_type)

                prompt = ARTICLE_PROMPT_TEMPLATE.format(title=title, content=chunk_text)
                if dedup_section:
                    prompt = dedup_section + "\n" + prompt
                prompt += f"\n\nGenerate exactly {k} question(s) from this article."

                ctx_size = 8192  # Safe limit — unchanged

                logger.info(
                    "Calling LLM: chunk %d/%d, length %d chars, num_ctx %d",
                    (chunk_idx % len(all_chunks)) + 1, len(all_chunks),
                    len(chunk_text), ctx_size,
                )
                parsed = []
                current_prompt = prompt
                for attempt_num in range(2):
                    raw = await loop.run_in_executor(None, partial(chat, prompt=current_prompt, system=system, num_ctx=ctx_size, max_tokens=4096))
                    logger.info("LLM returned %d characters.", len(raw))
                    try:
                        parsed = _parse_and_validate(raw, attempt.quiz_type)
                        logger.info("Parsed and validated %d questions from JSON.", len(parsed))
                        break
                    except ValueError as e:
                        logger.warning("LLM validation failed for chunk %d (attempt %d): %s", chunk_idx % len(all_chunks), attempt_num + 1, e)
                        if attempt_num == 0:
                            current_prompt = prompt + f"\n\nIMPORTANT: Your previous response failed validation with these errors:\n{e}\n\nPlease regenerate the entire JSON array, making sure all objects strictly adhere to the requested schema and include all required fields."

                added = 0
                for q in parsed:
                    if added >= k:
                        break
                    if not _is_duplicate(q, questions, attempt.quiz_type):
                        questions.append(q)
                        added += 1

                attempt.questions = list(questions)
                await session.commit()

                chunk_idx += 1
                rounds += 1

            if len(questions) == 0:
                logger.warning(
                    "Quiz generation: produced 0/%d questions for attempt %s",
                    attempt.num_questions, quiz_id,
                )
                attempt.status = "failed"
                attempt.error = "Failed to generate any questions. The article may be too long for the model to follow formatting instructions."
                await session.commit()
                return

            if len(questions) < attempt.num_questions:
                logger.warning(
                    "Quiz generation: only produced %d/%d questions after %d rounds",
                    len(questions), attempt.num_questions, rounds,
                )
                attempt.num_questions = len(questions)

            attempt.status = "ready"
            await session.commit()

        except Exception as e:
            logger.exception("Quiz generation failed for attempt %s", quiz_id)
            attempt.status = "failed"
            attempt.error = str(e)
            await session.commit()


async def run_weak_areas_generation(quiz_id: str) -> None:
    loop = asyncio.get_event_loop()
    async with async_session_factory() as session:
        result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
        attempt = result.scalar_one_or_none()
        if not attempt:
            logger.error("QuizAttempt %s not found for weak-areas generation", quiz_id)
            return

        try:
            questions: list[dict] = list(attempt.questions) if attempt.questions else []
            n = attempt.num_questions

            from app.models.flashcard import Flashcard
            weak_stmt = (
                select(Flashcard)
                .where(Flashcard.state != "new")
                .order_by(Flashcard.ease_factor.asc(), Flashcard.lapses.desc())
                .limit(30)
            )
            weak_result = await session.execute(weak_stmt)
            weak_cards = list(weak_result.scalars().all())

            if not weak_cards:
                attempt.status = "failed"
                attempt.error = "No reviewed flashcards found. Study some flashcards first to identify weak areas."
                await session.commit()
                return

            source_ids = [c.id for c in weak_cards[:n]]
            attempt.source_flashcard_ids = source_ids

            focus_concepts = "\n".join(f"- {c.front}" for c in weak_cards[:20])

            article_ids = list({str(c.article_id) for c in weak_cards})
            articles = []
            for aid in article_ids:
                info = await fetch_article_by_id(session, aid)
                if info:
                    articles.append(info)

            if not articles:
                attempt.status = "failed"
                attempt.error = "Could not load source articles for weak-area flashcards."
                await session.commit()
                return

            # Build chunks from all weak-area articles
            all_chunks = []
            for article in articles:
                chunks = _chunk_content(article.content)
                for chunk in chunks:
                    all_chunks.append((article.title, chunk))

            random.shuffle(all_chunks)
            chunk_idx = 0
            rounds = 0
            max_rounds = len(all_chunks) * 3

            while len(questions) < n and rounds < max_rounds:
                remaining = n - len(questions)
                title, chunk_text = all_chunks[chunk_idx % len(all_chunks)]
                k = min(max(2, remaining), 5)

                system = WEAK_AREAS_MCQ_SYSTEM.format(n=k)
                prompt = ARTICLE_PROMPT_TEMPLATE.format(title=title, content=chunk_text)
                prompt += WEAK_AREAS_FOCUS.format(focus_concepts=focus_concepts)
                prompt += f"\n\nGenerate exactly {k} question(s)."

                dedup_section = _build_existing_questions_section(questions, "mcq")
                if dedup_section:
                    prompt = dedup_section + "\n" + prompt

                ctx_size = 8192

                parsed = []
                current_prompt = prompt
                for attempt_num in range(2):
                    raw = await loop.run_in_executor(None, partial(chat, prompt=current_prompt, system=system, num_ctx=ctx_size, max_tokens=4096))
                    try:
                        parsed = _parse_and_validate(raw, "mcq")
                        break
                    except ValueError as e:
                        logger.warning("Weak areas LLM validation failed (attempt %d): %s", attempt_num + 1, e)
                        if attempt_num == 0:
                            current_prompt = prompt + f"\n\nIMPORTANT: Your previous response failed validation with these errors:\n{e}\n\nPlease regenerate the entire JSON array, making sure all objects strictly adhere to the requested schema and include all required fields."

                added = 0
                for q in parsed:
                    if added >= k or len(questions) >= n:
                        break
                    if not _is_duplicate(q, questions, "mcq"):
                        questions.append(q)
                        added += 1

                attempt.questions = list(questions)
                await session.commit()

                chunk_idx += 1
                rounds += 1

            if len(questions) == 0:
                attempt.status = "failed"
                attempt.error = "Failed to generate any weak-area questions."
                await session.commit()
                return

            if len(questions) < n:
                attempt.num_questions = len(questions)
                source_ids = source_ids[:len(questions)]
                attempt.source_flashcard_ids = source_ids

            attempt.status = "ready"
            await session.commit()

        except Exception as e:
            logger.exception("Weak-areas quiz generation failed for attempt %s", quiz_id)
            attempt.status = "failed"
            attempt.error = str(e)
            await session.commit()


async def get_active_quiz(session: AsyncSession) -> QuizAttempt | None:
    stmt = select(QuizAttempt).where(QuizAttempt.status == "generating").order_by(QuizAttempt.created_at.desc()).limit(1)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_quiz_attempt(session: AsyncSession, quiz_id: str) -> QuizAttempt | None:
    result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
    return result.scalar_one_or_none()


async def _apply_quiz_flashcard_feedback(session: AsyncSession, attempt: QuizAttempt) -> None:
    source_ids = attempt.source_flashcard_ids
    if not source_ids:
        return

    from app.models.flashcard import Flashcard
    from app.services.spaced_rep import review_card as sm2_review

    clean_ids = [sid for sid in source_ids if sid]
    if not clean_ids:
        return

    stmt = select(Flashcard).where(Flashcard.id.in_(clean_ids))
    result = await session.execute(stmt)
    cards_by_id = {c.id: c for c in result.scalars().all()}

    questions = attempt.questions or []
    answers_list = attempt.answers or []

    for i, answer in enumerate(answers_list):
        if i >= len(questions):
            break

        q_idx = answer.get("question_index", i)
        if q_idx >= len(source_ids) or q_idx >= len(questions):
            continue

        flashcard_id = source_ids[q_idx]
        if not flashcard_id or flashcard_id not in cards_by_id:
            continue

        card = cards_by_id[flashcard_id]
        is_correct = answer.get("is_correct", False)

        if is_correct:
            rating = 3
        else:
            rating = 1

        sm2_review(card, rating)

    logger.info(
        "Applied quiz feedback to %d flashcards for quiz %s",
        len(cards_by_id), attempt.id,
    )


async def submit_quiz_answers(
    session: AsyncSession,
    quiz_id: str,
    answers: list[dict],
    score: int,
    total: int,
) -> QuizAttempt | None:
    result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        return None
    attempt.answers = answers
    attempt.score = score
    attempt.status = "completed"
    from datetime import datetime, timezone
    attempt.completed_at = datetime.now(timezone.utc)

    await _apply_quiz_flashcard_feedback(session, attempt)

    await session.commit()
    await session.refresh(attempt)
    return attempt


async def list_quiz_history(session: AsyncSession, limit: int = 20, offset: int = 0) -> list[QuizAttempt]:
    stmt = (
        select(QuizAttempt)
        .where(QuizAttempt.status.in_(["ready", "completed"]))
        .order_by(QuizAttempt.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_quiz(session: AsyncSession, quiz_id: str) -> bool:
    result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        return False
    await session.delete(attempt)
    await session.commit()
    return True


async def delete_quizzes_batch(session: AsyncSession, quiz_ids: list[str]) -> int:
    from sqlalchemy import delete as sql_delete
    stmt = sql_delete(QuizAttempt).where(QuizAttempt.id.in_(quiz_ids))
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount


async def delete_all_quizzes(session: AsyncSession) -> int:
    from sqlalchemy import delete as sql_delete
    from sqlalchemy import func as sql_func

    count_stmt = select(sql_func.count()).select_from(QuizAttempt)
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = sql_delete(QuizAttempt)
    await session.execute(stmt)
    await session.commit()
    return total


def _fix_latex_json_escapes(text: str) -> str:
    def fix_inside_strings(match: re.Match) -> str:
        s = match.group(0)
        inner = s[1:-1]
        inner = re.sub(r'\\([bfnrt])(?=[a-zA-Z{])', r'\\\\\\1', inner)
        inner = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', inner)
        return '"' + inner + '"'
    return re.sub(r'"(?:[^"\\]|\\.)*"', fix_inside_strings, text)


def _parse_json(raw: str) -> list[dict]:
    text = raw.strip()

    cleaned = text
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    def _try_parse(s: str) -> list[dict] | None:
        for attempt_text in (_fix_latex_json_escapes(s), s):
            try:
                parsed = json.loads(attempt_text)
                if isinstance(parsed, list):
                    return parsed
                if isinstance(parsed, dict):
                    return [parsed]
            except (json.JSONDecodeError, ValueError):
                continue
        return None

    if cleaned.startswith("[") or cleaned.startswith("{"):
        result = _try_parse(cleaned)
        if result is not None:
            return result

    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start >= 0 and end > start:
        result = _try_parse(cleaned[start:end + 1])
        if result is not None:
            return result

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        result = _try_parse(cleaned[start:end + 1])
        if result is not None:
            return result

    logger.error("Quiz LLM returned unparseable output (first 500 chars): %s", text[:500])
    return []


def _parse_and_validate(raw: str, quiz_type: str) -> list[dict]:
    parsed_list = _parse_json(raw)
    if not parsed_list:
        raise ValueError("Invalid JSON format or empty array.")
        
    try:
        if quiz_type == "mcq":
            adapter = TypeAdapter(list[McqQuestion])
            valid = adapter.validate_python(parsed_list)
            return [q.model_dump() for q in valid]
        elif quiz_type == "short_answer":
            adapter = TypeAdapter(list[ShortAnswerQuestion])
            valid = adapter.validate_python(parsed_list)
            return [q.model_dump() for q in valid]
        elif quiz_type == "flashcard":
            adapter = TypeAdapter(list[FlashcardItem])
            valid = adapter.validate_python(parsed_list)
            return [q.model_dump() for q in valid]
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = ".".join(str(l) for l in err["loc"])
            errors.append(f"Location '{loc}': {err['msg']}")
        error_text = "\n".join(errors)
        raise ValueError(f"JSON schema validation failed:\n{error_text}")
        
    return parsed_list
