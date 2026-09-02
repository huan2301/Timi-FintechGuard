"""Phase 1 – Hybrid Rule Engine + Guardian Agent.

Rule engine (scam_guardian.analyze_guardian_state) runs in parallel with the
LLM agent. Merge policy:

- If agent unavailable → use rule result (or fail-closed if rules also weak).
- If agent decision_confidence < LOW_CONFIDENCE → floor action to at least PAUSE
  when rules already see risk, else PAUSE when rules score is medium+.
- Final action = max severity(rule_action, agent_action) when they disagree on
  high-risk signals; prefer safer (higher severity) for STOP/PAUSE.
- Never escalate CONTINUE → STOP solely from rules without agent agreement
  unless rule score >= HARD_STOP_SCORE (clear OTP/remote/safe-account patterns).

This module does not call tools or touch the DB.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from src.app.services.scam_guardian import (
    GuardianConversationState,
    GuardianRiskResult,
    GuardianSignal,
    analyze_guardian_state,
)
from src.app.services.scam_guardian_agent import (
    GuardianAgentUnavailableError,
    analyze_with_guardian_agent,
    degraded_guardian_result,
)

logger = logging.getLogger(__name__)

Action = Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"]

ACTION_RANK: dict[str, int] = {
    "CONTINUE": 0,
    "MONITOR": 1,
    "PAUSE": 2,
    "STOP": 3,
}

# Agent confidence below this → do not trust CONTINUE/MONITOR alone
LOW_CONFIDENCE = 0.55
# Rule score that forces at least PAUSE even if agent says CONTINUE
RULE_PAUSE_FLOOR = 50
# Rule score that can force STOP when agent is low-confidence or missing
HARD_STOP_SCORE = 80


@dataclass(frozen=True)
class HybridMeta:
    source: str  # agent | rule | hybrid
    agent_action: str | None
    rule_action: str | None
    agent_confidence: float | None
    rule_score: int
    merge_reason: str


def _max_action(a: str, b: str) -> str:
    return a if ACTION_RANK.get(a, 0) >= ACTION_RANK.get(b, 0) else b


def _min_action(a: str, b: str) -> str:
    return a if ACTION_RANK.get(a, 0) <= ACTION_RANK.get(b, 0) else b


def merge_rule_and_agent(
    rule: GuardianRiskResult,
    agent: GuardianRiskResult | None,
    *,
    agent_confidence: float | None,
    agent_error: str | None = None,
) -> tuple[GuardianRiskResult, HybridMeta]:
    """Merge deterministic rules with agent decision."""
    rule_action = rule.recommended_action
    rule_score = rule.risk_score

    if agent is None:
        # Agent failed: trust rules; if rules weak, degrade to PAUSE (fail-safe)
        if rule_score >= HARD_STOP_SCORE:
            final = rule
            reason = f"agent_unavailable_hard_stop:{agent_error or 'unknown'}"
        elif rule_score >= RULE_PAUSE_FLOOR:
            final = GuardianRiskResult(
                risk_score=max(rule_score, 60),
                risk_level="high" if rule_score < 80 else rule.risk_level,
                scenario=rule.scenario or "agent_unavailable",
                recommended_action="PAUSE",
                explanation=(
                    f"Agent không phản hồi; rule engine phát hiện rủi ro — tạm PAUSE. ({agent_error or 'unavailable'})"
                )[:1000],
                signals=rule.signals,
            )
            reason = "agent_unavailable_rule_pause"
        else:
            final = degraded_guardian_result(agent_error or "agent_unavailable")
            reason = "agent_unavailable_degraded"
        meta = HybridMeta(
            source="rule",
            agent_action=None,
            rule_action=rule_action,
            agent_confidence=None,
            rule_score=rule_score,
            merge_reason=reason,
        )
        return final, meta

    agent_action = agent.recommended_action
    conf = agent_confidence if agent_confidence is not None else 0.7

    # Low confidence agent: do not allow CONTINUE if rules see medium+ risk
    if conf < LOW_CONFIDENCE:
        if rule_score >= HARD_STOP_SCORE:
            final_action = "STOP"
            reason = "low_conf_agent_rule_hard_stop"
        elif rule_score >= RULE_PAUSE_FLOOR or ACTION_RANK[agent_action] >= ACTION_RANK["PAUSE"]:
            final_action = _max_action(agent_action, "PAUSE")
            reason = "low_conf_agent_floor_pause"
        else:
            final_action = _max_action(agent_action, "MONITOR")
            reason = "low_conf_agent_floor_monitor"
    else:
        # High confidence: take max severity (prefer safety on STOP/PAUSE)
        if ACTION_RANK[agent_action] >= ACTION_RANK["PAUSE"] or ACTION_RANK[rule_action] >= ACTION_RANK["PAUSE"]:
            final_action = _max_action(agent_action, rule_action)
            reason = "hybrid_max_severity"
        else:
            # Both low severity: prefer agent (better nuance on safe/monitor)
            final_action = agent_action
            reason = "hybrid_prefer_agent_low_risk"

        # Safety net: clear hard patterns from rules
        if rule_score >= HARD_STOP_SCORE and final_action != "STOP":
            final_action = "STOP"
            reason = "hybrid_rule_hard_stop_override"

    # Build merged signals (agent first, then rule-only types)
    agent_types = {s.signal_type for s in agent.signals}
    merged_signals: list[GuardianSignal] = list(agent.signals)
    for s in rule.signals:
        if s.signal_type not in agent_types:
            merged_signals.append(s)
    merged_signals = merged_signals[:12]

    # Score / level aligned to final action
    score = max(agent.risk_score, rule_score if final_action != agent_action else agent.risk_score)
    if final_action == "STOP":
        level, score = "critical", max(score, 80)
    elif final_action == "PAUSE":
        level, score = "high", max(score, 55)
    elif final_action == "MONITOR":
        level, score = "warning", max(min(score, 50), 25)
    else:
        level, score = "safe", min(score, 25)

    explanation = agent.explanation
    if final_action != agent_action:
        explanation = (f"{agent.explanation} [hybrid: {reason}; rule={rule_action}/{rule_score}]")[:1000]

    final = GuardianRiskResult(
        risk_score=min(100, score),
        risk_level=level,
        scenario=agent.scenario or rule.scenario,
        recommended_action=final_action,
        explanation=explanation,
        signals=tuple(merged_signals),
    )
    meta = HybridMeta(
        source="hybrid",
        agent_action=agent_action,
        rule_action=rule_action,
        agent_confidence=conf,
        rule_score=rule_score,
        merge_reason=reason,
    )
    return final, meta


def analyze_hybrid(
    state: GuardianConversationState,
    latest_text: str,
) -> tuple[GuardianRiskResult, HybridMeta]:
    """Run rule engine + agent, then merge."""
    rule = analyze_guardian_state(state)

    agent: GuardianRiskResult | None = None
    agent_conf: float | None = None
    agent_error: str | None = None

    try:
        agent, agent_conf = analyze_with_guardian_agent(state, latest_text, return_confidence=True)
    except TypeError:
        # Backward compatible if agent not yet patched for return_confidence
        try:
            agent = analyze_with_guardian_agent(state, latest_text)
            agent_conf = 0.7
        except GuardianAgentUnavailableError as exc:
            agent_error = str(exc)
            logger.warning("Hybrid: agent unavailable: %s", agent_error)
    except GuardianAgentUnavailableError as exc:
        agent_error = str(exc)
        logger.warning("Hybrid: agent unavailable: %s", agent_error)

    return merge_rule_and_agent(rule, agent, agent_confidence=agent_conf, agent_error=agent_error)
