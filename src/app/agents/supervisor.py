"""Least-privilege supervisor for routing bounded work to specialist agents.

Chat messages first enter the Chat Support front door, which returns a bounded
intent label. The supervisor then dispatches the selected specialist by an
explicit ``AgentId``; it never lets a model emit a URL or execute a transfer.
Call protection remains an explicit independent entry point.
"""

from __future__ import annotations

from functools import lru_cache
from time import perf_counter

from src.app.agents.contracts import AgentCall, AgentExecution, AgentId
from src.app.agents.registry import AgentRegistry
from src.app.agents.specialists import (
    CallGuardianAgent,
    ChatSupportAgent,
    TaskNavigationAgent,
)
from src.app.services.agent_metrics import record_agent_call


class MultiAgentSupervisor:
    def __init__(self, registry: AgentRegistry) -> None:
        self._registry = registry

    @property
    def registry(self) -> AgentRegistry:
        return self._registry

    def dispatch(self, agent_id: AgentId, payload: object) -> object:
        """Route one explicit domain task without adding a planning LLM call."""

        started = perf_counter()
        try:
            result = self._registry.execute(agent_id, payload)
        except Exception as exc:
            record_agent_call(
                agent_id.value,
                latency_ms=(perf_counter() - started) * 1000,
                success=False,
                operation=type(payload).__name__,
                failure_type=type(exc).__name__,
            )
            raise
        record_agent_call(
            agent_id.value,
            latency_ms=(perf_counter() - started) * 1000,
            success=True,
            operation=type(payload).__name__,
        )
        return result

    def coordinate(self, calls: list[AgentCall]) -> tuple[AgentExecution, ...]:
        """Run a supervisor plan while keeping each specialist context isolated."""

        return tuple(
            AgentExecution(
                agent_id=call.agent_id,
                result=self.dispatch(call.agent_id, call.payload),
            )
            for call in calls
        )


@lru_cache(maxsize=1)
def get_multi_agent_supervisor() -> MultiAgentSupervisor:
    registry = AgentRegistry()
    registry.register(ChatSupportAgent())
    registry.register(CallGuardianAgent())
    registry.register(TaskNavigationAgent())
    return MultiAgentSupervisor(registry)
