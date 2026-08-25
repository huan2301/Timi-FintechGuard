"""Small, public-only RAG index for Timi's Chat Support Agent.

The source of truth is the admin-managed ``content_items`` table. This module
never reads users, transactions, balances, chat history, or admin records. It
stores searchable chunks in pgvector and has a lexical fallback so a missing
embedding provider cannot break normal chat.
"""

from __future__ import annotations

import hashlib
import html
import logging
import math
import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from openai import OpenAI
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.models.content_chunk import ContentChunk
from src.app.models.content_item import ContentItem

logger = logging.getLogger(__name__)

PUBLIC_PAGE_KEYS = frozenset({"home", "privacy", "mission", "terms", "services", "help"})
PAGE_ROUTES = {
    "home": "/",
    "privacy": "/privacy",
    "mission": "/mission",
    "terms": "/terms",
    "services": "/dashboard",
    "help": "/help",
}
_TAG_PATTERN = re.compile(r"<[^>]+>")
_WORD_PATTERN = re.compile(r"\w+", re.UNICODE)


@dataclass(frozen=True, slots=True)
class RetrievedContent:
    """A public evidence chunk passed to Chat Support, never an action."""

    text: str
    title: str
    page_key: str
    source_url: str
    score: float

    def as_prompt_line(self) -> str:
        return f"[{self.title} · {self.source_url}]\n{self.text}"


def clean_content(value: str | None) -> str:
    """Remove markup and normalize whitespace before chunking."""

    if not value:
        return ""
    return re.sub(r"\s+", " ", html.unescape(_TAG_PATTERN.sub(" ", value))).strip()


def chunk_text(text: str, *, max_chars: int = 900, overlap: int = 120) -> list[str]:
    """Split copy at whitespace boundaries while retaining small overlap."""

    cleaned = clean_content(text)
    if not cleaned:
        return []
    if max_chars <= 0 or overlap < 0 or overlap >= max_chars:
        raise ValueError("chunk overlap must be smaller than chunk size")

    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        hard_end = min(start + max_chars, len(cleaned))
        end = hard_end
        if hard_end < len(cleaned):
            boundary = max(cleaned.rfind(".", start, hard_end), cleaned.rfind(" ", start, hard_end))
            if boundary > start + max_chars // 2:
                end = boundary
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cleaned):
            break
        next_start = max(end - overlap, start + 1)
        while next_start < len(cleaned) and cleaned[next_start].isspace():
            next_start += 1
        start = next_start
    return chunks


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    return "".join(character for character in decomposed if not unicodedata.combining(character)).replace("đ", "d")


def _tokens(value: str) -> set[str]:
    return set(_WORD_PATTERN.findall(_normalize(value)))


def _lexical_score(query: str, document: str) -> float:
    query_tokens = _tokens(query)
    if not query_tokens:
        return 0.0
    return len(query_tokens & _tokens(document)) / len(query_tokens)


def _cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or not left or not right:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


def _embedding_client() -> OpenAI | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None
    return OpenAI(api_key=settings.openai_api_key)


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Create OpenAI embeddings in one request; keys never leave the server."""

    if not texts:
        return []
    client = _embedding_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is required to build the public RAG index")
    response = client.embeddings.create(model=get_settings().embedding_model, input=list(texts))
    ordered = sorted(response.data, key=lambda item: item.index)
    return [list(item.embedding) for item in ordered]


def _item_chunks(item: ContentItem) -> list[str]:
    settings = get_settings()
    source = " ".join(part for part in (item.title or "", item.body or "") if part)
    return chunk_text(source, max_chars=settings.rag_chunk_size, overlap=settings.rag_chunk_overlap)


def reindex_public_content(db: Session, *, page_keys: Iterable[str] | None = None) -> int:
    """Rebuild published public chunks and return the number of chunks created."""

    settings = get_settings()
    selected = PUBLIC_PAGE_KEYS if page_keys is None else PUBLIC_PAGE_KEYS.intersection(page_keys)
    items = list(
        db.scalars(
            select(ContentItem)
            .where(ContentItem.is_published.is_(True), ContentItem.page_key.in_(selected))
            .order_by(ContentItem.page_key, ContentItem.sort_order, ContentItem.created_at)
        ).all()
    )
    if not items:
        return 0

    item_ids = [item.id for item in items]
    db.execute(delete(ContentChunk).where(ContentChunk.content_item_id.in_(item_ids)))
    pending: list[tuple[ContentItem, int, str]] = []
    for item in items:
        for index, text in enumerate(_item_chunks(item)):
            pending.append((item, index, text))
    # Embeddings improve ranking but are optional. A missing, expired, or
    # invalid OpenAI key must not prevent the public policy index from being
    # built: chunks without vectors are still searchable lexically.
    embeddings: list[list[float] | None]
    try:
        embeddings = embed_texts([text for _item, _index, text in pending])
        if len(embeddings) != len(pending):
            raise RuntimeError("Embedding provider returned an incomplete batch")
    except Exception as exc:
        logger.warning(
            "Public RAG embeddings unavailable; indexing lexical-only chunks: %s",
            type(exc).__name__,
        )
        embeddings = [None] * len(pending)

    for (item, index, text), embedding in zip(pending, embeddings):
        db.add(
            ContentChunk(
                content_item_id=item.id,
                page_key=item.page_key,
                title=item.title or item.page_key,
                chunk_index=index,
                text=text,
                source_url=PAGE_ROUTES.get(item.page_key, "/"),
                content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                embedding_model=settings.embedding_model if embedding is not None else None,
                embedding=embedding,
                is_published=True,
            )
        )
    db.commit()
    return len(pending)


def _fallback_items(db: Session, query: str, page_keys: set[str], top_k: int) -> list[RetrievedContent]:
    items = db.scalars(
        select(ContentItem).where(
            ContentItem.is_published.is_(True),
            ContentItem.page_key.in_(page_keys),
        )
    ).all()
    scored: list[RetrievedContent] = []
    for item in items:
        for text in _item_chunks(item):
            score = _lexical_score(query, text)
            if score > 0:
                scored.append(
                    RetrievedContent(
                        text=text,
                        title=item.title or item.page_key,
                        page_key=item.page_key,
                        source_url=PAGE_ROUTES.get(item.page_key, "/"),
                        score=score,
                    )
                )
    return sorted(scored, key=lambda item: item.score, reverse=True)[:top_k]


def retrieve_public_context(
    db: Session,
    query: str,
    *,
    page_keys: Iterable[str] | None = None,
    top_k: int | None = None,
) -> list[RetrievedContent]:
    """Retrieve only published public evidence; provider failures fail open."""

    settings = get_settings()
    if not settings.rag_enabled or not query.strip():
        return []
    selected = PUBLIC_PAGE_KEYS if page_keys is None else PUBLIC_PAGE_KEYS.intersection(page_keys)
    limit = top_k or settings.rag_top_k
    chunks = list(
        db.scalars(
            select(ContentChunk).where(
                ContentChunk.is_published.is_(True),
                ContentChunk.page_key.in_(selected),
            )
        ).all()
    )
    if not chunks:
        return _fallback_items(db, query, selected, limit)

    query_embedding: list[float] | None = None
    # Avoid calling an invalid embedding provider for an index that is known
    # to contain lexical-only chunks. This keeps normal chat fast and quiet.
    if any(chunk.embedding is not None for chunk in chunks):
        try:
            if _embedding_client() is not None:
                query_embedding = embed_texts([query])[0]
        except Exception as exc:  # Retrieval must not take Chat Support down.
            logger.warning("Public RAG embedding unavailable; using lexical fallback: %s", type(exc).__name__)

    results: list[RetrievedContent] = []
    for chunk in chunks:
        lexical = _lexical_score(query, chunk.title + " " + chunk.text)
        semantic = _cosine_similarity(query_embedding, chunk.embedding) if query_embedding and chunk.embedding else 0.0
        score = semantic if query_embedding else lexical
        if query_embedding and lexical:
            score = (semantic * 0.85) + (lexical * 0.15)
        if score >= settings.rag_min_similarity:
            results.append(
                RetrievedContent(
                    text=chunk.text,
                    title=chunk.title,
                    page_key=chunk.page_key,
                    source_url=chunk.source_url,
                    score=score,
                )
            )
    return sorted(results, key=lambda item: item.score, reverse=True)[:limit]


def format_context(chunks: Sequence[RetrievedContent]) -> str:
    """Format bounded evidence for the Chat Support system prompt."""

    return "\n\n".join(chunk.as_prompt_line() for chunk in chunks[:8])
