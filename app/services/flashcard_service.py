import json
import logging
import re
import uuid

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.flashcard import Flashcard
from app.services.llm_service import chat

logger = logging.getLogger(__name__)

FLASHCARD_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else.

Generate exactly {n} flashcard(s) from the given article, optimized for spaced repetition study.

RULES:
- Front: A precise question or concept prompt (1-2 lines). Avoid yes/no questions. Frame as "What is...", "How does...", "Why does...", "Define..."
- Back: A clear, complete answer (2-4 sentences). Include the key definition AND one concrete example or application
- Hint: A category clue or first-letter hint that aids recall without revealing the answer (e.g., "Think about optimization algorithms" or "Starts with 'back-'")
- ONE concept per card — do not combine multiple ideas
- Prioritize: definitions > relationships between concepts > formulas > edge cases
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

EXAMPLE (do not copy this — use the article's content):
[
  {{
    "front": "What is the vanishing gradient problem in deep networks?",
    "back": "The vanishing gradient problem occurs when gradients become exponentially small as they propagate backward through many layers, making early layers learn extremely slowly. This is particularly severe with sigmoid and tanh activations. ReLU and its variants largely mitigate this issue.",
    "hint": "Related to backpropagation through many layers — think about what happens to small numbers when multiplied repeatedly"
  }}
]

Output ONLY a JSON array. Start with [ and end with ]. No other text."""

FLASHCARD_PROMPT = """ARTICLE TITLE: {title}

ARTICLE CONTENT:
{content}

EXISTING CARDS (do NOT duplicate these concepts):
{existing}

Remember: respond with ONLY a JSON array. Start with [ and end with ]. No other text."""


def _fix_latex_json_escapes(text: str) -> str:
    def fix_inside_strings(match: re.Match) -> str:
        s = match.group(0)
        inner = s[1:-1]
        inner = re.sub(r'\\([bfnrt])(?=[a-zA-Z{])', r'\\\\\1', inner)
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

    result = _recover_truncated_json(cleaned)
    if result:
        logger.warning("Recovered %d flashcards from truncated LLM output", len(result))
        return result

    logger.error("Flashcard LLM returned unparseable output (first 500 chars): %s", text[:500])
    return []


def _recover_truncated_json(text: str) -> list[dict]:
    start = text.find("[")
    if start < 0:
        return []

    fragment = text[start:]

    cards: list[dict] = []
    for m in re.finditer(r'\{\s*"front"\s*:\s*"', fragment, re.IGNORECASE):
        obj_start = m.start()
        card = _extract_card_from(fragment[obj_start:])
        if card:
            cards.append(card)

    return cards


def _extract_card_from(text: str) -> dict | None:
    front_match = re.search(r'"front"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.IGNORECASE)
    if not front_match:
        return None
    front = front_match.group(1)

    remaining = text[front_match.end():]
    back_match = re.search(r'"back"\s*:\s*"((?:[^"\\]|\\.)*)"', remaining, re.IGNORECASE)
    if not back_match:
        return None
    back = back_match.group(1)

    remaining = remaining[back_match.end():]
    hint_match = re.search(r'"hint"\s*:\s*"((?:[^"\\]|\\.)*)"', remaining, re.IGNORECASE)
    hint = hint_match.group(1) if hint_match else ""

    def _unescape(s: str) -> str:
        return s.replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t").replace("\\\\", "\\")

    return {"front": _unescape(front), "back": _unescape(back), "hint": _unescape(hint)}


def _is_duplicate(front: str, existing_fronts: list[str]) -> bool:
    front_lower = front.lower().strip()
    for existing in existing_fronts:
        existing_lower = existing.lower().strip()
        if front_lower == existing_lower:
            return True
        shorter, longer = sorted([front_lower, existing_lower], key=len)
        if len(shorter) > 15 and shorter in longer:
            return True
    return False


def generate_flashcards_sync(
    article_id: str,
    title: str,
    content: str,
    n: int,
    existing_fronts: list[str] | None = None,
) -> list[dict]:
    existing = existing_fronts or []
    existing_section = "\n".join(f'- "{f}"' for f in existing) if existing else "(none)"

    system = FLASHCARD_SYSTEM.format(n=n)
    prompt = FLASHCARD_PROMPT.format(title=title, content=content, existing=existing_section)

    num_ctx = min(len(content) + 2000, settings.llm_quiz_num_ctx)
    raw = chat(prompt, system, num_ctx=num_ctx, article_id=str(article_id), temperature=0.3)
    parsed = _parse_json(raw)
    logger.error("DEBUG RAW OUTPUT: %s", raw)
    logger.error("DEBUG PARSED OUTPUT: %s", parsed)

    cards = []
    duplicates_count = 0
    invalid_count = 0
    for item in parsed:
        if isinstance(item, str):
            import json as _json
            try:
                item = _json.loads(item)
            except (_json.JSONDecodeError, ValueError):
                pass
                
        if isinstance(item, (list, tuple)):
            if len(item) >= 2:
                item = {"front": str(item[0]), "back": str(item[1]), "hint": str(item[2]) if len(item) > 2 else ""}
            
        if not isinstance(item, dict):
            logger.error("Flashcard item is not a dict: %r", item)
            invalid_count += 1
            continue
            
        item_lower = {str(k).lower(): v for k, v in item.items()}
        
        front_keys = {"front", "question", "term", "concept", "q", "title", "name"}
        back_keys = {"back", "answer", "definition", "explanation", "a", "content", "value"}
        
        front_val = next((item_lower[k] for k in front_keys if k in item_lower), "")
        back_val = next((item_lower[k] for k in back_keys if k in item_lower), "")
        hint_val = item_lower.get("hint") or item_lower.get("clue") or ""
        
        if not hint_val:
            leftovers = []
            for k, v in item_lower.items():
                if k not in front_keys and k not in back_keys and k not in {"hint", "clue"}:
                    if isinstance(v, str):
                        leftovers.append(f"{k.title()}: {v}")
                    elif isinstance(v, list):
                        leftovers.append(f"{k.title()}: {', '.join(str(x) for x in v)}")
            if leftovers:
                hint_val = " | ".join(leftovers)
        
        front = str(front_val).strip() if front_val else ""
        back = str(back_val).strip() if back_val else ""
        hint = str(hint_val).strip() if hint_val else ""
        
        if not front or not back:
            logger.error("Flashcard item missing front/back: %r", item)
            invalid_count += 1
            continue
            
        if _is_duplicate(front, existing + [c["front"] for c in cards]):
            duplicates_count += 1
            continue
            
        cards.append({"front": front, "back": back, "hint": hint})

    if not cards and parsed:
        if duplicates_count == len(parsed):
            logger.warning("Flashcard generation: all %d cards were duplicates for article %s", len(parsed), article_id)
        else:
            logger.warning("Flashcard generation: 0 cards generated (parsed %d, %d invalid, %d duplicates) for article %s", len(parsed), invalid_count, duplicates_count, article_id)

    return cards


async def generate_flashcards_for_article(
    session: AsyncSession,
    article_id: uuid.UUID,
    n: int | None = None,
) -> int:
    from app.models.article import Article

    result = await session.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        return 0

    count = n or settings.flashcard_auto_count

    existing_result = await session.execute(
        select(Flashcard.front).where(Flashcard.article_id == article_id)
    )
    existing_fronts = [row[0] for row in existing_result.all()]

    from asyncio import get_running_loop
    from functools import partial

    loop = get_running_loop()
    cards = await loop.run_in_executor(
        None,
        partial(
            generate_flashcards_sync,
            str(article_id), article.title, article.content, count, existing_fronts,
        ),
    )

    for card_data in cards:
        flashcard = Flashcard(
            article_id=article_id,
            front=card_data["front"],
            back=card_data["back"],
            hint=card_data.get("hint", ""),
        )
        session.add(flashcard)

    await session.commit()
    logger.info("Generated %d flashcards for article %s", len(cards), article_id)
    return len(cards)


async def regenerate_flashcards(session: AsyncSession, article_id: uuid.UUID) -> int:
    await session.execute(
        sql_delete(Flashcard).where(Flashcard.article_id == article_id)
    )
    await session.commit()
    return await generate_flashcards_for_article(session, article_id)


async def get_flashcards_for_article(
    session: AsyncSession, article_id: uuid.UUID,
) -> list[Flashcard]:
    result = await session.execute(
        select(Flashcard)
        .where(Flashcard.article_id == article_id)
        .order_by(Flashcard.created_at)
    )
    return list(result.scalars().all())


async def get_flashcard_counts(session: AsyncSession) -> dict:
    total = (await session.execute(select(func.count()).select_from(Flashcard))).scalar() or 0
    new = (await session.execute(
        select(func.count()).select_from(Flashcard).where(Flashcard.state == "new")
    )).scalar() or 0
    learning = (await session.execute(
        select(func.count()).select_from(Flashcard).where(Flashcard.state == "learning")
    )).scalar() or 0
    review = (await session.execute(
        select(func.count()).select_from(Flashcard).where(Flashcard.state == "review")
    )).scalar() or 0
    relearning = (await session.execute(
        select(func.count()).select_from(Flashcard).where(Flashcard.state == "relearning")
    )).scalar() or 0

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    due_now = (await session.execute(
        select(func.count()).select_from(Flashcard).where(
            Flashcard.state.in_(["learning", "relearning", "review"]),
            Flashcard.due <= now,
        )
    )).scalar() or 0

    return {
        "total": total,
        "new": new,
        "learning": learning,
        "review": review,
        "relearning": relearning,
        "due_now": due_now,
    }
