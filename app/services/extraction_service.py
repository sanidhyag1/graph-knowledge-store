import json
import logging
import re

from app.services.llm_service import chat

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM = """You analyze articles and extract structured metadata. Return ONLY valid JSON with no additional text."""

EXTRACTION_PROMPT = """Analyze this article and extract structured metadata.

Return ONLY a valid JSON object with this exact structure:
{{
  "topics": ["topic1", "topic2"],
  "keywords": ["keyword1", "keyword2"],
  "entities": [
    {{"name": "Entity Name", "type": "Person|Organization|Technology|Place|Concept|Algorithm|Theory|Dataset|Metric|Event"}}
  ],
  "summary": "A 2-3 sentence summary of the article's main argument and conclusions."
}}

Rules:
- topics: 3-5 broad themes at the level of a university course topic (e.g., "Machine Learning", "Quantum Mechanics", not "Science" or "Section 2.1")
- keywords: 5-10 important specific technical terms, named methods, or unique concepts from this article
- entities: named entities with their type — include algorithms, theories, and datasets as entities
- summary: concise but include the article's main claim/finding, not just its topic
- Do NOT include backslashes, LaTeX, or escape sequences in string values
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text fields

Article:
---
{content}"""


def _fix_json_escapes(text: str) -> str:
    def replace_inside_strings(match: re.Match) -> str:
        s = match.group(0)
        inner = s[1:-1]
        inner = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', inner)
        return '"' + inner + '"'
    return re.sub(r'"(?:[^"\\]|\\.)*"', replace_inside_strings, text)


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        last_backtick = text.rfind("```")
        if first_newline >= 0 and last_backtick > first_newline:
            text = text[first_newline + 1:last_backtick].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None

    fragment = text[start:end + 1]

    try:
        return json.loads(fragment)
    except json.JSONDecodeError:
        pass

    try:
        return json.loads(_fix_json_escapes(fragment))
    except json.JSONDecodeError as e:
        logger.error("Extraction JSON parse failed even after escape fix: %s", e)
        return None


def extract_metadata(content: str) -> dict:
    prompt = EXTRACTION_PROMPT.format(content=content[:6000])
    try:
        raw = chat(prompt, system=EXTRACTION_SYSTEM, temperature=0.0)
        data = _extract_json(raw)
        if not data:
            return {"topics": [], "keywords": [], "entities": [], "summary": ""}
        
        # Sanitize and normalize entities to list of dicts with name/type keys
        raw_entities = data.get("entities", [])
        sanitized_entities = []
        if isinstance(raw_entities, list):
            for ent in raw_entities:
                if isinstance(ent, dict):
                    name = str(ent.get("name", "")).strip()
                    etype = str(ent.get("type", "Concept")).strip()
                    if name:
                        sanitized_entities.append({"name": name, "type": etype})
                elif isinstance(ent, str) and ent.strip():
                    sanitized_entities.append({"name": ent.strip(), "type": "Concept"})

        return {
            "topics": data.get("topics", [])[:5],
            "keywords": data.get("keywords", [])[:10],
            "entities": sanitized_entities,
            "summary": data.get("summary", ""),
        }
    except Exception as e:
        logger.error("Extraction failed: %s", e)
        return {"topics": [], "keywords": [], "entities": [], "summary": ""}
