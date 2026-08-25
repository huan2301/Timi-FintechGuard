"""Deterministic-first LangGraph orchestration for transaction assessment.

The graph deliberately keeps scoring outside the LLM.  LLM output, when enabled,
is only a constrained rewrite of evidence produced by the rule/vector layer.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.schemas.risk import AssessRequest
from src.app.services import risk_rules
from src.app.services.transaction_telemetry import RiskTelemetry


class AssessmentState(TypedDict, total=False):
    db: Session
    user_id: Any
    request: AssessRequest
    telemetry: RiskTelemetry | None
    signals: list[risk_rules.RiskSignalCandidate]
    risk_score: float
    risk_level: str
    explanation: str
    prompt_injection_detected: bool
    llm_used: bool


def _guard_input(state: AssessmentState) -> dict[str, Any]:
    note = (state["request"].note or "").lower()
    markers = (
        "ignore previous", "system prompt", "developer message", "jailbreak",
        "bỏ qua hướng dẫn", "bỏ qua quy tắc", "api key", "mật khẩu",
    )
    return {"prompt_injection_detected": any(marker in note for marker in markers)}


def _collect_evidence(state: AssessmentState) -> dict[str, Any]:
    return {
        "signals": risk_rules.collect_signals(
            state["db"],
            state["user_id"],
            state["request"],
            state.get("telemetry"),
        )
    }


def _score(state: AssessmentState) -> dict[str, Any]:
    score, level = risk_rules.score_from_signals(state["signals"])
    return {"risk_score": score, "risk_level": level}


def _explain(state: AssessmentState) -> dict[str, Any]:
    # A suspicious note is treated as untrusted data, never as instructions.
    # The deterministic explanation is always available and is the safety fallback.
    explanation = risk_rules.build_explanation(state["risk_level"], state["signals"])
    settings = get_settings()
    if not settings.openai_api_key or not settings.llm_explanation_enabled:
        return {"explanation": explanation, "llm_used": False}

    try:
        from langchain_openai import ChatOpenAI

        evidence = "\n".join(signal.explanation for signal in state["signals"] if signal.score > 0)
        prompt = (
            "Explain this transaction warning in Vietnamese using ONLY the evidence below. "
            "Do not calculate or change risk score, do not invent facts, and do not reveal secrets. "
            "If evidence is insufficient, say so.\nEvidence:\n" + evidence[:4000]
        )
        output = ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.model_name,
            temperature=0,
            max_tokens=300,
        ).invoke(prompt).content
        text = output if isinstance(output, str) else str(output)
        lowered = text.lower()
        forbidden = ("api_key", "authorization", "password", "secret", "sk-")
        if text and len(text) <= 2000 and not any(token in lowered for token in forbidden):
            return {"explanation": text, "llm_used": True}
    except Exception:
        # Risk assessment must remain available when an LLM/provider is unavailable.
        pass
    return {"explanation": explanation, "llm_used": False}


def build_transaction_graph():
    graph = StateGraph(AssessmentState)
    graph.add_node("guard_input", _guard_input)
    graph.add_node("collect_evidence", _collect_evidence)
    graph.add_node("score", _score)
    graph.add_node("explain", _explain)
    graph.add_edge(START, "guard_input")
    graph.add_edge("guard_input", "collect_evidence")
    graph.add_edge("collect_evidence", "score")
    graph.add_edge("score", "explain")
    graph.add_edge("explain", END)
    return graph.compile()


transaction_graph = build_transaction_graph()
