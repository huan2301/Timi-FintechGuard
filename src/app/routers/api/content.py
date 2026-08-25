from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.app.db.session import get_db
from src.app.models.content_item import ContentItem
from src.app.repositories.content import list_published_content
from src.app.schemas.admin import ContentItemOut

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/{page_key}", response_model=list[ContentItemOut])
def get_public_content(
    page_key: str,
    placement: str | None = Query(default=None, pattern="^(top|middle|bottom)$"),
    db: Session = Depends(get_db),
) -> list[ContentItem]:
    return list_published_content(db, page_key, placement)
