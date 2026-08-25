"""Phase 1 additions for GuardianAgentDecision.

Merge into src/app/schemas/guardian.py:

  class GuardianAgentDecision(BaseModel):
      risk_score: int = Field(ge=0, le=100)
      risk_level: Literal["safe", "warning", "high", "critical"]
      scenario: str | None = Field(default=None, max_length=80)
      recommended_action: Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"]
      decision_confidence: float = Field(default=0.7, ge=0, le=1)  # NEW
      explanation: str = Field(min_length=1, max_length=1000)
      signals: list[GuardianAgentSignalDecision] = Field(
          default_factory=list, max_length=20
      )
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class GuardianAgentSignalDecision(BaseModel):
    signal_type: str = Field(min_length=1, max_length=60)
    weight: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    evidence: str = Field(default="", max_length=500)


class GuardianAgentDecision(BaseModel):
    risk_score: int = Field(ge=0, le=100)
    risk_level: Literal["safe", "warning", "high", "critical"]
    scenario: str | None = Field(default=None, max_length=80)
    recommended_action: Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"]
    decision_confidence: float = Field(default=0.7, ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=1000)
    signals: list[GuardianAgentSignalDecision] = Field(
        default_factory=list, max_length=20
    )
