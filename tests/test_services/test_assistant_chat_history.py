from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import Column, MetaData, Table, create_engine
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session, sessionmaker

from src.app.models.assistant_chat_exchange import AssistantChatExchange
from src.app.services.assistant_chat_history import (
    find_cached_exchange,
    list_history,
    mark_exchange_reused,
    normalize_question,
    recent_context,
    save_exchange,
)


def _session() -> Session:
    """Create only the two tables needed for this repository-level test."""
    metadata = MetaData()
    Table("users", metadata, Column("id", UUID(as_uuid=True), primary_key=True))
    AssistantChatExchange.__table__.to_metadata(metadata)
    engine = create_engine("sqlite://")
    metadata.create_all(engine)

    # The production Session installs PostgreSQL's search_path on the base
    # Session class.  A dedicated subclass keeps this SQLite unit test local.
    class IsolatedSession(Session):
        pass

    return sessionmaker(bind=engine, class_=IsolatedSession)()


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        assistant_chat_cache_version="v1",
        assistant_chat_retention_days=90,
    )


def test_repeat_cache_and_history_are_strictly_isolated_by_user_id() -> None:
    db = _session()
    user_one = uuid4()
    user_two = uuid4()
    user_three = uuid4()
    now = datetime(2026, 8, 22, tzinfo=UTC)
    settings = _settings()

    save_exchange(
        db,
        user_id=user_one,
        message="Tôi không hiểu cách chuyển tiền",
        answer="Câu trả lời riêng của người dùng một.",
        out_of_scope=False,
        response_source="model",
        settings=settings,
        now=now,
    )
    save_exchange(
        db,
        user_id=user_two,
        message="Tôi không hiểu cách chuyển tiền",
        answer="Câu trả lời riêng của người dùng hai.",
        out_of_scope=False,
        response_source="model",
        settings=settings,
        now=now,
    )
    db.commit()

    cached_one = find_cached_exchange(
        db,
        user_id=user_one,
        message="  tôi không hiểu  cách chuyển tiền ",
        settings=settings,
        now=now,
    )
    cached_two = find_cached_exchange(
        db,
        user_id=user_two,
        message="Tôi không hiểu cách chuyển tiền",
        settings=settings,
        now=now,
    )
    cached_three = find_cached_exchange(
        db,
        user_id=user_three,
        message="Tôi không hiểu cách chuyển tiền",
        settings=settings,
        now=now,
    )

    assert cached_one is not None
    assert cached_one.answer == "Câu trả lời riêng của người dùng một."
    assert cached_two is not None
    assert cached_two.answer == "Câu trả lời riêng của người dùng hai."
    assert cached_three is None

    mark_exchange_reused(cached_one, now=now)
    db.commit()
    assert cached_one.reuse_count == 1

    context = recent_context(db, user_id=user_one, exchanges=3, now=now)
    history = list_history(db, user_id=user_one, limit=40)
    assert [turn.content for turn in context] == [
        "Tôi không hiểu cách chuyển tiền",
        "Câu trả lời riêng của người dùng một.",
    ]
    assert [item.answer for item in history] == ["Câu trả lời riêng của người dùng một."]


def test_question_normalization_only_collapses_equivalent_text() -> None:
    assert normalize_question("  Tôi  chuyển  tiền ") == normalize_question("tôi chuyển tiền")
    assert normalize_question("Tôi chuyển tiền") != normalize_question("Tôi quét QR")
