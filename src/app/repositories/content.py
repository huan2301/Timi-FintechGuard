"""Persistence queries for public content."""

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from src.app.models.content_item import ContentItem


def list_published_content(
    db: Session,
    page_key: str,
    placement: str | None = None,
) -> list[ContentItem]:
    query: Select[tuple[ContentItem]] = (
        select(ContentItem)
        .where(ContentItem.page_key == page_key, ContentItem.is_published.is_(True))
        .order_by(ContentItem.placement, ContentItem.sort_order, ContentItem.created_at)
    )
    if placement:
        query = query.where(ContentItem.placement == placement)
    return list(db.scalars(query).all())
