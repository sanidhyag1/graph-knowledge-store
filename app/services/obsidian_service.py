import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article import Article
from app.models.obsidian_tracked_file import ObsidianTrackedFile

logger = logging.getLogger(__name__)


def _vault_path() -> Path:
    return Path(settings.obsidian_vault_path)


def _attachment_path() -> Path:
    if settings.obsidian_attachment_path:
        return Path(settings.obsidian_attachment_path)
    return _vault_path()


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from markdown content.
    Returns (metadata_dict, clean_content_without_frontmatter).
    """
    if not content.startswith("---"):
        return {}, content
    end = content.find("---", 3)
    if end < 0:
        return {}, content
    frontmatter_text = content[3:end].strip()
    clean_content = content[end + 3:].strip()
    # Simple YAML parsing (key: value) without importing pyyaml
    metadata = {}
    for line in frontmatter_text.split("\n"):
        line = line.strip()
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key == "tags" and value.startswith("["):
                # Parse [tag1, tag2]
                value = [t.strip().strip('"').strip("'") for t in value[1:-1].split(",") if t.strip()]
            metadata[key] = value
    return metadata, clean_content


def compute_file_hash(relative_path: str) -> str:
    """Compute SHA-256 hash of a file's content."""
    file_path = _vault_path() / relative_path
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def resolve_obsidian_images(content: str, note_relative_path: str) -> str:
    """Convert Obsidian image embeds to standard markdown with API URLs.
    
    Handles:
    - ![[image.png]] (Obsidian wikilink embed)
    - ![[image.png|alt text]] (with alt text)
    - ![alt](relative/path.png) (standard markdown, relative paths only)
    """
    # 1. Convert ![[image.png]] and ![[image.png|alt]] to standard markdown
    def replace_wikilink_embed(match):
        ref = match.group(1)
        parts = ref.split("|")
        filename = parts[0].strip()
        alt = parts[1].strip() if len(parts) > 1 else filename
        # Check if it's an image extension
        img_exts = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"}
        ext = Path(filename).suffix.lower()
        if ext in img_exts:
            encoded = filename.replace(" ", "%20")
            return f"![{alt}](/api/obsidian/image?path={encoded})"
        # Non-image wikilink embed, leave as-is
        return match.group(0)
    
    content = re.sub(r"!\[\[([^\]]+)\]\]", replace_wikilink_embed, content)
    
    # 2. Rewrite relative image paths in standard markdown syntax
    note_dir = str(Path(note_relative_path).parent)
    
    def replace_relative_img(match):
        alt = match.group(1)
        path = match.group(2)
        # Skip absolute URLs and already-converted API paths
        if path.startswith(("http://", "https://", "/api/")):
            return match.group(0)
        # Resolve relative to note directory
        if note_dir and note_dir != ".":
            resolved = str(Path(note_dir) / path)
        else:
            resolved = path
        encoded = resolved.replace(" ", "%20")
        return f"![{alt}](/api/obsidian/image?path={encoded})"
    
    content = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace_relative_img, content)
    
    return content


def resolve_wikilinks(content: str) -> str:
    """Convert [[wikilinks]] to a custom syntax that the frontend can resolve.
    
    [[Page Name]] -> [Page Name](/api/obsidian/wikilink?title=Page%20Name)
    [[Page Name|Display Text]] -> [Display Text](/api/obsidian/wikilink?title=Page%20Name)
    
    Note: We don't resolve to article IDs here because that requires DB access.
    The frontend or a separate API call handles resolution.
    """
    def replace_wikilink(match):
        ref = match.group(1)
        parts = ref.split("|")
        target = parts[0].strip()
        display = parts[1].strip() if len(parts) > 1 else target
        encoded = target.replace(" ", "%20")
        return f"[{display}](/api/articles?wikilink={encoded})"
    
    # Match [[...]] but NOT ![[...]] (which are embeds, handled separately)
    content = re.sub(r"(?<!!)\[\[([^\]]+)\]\]", replace_wikilink, content)
    return content


def browse_vault(subpath: str = "") -> list[dict]:
    """List files and directories at the given subpath within the vault."""
    vault = _vault_path()
    if not vault.exists():
        return []
    
    target = vault / subpath if subpath else vault
    if not target.exists() or not target.is_dir():
        return []
    
    # Ensure target is within vault (path traversal prevention)
    try:
        target.resolve().relative_to(vault.resolve())
    except ValueError:
        return []
    
    entries = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        # Skip hidden files/dirs
        if item.name.startswith("."):
            continue
        
        relative = str(item.relative_to(vault))
        
        if item.is_dir():
            entries.append({
                "name": item.name,
                "path": relative,
                "is_dir": True,
                "is_tracked": False,
            })
        elif item.suffix.lower() == ".md":
            entries.append({
                "name": item.name,
                "path": relative,
                "is_dir": False,
                "is_tracked": False,  # Will be updated by caller
            })
    return entries


def get_file_content(relative_path: str) -> str:
    """Read the content of a file in the vault."""
    vault = _vault_path()
    file_path = vault / relative_path
    
    # Path traversal prevention
    try:
        file_path.resolve().relative_to(vault.resolve())
    except ValueError:
        raise ValueError("Path traversal detected")
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {relative_path}")
    
    return file_path.read_text(encoding="utf-8")


def get_image_path(image_path: str) -> Path:
    """Resolve an image path to an absolute filesystem path.
    
    Search order:
    1. Relative to vault root
    2. In the configured attachment folder
    """
    vault = _vault_path()
    
    # Try vault root first
    candidate = vault / image_path
    try:
        candidate.resolve().relative_to(vault.resolve())
    except ValueError:
        raise ValueError("Path traversal detected")
    if candidate.exists():
        return candidate
    
    # Try attachment folder
    att = _attachment_path()
    if att != vault:
        candidate = att / Path(image_path).name
        if candidate.exists():
            # Verify it's within attachment path
            try:
                candidate.resolve().relative_to(att.resolve())
            except ValueError:
                raise ValueError("Path traversal detected")
            return candidate
    
    raise FileNotFoundError(f"Image not found: {image_path}")


async def get_tracked_files(session: AsyncSession) -> list[dict]:
    """Get all tracked files with their sync status."""
    result = await session.execute(
        select(ObsidianTrackedFile).order_by(ObsidianTrackedFile.relative_path)
    )
    tracked = result.scalars().all()
    
    vault = _vault_path()
    files = []
    for tf in tracked:
        file_exists = (vault / tf.relative_path).exists()
        status = "synced"
        if not file_exists:
            status = "missing"
        elif tf.file_hash:
            try:
                current_hash = compute_file_hash(tf.relative_path)
                if current_hash != tf.file_hash:
                    status = "pending"
            except Exception:
                status = "error"
        else:
            status = "pending"
        
        files.append({
            "id": str(tf.id),
            "relative_path": tf.relative_path,
            "article_id": str(tf.article_id) if tf.article_id else None,
            "file_hash": tf.file_hash,
            "last_synced_at": tf.last_synced_at.isoformat() if tf.last_synced_at else None,
            "status": status,
        })
    return files


async def track_files(
    session: AsyncSession, paths: list[str]
) -> int:
    """Track files and create articles for them."""
    from app.services.article_service import _enrich_article

    vault = _vault_path()
    tracked_count = 0
    to_enrich = []

    for rel_path in paths:
        # Check if already tracked
        existing = await session.execute(
            select(ObsidianTrackedFile).where(ObsidianTrackedFile.relative_path == rel_path)
        )
        if existing.scalar_one_or_none():
            continue

        file_path = vault / rel_path
        if not file_path.exists():
            continue

        # Read and parse content
        raw_content = file_path.read_text(encoding="utf-8")
        metadata, clean_content = parse_frontmatter(raw_content)

        # Derive title
        title = metadata.get("title", "") or Path(rel_path).stem

        # Process content: resolve images and wikilinks
        processed_content = resolve_obsidian_images(clean_content, rel_path)
        processed_content = resolve_wikilinks(processed_content)

        # Compute hash
        file_hash = compute_file_hash(rel_path)

        # Create article
        article = Article(
            title=title,
            content=processed_content,
            source="obsidian",
            obsidian_file_path=rel_path,
            obsidian_file_hash=file_hash,
        )
        session.add(article)
        await session.flush()  # Get the article ID

        # Create tracked file entry
        tracked_file = ObsidianTrackedFile(
            relative_path=rel_path,
            article_id=article.id,
            file_hash=file_hash,
            last_synced_at=datetime.now(timezone.utc),
        )
        session.add(tracked_file)
        tracked_count += 1

        to_enrich.append((article.id, article.title, article.content))

    from app.services.job_worker import enqueue_job, trigger_worker
    for aid, title, content in to_enrich:
        await enqueue_job(session, "enrich_article", str(aid))

    await session.commit()
    if to_enrich:
        trigger_worker()
    return tracked_count


async def untrack_files(session: AsyncSession, paths: list[str]) -> int:
    """Remove files from tracking. Does NOT delete the articles."""
    count = 0
    for rel_path in paths:
        result = await session.execute(
            select(ObsidianTrackedFile).where(ObsidianTrackedFile.relative_path == rel_path)
        )
        tracked = result.scalar_one_or_none()
        if tracked:
            await session.delete(tracked)
            count += 1
    await session.commit()
    return count


async def sync_tracked_files(session: AsyncSession) -> dict:
    """Sync all tracked files. Returns {synced: int, errors: int, missing: int}."""
    from app.services.article_service import _enrich_article
    import asyncio

    result = await session.execute(select(ObsidianTrackedFile))
    tracked_files = result.scalars().all()

    vault = _vault_path()
    synced = 0
    errors = 0
    missing = 0
    to_enrich = []

    for tf in tracked_files:
        file_path = vault / tf.relative_path

        if not file_path.exists():
            missing += 1
            continue

        try:
            current_hash = compute_file_hash(tf.relative_path)

            if current_hash == tf.file_hash:
                # No changes
                continue

            # File changed — update article
            raw_content = file_path.read_text(encoding="utf-8")
            metadata, clean_content = parse_frontmatter(raw_content)
            title = metadata.get("title", "") or Path(tf.relative_path).stem
            processed_content = resolve_obsidian_images(clean_content, tf.relative_path)
            processed_content = resolve_wikilinks(processed_content)

            if tf.article_id:
                article_result = await session.execute(
                    select(Article).where(Article.id == tf.article_id)
                )
                article = article_result.scalar_one_or_none()
                if article:
                    article.title = title
                    article.content = processed_content
                    article.obsidian_file_hash = current_hash
                    article.enrichment_status = "pending"

                    to_enrich.append((article.id, title, processed_content))

            tf.file_hash = current_hash
            tf.last_synced_at = datetime.now(timezone.utc)
            synced += 1

        except Exception as e:
            logger.error(f"Error syncing {tf.relative_path}: {e}")
            errors += 1

    from app.services.job_worker import enqueue_job, trigger_worker
    for aid, title, content in to_enrich:
        await enqueue_job(session, "enrich_article", str(aid))

    await session.commit()
    if to_enrich:
        trigger_worker()

    logger.info(f"Obsidian sync complete: {synced} synced, {errors} errors, {missing} missing")
    return {"synced": synced, "errors": errors, "missing": missing}
