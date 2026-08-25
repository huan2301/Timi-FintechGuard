import uuid
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from src.app.db.base import Base
from src.app.models.content_chunk import ContentChunk
from src.app.models.content_item import ContentItem
from src.app.services import public_content_rag


def _settings(**overrides: object) -> SimpleNamespace:
    values = {
        "rag_enabled": True,
        "rag_top_k": 4,
        "rag_min_similarity": 0.18,
        "rag_chunk_size": 900,
        "rag_chunk_overlap": 120,
        "openai_api_key": "",
        "embedding_model": "text-embedding-3-small",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _db() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[ContentItem.__table__, ContentChunk.__table__])
    return Session(engine)


def test_chunk_text_cleans_markup_and_keeps_overlap() -> None:
    chunks = public_content_rag.chunk_text(
        "<p>Đoạn đầu tiên.</p> Đoạn thứ hai có nội dung quan trọng.",
        max_chars=28,
        overlap=8,
    )

    assert len(chunks) >= 2
    assert all("<p>" not in chunk for chunk in chunks)
    assert any("quan trọng" in chunk for chunk in chunks)


def test_retrieve_public_context_uses_published_public_content_only(monkeypatch) -> None:
    monkeypatch.setattr(public_content_rag, "get_settings", lambda: _settings())
    db = _db()
    db.add_all(
        [
            ContentItem(
                id=uuid.uuid4(),
                page_key="privacy",
                content_type="article",
                title="Dữ liệu khuôn mặt",
                body="Dữ liệu khuôn mặt chỉ được dùng cho đăng ký và xác thực.",
                placement="top",
                is_published=True,
                sort_order=1,
            ),
            ContentItem(
                id=uuid.uuid4(),
                page_key="internal",
                content_type="article",
                title="Nội dung nội bộ",
                body="Dữ liệu bí mật của hệ thống.",
                placement="top",
                is_published=True,
                sort_order=1,
            ),
        ]
    )
    db.commit()

    results = public_content_rag.retrieve_public_context(db, "Dữ liệu khuôn mặt")

    assert len(results) == 1
    assert results[0].page_key == "privacy"
    assert results[0].source_url == "/privacy"
    assert "bí mật" not in results[0].text


def test_retrieve_public_context_fails_closed_when_disabled(monkeypatch) -> None:
    monkeypatch.setattr(public_content_rag, "get_settings", lambda: _settings(rag_enabled=False))
    db = _db()

    assert public_content_rag.retrieve_public_context(db, "chính sách bảo mật") == []


def test_reindex_falls_back_to_lexical_chunks_when_embeddings_fail(monkeypatch) -> None:
    monkeypatch.setattr(public_content_rag, "get_settings", lambda: _settings())
    monkeypatch.setattr(
        public_content_rag,
        "embed_texts",
        lambda _texts: (_ for _ in ()).throw(RuntimeError("invalid api key")),
    )
    db = _db()
    db.add(
        ContentItem(
            id=uuid.uuid4(),
            page_key="privacy",
            content_type="article",
            title="Chính sách bảo mật",
            body="Timi bảo vệ dữ liệu cá nhân của người dùng.",
            placement="top",
            is_published=True,
            sort_order=1,
        )
    )
    db.commit()

    assert public_content_rag.reindex_public_content(db) == 1
    chunk = db.query(ContentChunk).one()
    assert chunk.embedding is None
    assert chunk.embedding_model is None
    assert "bảo vệ dữ liệu" in public_content_rag.retrieve_public_context(
        db, "dữ liệu cá nhân"
    )[0].text


def test_chat_prompt_receives_public_context_without_changing_action_boundary(monkeypatch) -> None:
    import src.app.services.timi_assistant as timi_assistant

    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Theo Chính sách bảo mật..."))]
            )

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(
        timi_assistant,
        "get_settings",
        lambda: SimpleNamespace(
            chat_agent_api_key="test-key",
            chat_agent_api_keys="",
            chat_agent_base_url="https://example.test/v1",
            chat_agent_model="test-model",
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
            assistant_chat_max_completion_tokens=640,
        ),
    )
    monkeypatch.setattr(timi_assistant, "OpenAI", FakeOpenAI)

    answer, out_of_scope = timi_assistant.answer_timi_question(
        "Dữ liệu khuôn mặt được dùng thế nào?",
        [],
        knowledge_context="[Chính sách bảo mật · /privacy]\nDữ liệu chỉ dùng cho xác thực.",
    )

    assert answer.startswith("Theo Chính sách")
    assert not out_of_scope
    messages = captured["messages"]
    assert isinstance(messages, list)
    assert "CONTEXT NGUỒN" in messages[1]["content"]
    assert "/privacy" in messages[1]["content"]
