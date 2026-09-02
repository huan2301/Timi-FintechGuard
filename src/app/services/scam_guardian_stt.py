"""Server-side speech-to-text adapter for Scam Guardian audio chunks."""

from __future__ import annotations

import logging
import re
import unicodedata
from functools import lru_cache
from io import BytesIO

from openai import OpenAI

from src.app.config import get_settings
from src.app.services.agent_provider_config import guardian_stt_provider_config, is_rate_limit_error

logger = logging.getLogger(__name__)


def _file_name(mime_type: str) -> str:
    normalized = mime_type.lower()
    if "wav" in normalized:
        return "guardian-chunk.wav"
    if "ogg" in normalized:
        return "guardian-chunk.ogg"
    if "mp4" in normalized or "m4a" in normalized:
        return "guardian-chunk.m4a"
    return "guardian-chunk.webm"


def _field(value: object, name: str, default: object = None) -> object:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _looks_like_silence_hallucination(result: object) -> bool:
    """Reject common Whisper filler/advertisement hallucinations on silence.

    Groq's verbose JSON exposes per-segment confidence metadata. Providers or
    test doubles that do not return segments are left untouched so this guard
    remains compatible with the OpenAI-compatible API.
    """
    segments = _field(result, "segments")
    if not segments:
        return False
    try:
        items = list(segments)
    except TypeError:
        return False
    if not items:
        return False

    no_speech = []
    compression = []
    avg_logprob = []
    for item in items:
        for target, name in (
            (no_speech, "no_speech_prob"),
            (compression, "compression_ratio"),
            (avg_logprob, "avg_logprob"),
        ):
            value = _field(item, name)
            if isinstance(value, int | float):
                target.append(float(value))

    # A segment marked as almost certainly non-speech should never become a
    # risk-engine transcript. Compression/log-probability checks catch the
    # repeated "thanks for watching" style output Whisper can invent on noise.
    if no_speech and sum(value >= 0.85 for value in no_speech) / len(no_speech) >= 0.75:
        return True
    if compression and sum(value >= 2.4 for value in compression) / len(compression) >= 0.75:
        return True
    if avg_logprob and sum(value <= -1.2 for value in avg_logprob) / len(avg_logprob) >= 0.75:
        return True
    return False


def _normalise_transcript(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    without_accents = (
        "".join(character for character in decomposed if not unicodedata.combining(character))
        .replace("đ", "d")
        .replace("Đ", "d")
    )
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", without_accents)).strip()


def is_probable_ad_hallucination(text: str) -> bool:
    """Filter recurring YouTube outro/call-to-action hallucinations.

    These phrases are not risk evidence and are frequently emitted by Whisper
    for silence/noise. Matching is accent-insensitive so Vietnamese variants
    are covered without affecting normal scam keywords.
    """
    normalized = _normalise_transcript(text)
    if not normalized:
        return False
    direct_markers = (
        "subscribe",
        "youtube",
        "like va share",
        "like va chia se",
        "share video",
        "dang ky kenh",
        "ung ho kenh",
        "cam on cac ban da theo doi",
        "hen gap lai",
        "khong bo lo nhung video",
        "video hap dan",
        "chao mung quy vi den voi kenh",
    )
    if any(marker in normalized for marker in direct_markers):
        return True
    # Cover punctuation/word-order variants such as "like, share video".
    return "like" in normalized and "share" in normalized and ("video" in normalized or "kenh" in normalized)


@lru_cache(maxsize=8)
def _client(api_key: str, base_url: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=base_url, max_retries=0, timeout=20.0)


def transcribe_guardian_audio(audio_bytes: bytes, mime_type: str) -> str:
    """Transcribe one self-contained short audio segment and return plain text.

    The bytes exist only for the duration of this call. The provider receives a
    file-like object; no audio is written to disk or stored in the database.
    """
    settings = get_settings()
    provider = guardian_stt_provider_config(settings)
    if not settings.guardian_stt_enabled or not provider.api_key:
        return ""
    if len(audio_bytes) < 1_000:
        return ""

    result = None
    for index, api_key in enumerate(provider.api_keys):
        # Re-create the stream for every retry: providers may have consumed it
        # before reporting an HTTP 429. Audio remains in memory only.
        audio_file = BytesIO(audio_bytes)
        audio_file.name = _file_name(mime_type)
        try:
            result = _client(api_key, provider.base_url).audio.transcriptions.create(
                file=audio_file,
                model=provider.model,
                language="vi",
                response_format="verbose_json",
                temperature=0,
            )
            break
        except Exception as exc:
            if not is_rate_limit_error(exc) or index == len(provider.api_keys) - 1:
                raise
            logger.warning("Guardian STT is rate limited; trying a configured backup key")

    if result is None:  # Defensive: a non-empty key pool always returns or raises above.
        raise RuntimeError("Guardian STT did not return a transcription")
    if _looks_like_silence_hallucination(result):
        return ""
    text = (getattr(result, "text", "") or "").strip()
    if is_probable_ad_hallucination(text):
        return ""
    return text
