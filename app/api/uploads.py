import mimetypes

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services.upload_service import save_upload, get_upload_path

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("")
async def upload_file(file: UploadFile):
    try:
        url = await save_upload(file)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{filename}")
async def serve_upload(filename: str):
    try:
        path = get_upload_path(filename)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="File not found")

    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(path, media_type=content_type)
