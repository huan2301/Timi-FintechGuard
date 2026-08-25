"""Shared contracts for Timi's specialist-agent runtime."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


class AgentId(StrEnum):
    """Stable identifiers used by APIs, telemetry, and the supervisor."""

    CHAT_SUPPORT = "chat_support"
    CALL_GUARDIAN = "call_guardian"
    TASK_NAVIGATOR = "task_navigator"


class AgentCapability(StrEnum):
    PRODUCT_CHAT = "product_chat"
    CALL_TRANSCRIPTION = "call_transcription"
    SCAM_RISK_DECISION = "scam_risk_decision"
    TRANSFER_DRAFTING = "transfer_drafting"
    GUARDIAN_PREFERENCE = "guardian_preference"
    CONTEXTUAL_NAVIGATION = "contextual_navigation"


@dataclass(frozen=True, slots=True)
class AgentDescriptor:
    agent_id: AgentId
    name: str
    description: str
    capabilities: tuple[AgentCapability, ...]
    api_path: str


@dataclass(frozen=True, slots=True)
class AgentCall:
    """One explicit supervisor instruction for a specialist."""

    agent_id: AgentId
    payload: object


@dataclass(frozen=True, slots=True)
class AgentExecution:
    agent_id: AgentId
    result: object


class SpecialistAgent(Protocol):
    descriptor: AgentDescriptor

    def execute(self, payload: object) -> object:
        """Execute one bounded domain task without seeing other agents' context."""
