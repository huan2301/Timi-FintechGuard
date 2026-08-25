"""In-process registry for independently deployable specialist agents."""

from __future__ import annotations

from src.app.agents.contracts import AgentDescriptor, AgentId, SpecialistAgent


class AgentRegistrationError(RuntimeError):
    pass


class AgentNotFoundError(LookupError):
    pass


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[AgentId, SpecialistAgent] = {}

    def register(self, agent: SpecialistAgent) -> None:
        agent_id = agent.descriptor.agent_id
        if agent_id in self._agents:
            raise AgentRegistrationError(f"Agent {agent_id} đã được đăng ký")
        self._agents[agent_id] = agent

    def execute(self, agent_id: AgentId, payload: object) -> object:
        try:
            agent = self._agents[agent_id]
        except KeyError as exc:
            raise AgentNotFoundError(f"Không tìm thấy agent {agent_id}") from exc
        return agent.execute(payload)

    def descriptors(self) -> tuple[AgentDescriptor, ...]:
        return tuple(
            self._agents[agent_id].descriptor
            for agent_id in sorted(self._agents, key=str)
        )

