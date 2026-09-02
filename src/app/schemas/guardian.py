"""Request/response schemas for Scam Call Guardian sessions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GuardianSessionCreate(BaseModel):
    retain_transcript: bool = False


class GuardianSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    started_at: datetime
    ended_at: datetime | None = None
    max_risk_score: int
    final_risk_score: int | None = None
    risk_level: str
    scam_type: str | None = None
    agent_action: Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"] = "CONTINUE"
    final_recommendation: str | None = None
    retain_transcript: bool


class GuardianFinishRequest(BaseModel):
    status: Literal["completed", "cancelled"] = "completed"


class GuardianTranscriptMessage(BaseModel):
    type: Literal["transcript"] = "transcript"
    status: Literal["partial", "final"] = "final"
    text: str = Field(min_length=1, max_length=2000)
    speaker: Literal["speaker_a", "speaker_b", "unknown"] = "unknown"
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source: Literal["browser", "server", "manual"] = "browser"


class GuardianAudioMessage(BaseModel):
    type: Literal["audio_chunk"] = "audio_chunk"
    data: str = Field(min_length=1, max_length=512_000)
    mime_type: str = Field(default="audio/webm", max_length=100)
    # Browser VAD finishes naturally after a short silence and caps an active
    # speech segment at five seconds.
    duration_ms: int | None = Field(default=None, ge=0, le=5_000)
    speech_detected: bool = True


class GuardianAuthMessage(BaseModel):
    type: Literal["auth"] = "auth"
    token: str = Field(min_length=20, max_length=4096)


class GuardianAgentSignalDecision(BaseModel):
    """One signal proposed by the Guardian decision agent.

    The API deliberately accepts signal names as data rather than mapping a
    score in the backend.  This keeps the agent responsible for deciding
    which evidence matters and how much it contributes to the decision.
    """

    signal_type: str = Field(min_length=1, max_length=60)
    weight: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    evidence: str = Field(default="", max_length=500)


class GuardianAgentDecision(BaseModel):
    """Strict, bounded JSON contract returned by the risk decision agent."""

    risk_score: int = Field(ge=0, le=100)
    risk_level: Literal["safe", "warning", "high", "critical"]
    scenario: str | None = Field(default=None, max_length=80)
    recommended_action: Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"]
    explanation: str = Field(min_length=1, max_length=1000)
    signals: list[GuardianAgentSignalDecision] = Field(default_factory=list, max_length=20)
