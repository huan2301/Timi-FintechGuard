"""REST and WebSocket gateway for the realtime Scam Call Guardian MVP."""

from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import time
import uuid
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from src.app.agents import (
    AgentId,
    GuardianAudioTask,
    GuardianRiskTask,
    GuardianTranscriptionResult,
    get_multi_agent_supervisor,
)
from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.core.security import decode_access_token
from src.app.db.session import SessionLocal, get_db
from src.app.models.scam_guardian import (
    ScamAlert,
    ScamConversationSegment,
    ScamGuardianSession,
    ScamRiskEvent,
    ScamSignal,
)
from src.app.models.user import User
from src.app.schemas.guardian import (
    GuardianAudioMessage,
    GuardianAuthMessage,
    GuardianFinishRequest,
    GuardianSessionCreate,
    GuardianSessionOut,
    GuardianTranscriptMessage,
)
from src.app.services.agent_provider_config import guardian_stt_provider_config
from src.app.services.scam_guardian import (
    GuardianConversationState,
    GuardianRiskResult,
)
from src.app.services.scam_guardian_agent import (
    GuardianAgentUnavailableError,
    degraded_guardian_result,
    fail_closed_guardian_result,
    immediate_direct_evidence_result,
)
from src.app.services.scam_guardian_stt import (
    is_probable_ad_hallucination,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scam-guardian", tags=["scam-guardian"])


def _recommendation_for_action(action: str) -> str:
    """Human-readable copy derived from the agent action, never a score."""

    return {
        "STOP": "Dừng cuộc gọi và không chuyển tiền.",
        "PAUSE": "Tạm dừng và tự xác minh qua kênh chính thức.",
        "MONITOR": "Tiếp tục thận trọng, không cung cấp thông tin bảo mật.",
        "CONTINUE": "Chưa cần chặn; vẫn giữ cảnh giác với yêu cầu bất thường.",
    }.get(action, "Tạm dừng để chờ Guardian Risk Agent đánh giá.")


def _get_owned_session(
    db: Session, session_id: uuid.UUID, user_id: uuid.UUID
) -> ScamGuardianSession:
    session = db.get(ScamGuardianSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên Scam Guardian")
    return session


def _session_out(session: ScamGuardianSession) -> GuardianSessionOut:
    return GuardianSessionOut.model_validate(session)


@router.post(
    "/sessions",
    response_model=GuardianSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_guardian_session(
    payload: GuardianSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GuardianSessionOut:
    active = (
        db.query(ScamGuardianSession)
        .filter(
            ScamGuardianSession.user_id == current_user.id,
            ScamGuardianSession.status == "active",
        )
        .first()
    )
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tài khoản đang có một phiên Scam Guardian hoạt động",
        )

    session = ScamGuardianSession(
        user_id=current_user.id,
        retain_transcript=payload.retain_transcript,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_out(session)


@router.get("/sessions/active", response_model=GuardianSessionOut | None)
def get_active_guardian_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GuardianSessionOut | None:
    """Return the current background session so a refreshed tab can resume it."""
    session = (
        db.query(ScamGuardianSession)
        .filter(
            ScamGuardianSession.user_id == current_user.id,
            ScamGuardianSession.status == "active",
        )
        .order_by(ScamGuardianSession.started_at.desc())
        .first()
    )
    return _session_out(session) if session is not None else None


@router.get("/sessions/{session_id}", response_model=GuardianSessionOut)
def get_guardian_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GuardianSessionOut:
    return _session_out(_get_owned_session(db, session_id, current_user.id))


@router.post("/sessions/{session_id}/finish", response_model=GuardianSessionOut)
def finish_guardian_session(
    session_id: uuid.UUID,
    payload: GuardianFinishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GuardianSessionOut:
    session = _get_owned_session(db, session_id, current_user.id)
    if session.status == "active":
        session.status = payload.status
        session.ended_at = datetime.now(UTC)
        session.final_risk_score = session.max_risk_score
        session.final_recommendation = _recommendation_for_action(session.agent_action)
        db.commit()
        db.refresh(session)
    return _session_out(session)


def _user_id_from_token(token: str) -> uuid.UUID:
    try:
        payload = decode_access_token(token)
        if payload.get("purpose") is not None:
            raise ValueError("purpose-bound token")
        return uuid.UUID(str(payload["sub"]))
    except (JWTError, KeyError, TypeError, ValueError):
        raise ValueError("invalid access token") from None


def _persist_risk_result(
    db: Session,
    session: ScamGuardianSession,
    result: GuardianRiskResult,
    segment_id: uuid.UUID | None,
) -> GuardianRiskResult:
    # A STOP decision is a backend enforcement latch: a later, less severe
    # model response cannot silently re-enable transfers during the same call.
    # This is action execution, not a backend score/threshold calculation.
    if session.agent_action == "STOP" and result.recommended_action != "STOP":
        result = replace(
            result,
            risk_level="critical",
            recommended_action="STOP",
            explanation=(
                f"{result.explanation} Guardian đã giữ lệnh STOP trước đó "
                "cho đến khi phiên gọi kết thúc."
            ),
        )

    session.max_risk_score = max(session.max_risk_score, result.risk_score)
    session.risk_level = result.risk_level
    session.scam_type = result.scenario
    session.agent_action = result.recommended_action
    db.add(
        ScamRiskEvent(
            session_id=session.id,
            segment_id=segment_id,
            risk_score=result.risk_score,
            risk_level=result.risk_level,
            recommended_action=result.recommended_action,
            reason=result.explanation,
            signals=[
                {
                    "signal_type": signal.signal_type,
                    "weight": signal.weight,
                    "confidence": signal.confidence,
                }
                for signal in result.signals
            ],
        )
    )
    for signal in result.signals:
        db.add(
            ScamSignal(
                session_id=session.id,
                segment_id=segment_id,
                signal_type=signal.signal_type,
                confidence=signal.confidence,
                weight=signal.weight,
                # Never persist transcript-derived text without explicit consent.
                evidence=(
                    {"text": signal.evidence}
                    if session.retain_transcript
                    else {"matched": True}
                ),
            )
        )
    db.commit()
    return result


def _risk_payload(result: GuardianRiskResult) -> dict[str, Any]:
    return {
        "type": "risk_update",
        "decision_source": (
            "fail_closed"
            if result.scenario == "agent_unavailable"
            else "guardian_agent"
        ),
        "risk_score": result.risk_score,
        "risk_level": result.risk_level,
        "scenario": result.scenario,
        "recommended_action": result.recommended_action,
        "explanation": result.explanation,
        "signals": [
            {
                "type": signal.signal_type,
                "weight": signal.weight,
                "confidence": signal.confidence,
            }
            for signal in result.signals
        ],
    }


@router.websocket("/ws/{session_id}")
async def guardian_stream(websocket: WebSocket, session_id: uuid.UUID) -> None:
    """Receive audio/transcript events and stream risk updates immediately.

    When a Guardian STT provider key is configured, short self-contained audio
    segments are transcribed server-side. Raw audio remains in memory only and
    is never written to disk or persisted in the database.
    """
    await websocket.accept()
    db = SessionLocal()
    state = GuardianConversationState()
    session: ScamGuardianSession | None = None
    last_action = "CONTINUE"
    agent_failure_streak = 0
    last_agent_analysis_at: float | None = None
    agent_retry_after_until = 0.0
    settings = get_settings()

    try:
        session = db.get(ScamGuardianSession, session_id)
        if session is None or session.status != "active":
            await websocket.close(code=4404, reason="Guardian session is not active")
            return
        last_action = session.agent_action

        try:
            auth_raw = await asyncio.wait_for(websocket.receive_json(), timeout=5)
            auth = GuardianAuthMessage.model_validate(auth_raw)
            user_id = _user_id_from_token(auth.token)
        except (TimeoutError, ValueError, TypeError):
            await websocket.close(code=4401, reason="Authentication required")
            return

        if session.user_id != user_id:
            await websocket.close(code=4403, reason="Session does not belong to user")
            return
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            await websocket.close(code=4401, reason="User is not active")
            return

        stt_provider = guardian_stt_provider_config(settings)
        server_stt_enabled = settings.guardian_stt_enabled and bool(stt_provider.api_key)
        await websocket.send_json(
            {
                "type": "ready",
                "session_id": str(session.id),
                "transcription_mode": (
                    "server_groq_whisper"
                    if server_stt_enabled
                    else "browser_speech_recognition"
                ),
                "audio_persistence": "discarded",
                "risk_decision_mode": "guardian_agent",
                "risk_score": 0,
                "risk_level": "safe",
            }
        )

        async def process_final_transcript(transcript: GuardianTranscriptMessage) -> None:
            nonlocal agent_failure_streak, agent_retry_after_until
            nonlocal last_action, last_agent_analysis_at
            # Browser SpeechRecognition can produce the same stock YouTube
            # outro text as Whisper when the microphone is silent. Discard it
            # before persistence, UI delivery, and risk scoring regardless of
            # which STT path produced the transcript.
            if is_probable_ad_hallucination(transcript.text):
                await websocket.send_json(
                    {
                        "type": "transcript_ignored",
                        "reason": "probable_stt_hallucination",
                    }
                )
                return
            state.append(transcript.speaker, transcript.text)
            segment_id: uuid.UUID | None = None
            if session.retain_transcript:
                segment = ScamConversationSegment(
                    session_id=session.id,
                    speaker=transcript.speaker,
                    text=transcript.text,
                    start_ms=transcript.start_ms,
                    end_ms=transcript.end_ms,
                    confidence=transcript.confidence,
                    source=transcript.source,
                )
                db.add(segment)
                db.flush()
                segment_id = segment.id

            now = time.monotonic()
            # Direct high-risk evidence must not wait for the regular LLM
            # cadence. It also continues to protect calls during a temporary
            # provider outage, without pretending to infer ambiguous context.
            result = immediate_direct_evidence_result(state)
            if result is not None:
                last_agent_analysis_at = now
            elif (
                last_agent_analysis_at is not None
                and now - last_agent_analysis_at < settings.guardian_agent_min_interval_seconds
            ) or now < agent_retry_after_until:
                # Still forward the transcript to the UI, but do not spend a
                # Groq request on every short STT fragment or rate-limit retry.
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "status": "final",
                        "speaker": transcript.speaker,
                        "text": transcript.text,
                    }
                )
                return
            if result is None:
                last_agent_analysis_at = now

                try:
                    # LLM inference is blocking; keep the WebSocket event loop
                    # responsive while the agent evaluates the conversation.
                    result = await asyncio.to_thread(
                        get_multi_agent_supervisor().dispatch,
                        AgentId.CALL_GUARDIAN,
                        GuardianRiskTask(state=state, latest_text=transcript.text),
                    )
                    agent_failure_streak = 0
                    agent_retry_after_until = 0.0
                except GuardianAgentUnavailableError as exc:
                    # Fail closed without pretending that a backend threshold made
                    # the decision. The synthetic action only protects the user
                    # until the agent is available again.
                    logger.warning(
                        "Guardian agent unavailable: %s (provider=%s, retry_after=%ss)",
                        exc,
                        type(exc.__cause__).__name__ if exc.__cause__ else "unknown",
                        exc.retry_after_seconds,
                    )
                    agent_failure_streak += 1
                    if exc.retry_after_seconds:
                        agent_retry_after_until = time.monotonic() + exc.retry_after_seconds
                    # Do not turn a single transient provider failure into a
                    # critical scam alert. Three consecutive failures enter the
                    # explicit fail-closed STOP state; both states still pause
                    #/block transactions through the backend guard below.
                    result = (
                        fail_closed_guardian_result(str(exc))
                        if agent_failure_streak >= 3
                        else degraded_guardian_result(str(exc))
                    )
                    await websocket.send_json(
                        {
                            "type": "agent_status",
                            "status": "blocked" if agent_failure_streak >= 3 else "degraded",
                            "consecutive_failures": agent_failure_streak,
                            "message": str(exc),
                        }
                    )
            result = _persist_risk_result(db, session, result, segment_id)
            await websocket.send_json(
                {
                    "type": "transcript",
                    "status": "final",
                    "speaker": transcript.speaker,
                    "text": transcript.text,
                }
            )
            await websocket.send_json(_risk_payload(result))
            if last_action != "STOP" and result.recommended_action == "STOP":
                alert = ScamAlert(
                    session_id=session.id,
                    severity="critical",
                    title="Nguy cơ lừa đảo rất cao",
                    message="Dừng cuộc gọi. Không chuyển tiền và không cung cấp OTP/PIN.",
                    delivered_at=datetime.now(UTC),
                )
                db.add(alert)
                db.commit()
                await websocket.send_json(
                    {
                        "type": "alert",
                        "severity": "critical",
                        "title": "Nguy cơ lừa đảo rất cao",
                        "message": "Dừng cuộc gọi. Không chuyển tiền và không cung cấp OTP/PIN.",
                    }
                )
            last_action = result.recommended_action

        while True:
            raw: Any = await websocket.receive_json()
            event_type = raw.get("type") if isinstance(raw, dict) else None

            if event_type == "heartbeat":
                await websocket.send_json({"type": "heartbeat_ack"})
                continue

            if event_type == "audio_chunk":
                try:
                    audio = GuardianAudioMessage.model_validate(raw)
                except ValidationError:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "audio_invalid",
                            "message": "Audio chunk không hợp lệ hoặc vượt quá kích thước cho phép.",
                        }
                    )
                    continue
                await websocket.send_json(
                    {
                        "type": "audio_ack",
                        "accepted": audio.speech_detected,
                        "bytes_estimate": (len(audio.data) * 3) // 4,
                    }
                )
                if not audio.speech_detected:
                    continue
                if server_stt_enabled:
                    try:
                        audio_bytes = base64.b64decode(audio.data, validate=True)
                    except (binascii.Error, ValueError):
                        await websocket.send_json(
                            {"type": "error", "message": "Audio chunk không hợp lệ."}
                        )
                        continue
                    try:
                        transcription = await asyncio.to_thread(
                            get_multi_agent_supervisor().dispatch,
                            AgentId.CALL_GUARDIAN,
                            GuardianAudioTask(
                                audio_bytes=audio_bytes,
                                mime_type=audio.mime_type,
                            ),
                        )
                        if not isinstance(transcription, GuardianTranscriptionResult):
                            raise TypeError("Call Guardian Agent trả về transcript không hợp lệ")
                        text = transcription.text
                    except Exception:
                        logger.exception("Guardian server-side STT failed")
                        await websocket.send_json(
                            {
                                "type": "error",
                                "code": "audio_stt_failed",
                                "message": "Không thể chuyển audio thành văn bản; phiên vẫn tiếp tục nhận chunk.",
                            }
                        )
                        text = ""
                    if text:
                        await process_final_transcript(
                            GuardianTranscriptMessage(
                                text=text[:2000],
                                speaker="unknown",
                                confidence=None,
                                source="server",
                            )
                        )
                    else:
                        await websocket.send_json(
                            {
                                "type": "audio_stt_empty",
                                "message": "Server STT chưa tạo được transcript cho audio chunk này.",
                            }
                        )
                continue

            if event_type == "transcript":
                transcript = GuardianTranscriptMessage.model_validate(raw)
                if transcript.status == "partial":
                    await websocket.send_json(
                        {
                            "type": "transcript",
                            "status": "partial",
                            "speaker": transcript.speaker,
                            "text": transcript.text,
                        }
                    )
                    continue

                await process_final_transcript(transcript)
                continue

            if event_type == "stop":
                session.status = "completed"
                session.ended_at = datetime.now(UTC)
                session.final_risk_score = session.max_risk_score
                session.final_recommendation = _recommendation_for_action(
                    session.agent_action
                )
                db.commit()
                await websocket.send_json(
                    {
                        "type": "session_finished",
                        "session_id": str(session.id),
                        "final_risk_score": session.final_risk_score,
                        "risk_level": session.risk_level,
                        "scenario": session.scam_type,
                    }
                )
                break

            await websocket.send_json(
                {"type": "error", "message": "Guardian event không được hỗ trợ"}
            )
    except WebSocketDisconnect:
        if session is not None and session.status == "active":
            session.status = "interrupted"
            session.ended_at = datetime.now(UTC)
            session.final_risk_score = session.max_risk_score
            session.final_recommendation = _recommendation_for_action(session.agent_action)
            db.commit()
    except Exception:
        logger.exception("Scam Guardian WebSocket failed")
        if session is not None and session.status == "active":
            session.status = "interrupted"
            session.ended_at = datetime.now(UTC)
            session.final_risk_score = session.max_risk_score
            session.final_recommendation = _recommendation_for_action(session.agent_action)
            db.commit()
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "message": "Guardian tạm thời không thể phân tích phiên này.",
                }
            )
        except Exception:
            pass
    finally:
        db.close()
