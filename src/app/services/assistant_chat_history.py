"""Database-backed, user-isolated context and exact-repeat cache for Timi chat."""

from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from src.app.config import Settings
from src.app.models.assistant_chat_exchange import AssistantChatExchange
from src.app.schemas.assistant import AssistantChatHistoryItem, AssistantChatTurn


def _utcnow() -> datetime:
    return datetime.now(UTC)


def normalize_question(message: str) -> str:
    """Normalise only for exact-repeat lookup; retain the original message too."""
    decomposed = unicodedata.normalize("NFD", message.strip().lower())
    without_accents = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return re.sub(r"\s+", " ", without_accents)


def question_hash(message: str) -> str:
    return hashlib.sha256(normalize_question(message).encode("utf-8")).hexdigest()


def cached_exchange_statement(
    *,
    user_id: uuid.UUID,
    message: str,
    cache_version: str,
    now: datetime,
):
    """Build a strictly user-scoped cache lookup.

    Keeping this predicate in one place makes cross-account reuse impossible:
    matching question text is insufficient without the same authenticated
    ``user_id``.
    """
    return (
        select(AssistantChatExchange)
        .where(
            AssistantChatExchange.user_id == user_id,
            AssistantChatExchange.question_hash == question_hash(message),
            AssistantChatExchange.cache_version == cache_version,
            AssistantChatExchange.expires_at > now,
        )
        .order_by(desc(AssistantChatExchange.created_at))
        .limit(1)
    )


def prune_expired_exchanges(db: Session, *, user_id: uuid.UUID, now: datetime) -> None:
    """Enforce retention whenever this user's history is read or written."""
    db.execute(
        delete(AssistantChatExchange).where(
            AssistantChatExchange.user_id == user_id,
            AssistantChatExchange.expires_at <= now,
        )
    )


def find_cached_exchange(
    db: Session,
    *,
    user_id: uuid.UUID,
    message: str,
    settings: Settings,
    now: datetime | None = None,
) -> AssistantChatExchange | None:
    current_time = now or _utcnow()
    return db.scalar(
        cached_exchange_statement(
            user_id=user_id,
            message=message,
            cache_version=settings.assistant_chat_cache_version,
            now=current_time,
        )
    )


def mark_exchange_reused(exchange: AssistantChatExchange, *, now: datetime) -> None:
    exchange.reuse_count += 1
    exchange.last_reused_at = now


def recent_context(
    db: Session,
    *,
    user_id: uuid.UUID,
    exchanges: int,
    now: datetime,
) -> list[AssistantChatTurn]:
    """Return only this user's recent in-scope turns for the Chat Agent."""
    if exchanges <= 0:
        return []
    records = list(
        db.scalars(
            select(AssistantChatExchange)
            .where(
                AssistantChatExchange.user_id == user_id,
                AssistantChatExchange.out_of_scope.is_(False),
                AssistantChatExchange.expires_at > now,
            )
            .order_by(desc(AssistantChatExchange.created_at))
            .limit(exchanges)
        )
    )
    records.reverse()
    turns: list[AssistantChatTurn] = []
    for record in records:
        turns.extend(
            (
                AssistantChatTurn(role="user", content=record.question[:800]),
                AssistantChatTurn(role="assistant", content=record.answer[:1200]),
            )
        )
    return turns


def save_exchange(
    db: Session,
    *,
    user_id: uuid.UUID,
    message: str,
    answer: str,
    out_of_scope: bool,
    response_source: str,
    settings: Settings,
    now: datetime | None = None,
) -> AssistantChatExchange:
    current_time = now or _utcnow()
    exchange = AssistantChatExchange(
        user_id=user_id,
        question=message.strip(),
        question_hash=question_hash(message),
        answer=answer,
        out_of_scope=out_of_scope,
        response_source=response_source,
        cache_version=settings.assistant_chat_cache_version,
        expires_at=current_time + timedelta(days=settings.assistant_chat_retention_days),
    )
    db.add(exchange)
    return exchange


def list_history(
    db: Session,
    *,
    user_id: uuid.UUID,
    limit: int,
) -> list[AssistantChatHistoryItem]:
    records = list(
        db.scalars(
            select(AssistantChatExchange)
            .where(AssistantChatExchange.user_id == user_id)
            .order_by(desc(AssistantChatExchange.created_at))
            .limit(limit)
        )
    )
    records.reverse()
    return [
        AssistantChatHistoryItem(
            id=str(record.id),
            question=record.question,
            answer=record.answer,
            created_at=record.created_at,
        )
        for record in records
    ]


def clear_history(db: Session, *, user_id: uuid.UUID) -> None:
    db.execute(delete(AssistantChatExchange).where(AssistantChatExchange.user_id == user_id))
