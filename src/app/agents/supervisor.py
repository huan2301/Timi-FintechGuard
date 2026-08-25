"""Token-free supervisor for routing bounded work to specialist agents.

The API endpoint already knows whether a request is chat or call protection, so
the supervisor routes by an explicit AgentId instead of spending another LLM
request to rediscover that fact. A generative planning layer can be added later
only for genuinely cross-domain requests.
"""

from __future__ import annotations

from functools import lru_cache

from src.app.agents.contracts import AgentCall, AgentExecution, AgentId
from src.app.agents.registry import AgentRegistry
from src.app.agents.specialists import (
    CallGuardianAgent,
    ChatSupportAgent,
    TaskNavigationAgent,
)


class MultiAgentSupervisor:
    def __init__(self, registry: AgentRegistry) -> None:
        self._registry = registry

    @property
    def registry(self) -> AgentRegistry:
        return self._registry

    def dispatch(self, agent_id: AgentId, payload: object) -> object:
        """Route an explicit domain task without an extra provider/token call."""

        return self._registry.execute(agent_id, payload)

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
