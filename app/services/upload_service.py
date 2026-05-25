import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings


def _upload_dir() -> Path:
    p = Path(settings.upload_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def save_upload(file: UploadFile) -> str:
    """Save uploaded file and return the URL path."""
    ext = Path(file.filename or "image.png").suffix.lower()
    allowed = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"}
    if ext not in allowed:
        raise ValueError(f"File type {ext} not allowed")

    filename = f"{uuid.uuid4().hex}{ext}"
    dest = _upload_dir() / filename

    content = await file.read()
    dest.write_bytes(content)

    return f"/api/uploads/{filename}"


def get_upload_path(filename: str) -> Path:
    """Get absolute path for an uploaded file."""
    path = _upload_dir() / filename
    # Path traversal prevention
    try:
        path.resolve().relative_to(_upload_dir().resolve())
    except ValueError:
        raise ValueError("Invalid filename")
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filename}")
    return path
