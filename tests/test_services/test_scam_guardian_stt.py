from types import SimpleNamespace

from src.app.config import get_settings
from src.app.services import scam_guardian_stt


def test_short_audio_is_ignored_without_provider_call():
    assert scam_guardian_stt.transcribe_guardian_audio(b"short", "audio/webm") == ""


def test_transcribe_uses_groq_whisper_without_persisting_audio(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_stt_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    captured: dict[str, object] = {}

    class Transcriptions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text="Tôi là cán bộ công an")

    monkeypatch.setattr(
        scam_guardian_stt,
        "_client",
        lambda *_args: SimpleNamespace(audio=SimpleNamespace(transcriptions=Transcriptions())),
    )

    result = scam_guardian_stt.transcribe_guardian_audio(b"x" * 1_000, "audio/webm;codecs=opus")

    assert result == "Tôi là cán bộ công an"
    assert captured["model"] == settings.guardian_stt_model
    assert captured["language"] == "vi"
    assert captured["response_format"] == "verbose_json"
    uploaded = captured["file"]
    assert getattr(uploaded, "name") == "guardian-chunk.webm"
    assert uploaded.read() == b"x" * 1_000


def test_silence_hallucination_is_filtered(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_stt_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    class Transcriptions:
        def create(self, **kwargs):
            return SimpleNamespace(
                text="Thanks for watching and subscribe",
                segments=[
                    SimpleNamespace(
                        no_speech_prob=0.97,
                        compression_ratio=1.1,
                        avg_logprob=-0.2,
                    )
                ],
            )

    monkeypatch.setattr(
        scam_guardian_stt,
        "_client",
        lambda *_args: SimpleNamespace(audio=SimpleNamespace(transcriptions=Transcriptions())),
    )

    assert scam_guardian_stt.transcribe_guardian_audio(b"x" * 1_000, "audio/webm") == ""


def test_youtube_outro_hallucination_is_filtered_without_metadata(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_stt_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    class Transcriptions:
        def create(self, **kwargs):
            return SimpleNamespace(
                text="Cảm ơn các bạn đã theo dõi và hẹn gặp lại.",
            )

    monkeypatch.setattr(
        scam_guardian_stt,
        "_client",
        lambda *_args: SimpleNamespace(audio=SimpleNamespace(transcriptions=Transcriptions())),
    )

    assert scam_guardian_stt.transcribe_guardian_audio(b"x" * 1_000, "audio/webm") == ""


def test_ad_hallucination_detector_is_accent_insensitive():
    assert scam_guardian_stt.is_probable_ad_hallucination(
        "Hãy subscribe cho kênh Ghiền Mì Gõ để không bỏ lỡ video hấp dẫn"
    )
    assert not scam_guardian_stt.is_probable_ad_hallucination(
        "Tôi là cán bộ công an, hãy đọc mã OTP để xác minh tài khoản"
    )


def test_social_media_call_to_action_is_filtered():
    assert scam_guardian_stt.is_probable_ad_hallucination(
        "Các bạn có thể nhớ like và share video này để ủng hộ kênh của mình nhé"
    )


def test_transcription_uses_backup_key_after_rate_limit(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_stt_enabled", True)
    monkeypatch.setattr(settings, "guardian_stt_api_key", "primary-key")
    monkeypatch.setattr(settings, "guardian_stt_api_keys", "backup-key")

    calls: list[str] = []

    class RateLimitError(RuntimeError):
        status_code = 429

    class Transcriptions:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key

        def create(self, **_kwargs):
            calls.append(self.api_key)
            if self.api_key == "primary-key":
                raise RateLimitError("rate limit")
            return SimpleNamespace(text="Nội dung cuộc gọi")

    def fake_client(api_key: str, _base_url: str):
        return SimpleNamespace(audio=SimpleNamespace(transcriptions=Transcriptions(api_key)))

    monkeypatch.setattr(scam_guardian_stt, "_client", fake_client)

    assert scam_guardian_stt.transcribe_guardian_audio(b"x" * 1_000, "audio/webm") == "Nội dung cuộc gọi"
    assert calls == ["primary-key", "backup-key"]
