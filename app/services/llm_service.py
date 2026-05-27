import re
import time

from openai import OpenAI

from app.config import settings
from app.services.llm_observability import extract_usage, log_llm_call


def get_client() -> OpenAI:
    return OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


def get_embedding_client() -> OpenAI:
    base_url = settings.llm_embedding_base_url or settings.llm_base_url
    api_key = settings.llm_embedding_api_key or settings.llm_api_key
    return OpenAI(base_url=base_url, api_key=api_key)


def _call_llm(
    messages: list[dict],
    ctx: int,
    operation: str = "chat",
    input_text: str = "",
    article_id=None,
    max_tokens: int | None = None,
    temperature: float = 0.1,
) -> str:
    start = time.monotonic()
    try:
        client = get_client()
        kwargs = {
            "model": settings.llm_chat_model,
            "messages": messages,
            "temperature": temperature,
            "extra_body": {"num_ctx": ctx},
        }
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
            
        response = client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content
        log_llm_call(
            operation=operation,
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_text=input_text,
            output_text=content or "",
            num_ctx=ctx,
            temperature=temperature,
            article_id=article_id,
            api_usage=extract_usage(response),
        )
        return content
    except Exception as e:
        log_llm_call(
            operation=operation,
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_text=input_text,
            error_message=str(e),
            num_ctx=ctx,
            temperature=temperature,
            article_id=article_id,
        )
        raise


def chat_messages_stream(messages: list[dict], num_ctx: int | None = None):
    ctx = num_ctx or settings.llm_num_ctx
    client = get_client()
    stream = client.chat.completions.create(
        model=settings.llm_chat_model,
        messages=messages,
        temperature=0.1,
        stream=True,
        extra_body={"num_ctx": ctx},
    )
    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content


def chat(
    prompt: str,
    system: str = "You are a helpful assistant.",
    num_ctx: int | None = None,
    article_id=None,
    max_tokens: int | None = None,
    temperature: float = 0.1,
) -> str:
    ctx = num_ctx or settings.llm_num_ctx
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]
    return _call_llm(messages, ctx, operation="chat", input_text=prompt, article_id=article_id, max_tokens=max_tokens, temperature=temperature)


def chat_messages(
    messages: list[dict],
    num_ctx: int | None = None,
    max_tokens: int | None = None,
) -> str:
    ctx = num_ctx or settings.llm_num_ctx
    return _call_llm(messages, ctx, operation="rag_chat", input_text=messages[-1].get("content", ""), max_tokens=max_tokens)


def generate_title(content: str) -> str:
    start = time.monotonic()
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=settings.llm_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": "Generate a concise, descriptive title for the given article text. Return ONLY the title, nothing else. Maximum 100 characters. Do not use quotes. Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX (no $, no \\frac, no \\hat).",
                },
                {
                    "role": "user",
                    "content": content[:2000],
                },
            ],
            temperature=0.3,
            max_tokens=50,
            extra_body={"num_ctx": settings.llm_num_ctx},
        )
        title = response.choices[0].message.content.strip()
        if len(title) > 500:
            title = title[:497] + "..."
        log_llm_call(
            operation="generate_title",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_text=content[:2000],
            output_text=title,
            num_ctx=settings.llm_num_ctx,
            temperature=0.3,
            api_usage=extract_usage(response),
        )
        return title
    except Exception as e:
        log_llm_call(
            operation="generate_title",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_text=content[:2000],
            error_message=str(e),
            num_ctx=settings.llm_num_ctx,
            temperature=0.3,
        )
        raise


def normalize_markdown_equations(content: str) -> str:
    _LATEX_ENVS = [
        "equation", "equation*", "align", "align*", "aligned", "aligned*",
        "gather", "gather*", "cases", "cases*", "matrix", "pmatrix",
        "bmatrix", "vmatrix", "split", "multline", "multline*",
    ]
    env_pattern = "|".join(re.escape(e) for e in _LATEX_ENVS)

    replacements = [
        (rf"\\begin{{({env_pattern})}}(.*?)\\end{{\1}}", r"$$\2$$"),
        (r"\\\[(.*?)\\\]", r"$$\1$$"),
        (r"\\\((.*?)\\\)", r"$\1$"),
    ]

    result = content
    for pattern, repl in replacements:
        result = re.sub(pattern, repl, result, flags=re.DOTALL)

    _fix_dollar_blocks(result)
    return result


def _fix_dollar_blocks(text: str) -> str:
    return text


def fix_equation_snippet(text: str) -> str:
    start = time.monotonic()
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=settings.llm_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a LaTeX equation fixer. Fix the equation delimiters in the given snippet.\n"
                        "Rules:\n"
                        "1. Use $$...$$ for display/block equations\n"
                        "2. Use $...$ for inline equations\n"
                        "3. Return ONLY the fixed snippet — no explanation, no markdown, no code fences\n"
                        "4. Do NOT change the actual math content, only the delimiters\n"
                        "5. Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) only if the input uses them\n"
                        "6. CRITICAL: Keep the COMPLETE equation inside ONE pair of $$ delimiters. Variable names "
                        "like W_Q^{(1)} = or y = or f(x) = are PART of the equation and must be INSIDE $$...$$\n"
                        "7. Do NOT split a single equation across multiple $$ blocks. Everything from the variable "
                        "name through the matrix/expression belongs in ONE $$ block\n"
                        "8. Example: W_Q^{(1)} = \\begin{pmatrix}...\\end{pmatrix} should become "
                        "$$W_Q^{(1)} = \\begin{pmatrix}...\\end{pmatrix}$$ (all in one block)"
                    ),
                },
                {"role": "user", "content": text},
            ],
            temperature=0.0,
            extra_body={"num_ctx": min(4096, settings.llm_num_ctx)},
        )
        fixed = (response.choices[0].message.content or "").strip()
        if not fixed:
            fixed = text
        log_llm_call(
            operation="fix_equation_snippet",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_text=text,
            output_text=fixed,
            num_ctx=min(4096, settings.llm_num_ctx),
            temperature=0.0,
            api_usage=extract_usage(response),
        )
        return fixed
    except Exception as e:
        log_llm_call(
            operation="fix_equation_snippet",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_text=text,
            error_message=str(e),
            num_ctx=min(4096, settings.llm_num_ctx),
            temperature=0.0,
        )
        raise


def embed(texts: list[str]) -> list[list[float]]:
    start = time.monotonic()
    try:
        client = get_embedding_client()
        response = client.embeddings.create(
            model=settings.llm_embedding_model,
            input=texts,
        )
        embeddings = [item.embedding for item in response.data]
        log_llm_call(
            operation="embed",
            model=settings.llm_embedding_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_texts=texts,
            output_text="",
            api_usage=extract_usage(response),
        )
        return embeddings
    except Exception as e:
        log_llm_call(
            operation="embed",
            model=settings.llm_embedding_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_texts=texts,
            error_message=str(e),
        )
        raise
