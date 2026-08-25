"""Adapters that give existing domain services a uniform agent contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.app.agents.contracts import (
    AgentCapability,
    AgentDescriptor,
    AgentId,
)
from src.app.agents.task_navigation import navigation_action_for_route, route_task
from src.app.services.contextual_navigation_agent import understand_navigation_request
from src.app.services.scam_guardian_agent import analyze_with_guardian_agent
from src.app.services.scam_guardian_stt import transcribe_guardian_audio
from src.app.services.timi_assistant import answer_timi_question

if TYPE_CHECKING:
    from src.app.schemas.assistant import AssistantChatTurn, AssistantTaskState, AssistantUiAction
    from src.app.services.scam_guardian import GuardianConversationState


@dataclass(frozen=True, slots=True)
class ChatSupportTask:
    message: str
    history: list[AssistantChatTurn]
    knowledge_context: str = ""


@dataclass(frozen=True, slots=True)
class ChatSupportResult:
    answer: str
    out_of_scope: bool


@dataclass(frozen=True, slots=True)
class TaskNavigationTask:
    message: str
    task_state: AssistantTaskState


@dataclass(frozen=True, slots=True)
class TaskNavigationResult:
    handled: bool
    answer: str | None
    task_state: AssistantTaskState
    action: AssistantUiAction | None
    history_message: str | None


@dataclass(frozen=True, slots=True)
class GuardianRiskTask:
    state: GuardianConversationState
    latest_text: str


@dataclass(frozen=True, slots=True)
class GuardianAudioTask:
    audio_bytes: bytes
    mime_type: str


@dataclass(frozen=True, slots=True)
class GuardianTranscriptionResult:
    text: str


class ChatSupportAgent:
    descriptor = AgentDescriptor(
        agent_id=AgentId.CHAT_SUPPORT,
        name="Timi Chat Support Agent",
        description="Trả lời hướng dẫn sản phẩm trong phạm vi Timi.",
        capabilities=(AgentCapability.PRODUCT_CHAT,),
        api_path="/api/v1/assistant/chat",
    )

    def execute(self, payload: object) -> ChatSupportResult:
        if not isinstance(payload, ChatSupportTask):
            raise TypeError("Chat Support Agent nhận sai loại tác vụ")
        answer, out_of_scope = answer_timi_question(
            payload.message,
            payload.history,
            knowledge_context=payload.knowledge_context,
        )
        return ChatSupportResult(answer=answer, out_of_scope=out_of_scope)


class TaskNavigationAgent:
    """Collect only transfer-draft data or apply an explicit Guardian preference."""

    descriptor = AgentDescriptor(
        agent_id=AgentId.TASK_NAVIGATOR,
        name="Timi Task Navigation Agent",
        description="Thu thập bản nháp chuyển tiền và điều hướng thao tác đã được người dùng yêu cầu.",
        capabilities=(
            AgentCapability.TRANSFER_DRAFTING,
            AgentCapability.GUARDIAN_PREFERENCE,
            AgentCapability.CONTEXTUAL_NAVIGATION,
        ),
        api_path="/api/v1/assistant/chat",
    )

    def execute(self, payload: object) -> TaskNavigationResult:
        if not isinstance(payload, TaskNavigationTask):
            raise TypeError("Task Navigation Agent nhận sai loại tác vụ")
        decision = route_task(payload.message, payload.task_state)
        # Rules serve the known high-confidence commands for zero latency. If
        # wording is unfamiliar, the Groq classifier may return one route from
        # its strict allowlist. The backend owns both the displayed text and
        # the browser action, so the model never emits a free-form command.
        if not decision.handled and decision.allow_contextual_navigation:
            contextual = understand_navigation_request(payload.message)
            if contextual and contextual.route:
                decision = (
                    navigation_action_for_route(
                        contextual.route,
                        payload.task_state,
                        history_message=payload.message,
                    )
                    or decision
                )
        return TaskNavigationResult(
            handled=decision.handled,
            answer=decision.answer,
            task_state=decision.task_state,
            action=decision.action,
            history_message=decision.history_message,
        )


class CallGuardianAgent:
    descriptor = AgentDescriptor(
        agent_id=AgentId.CALL_GUARDIAN,
        name="Scam Call Guardian Agent",
        description="Chuyển giọng nói thành văn bản và đánh giá dấu hiệu lừa đảo cuộc gọi.",
        capabilities=(
            AgentCapability.CALL_TRANSCRIPTION,
            AgentCapability.SCAM_RISK_DECISION,
        ),
        api_path="/api/v1/scam-guardian/ws/{session_id}",
    )

    def execute(self, payload: object) -> object:
        if isinstance(payload, GuardianRiskTask):
            return analyze_with_guardian_agent(payload.state, payload.latest_text)
        if isinstance(payload, GuardianAudioTask):
            return GuardianTranscriptionResult(
                text=transcribe_guardian_audio(payload.audio_bytes, payload.mime_type)
            )
        raise TypeError("Call Guardian Agent nhận sai loại tác vụ")
