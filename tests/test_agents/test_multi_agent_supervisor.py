"""Contracts for the token-efficient specialist-agent supervisor."""

from dataclasses import dataclass

import pytest

from src.app.agents import AgentCall, AgentId, get_multi_agent_supervisor
from src.app.agents.contracts import AgentCapability, AgentDescriptor
from src.app.agents.registry import AgentRegistrationError, AgentRegistry
from src.app.agents.supervisor import MultiAgentSupervisor
from src.app.api.agents import agent_topology


@dataclass
class EchoAgent:
    descriptor = AgentDescriptor(
        agent_id=AgentId.CHAT_SUPPORT,
        name="echo",
        description="test",
        capabilities=(AgentCapability.PRODUCT_CHAT,),
        api_path="/test",
    )

    def execute(self, payload: object) -> object:
        return payload


def test_supervisor_dispatches_without_mutating_specialist_payload() -> None:
    registry = AgentRegistry()
    registry.register(EchoAgent())
    supervisor = MultiAgentSupervisor(registry)
    payload = {"private_context": ["chat-only"]}

    assert supervisor.dispatch(AgentId.CHAT_SUPPORT, payload) is payload


def test_registry_rejects_duplicate_agent_ids() -> None:
    registry = AgentRegistry()
    registry.register(EchoAgent())

    with pytest.raises(AgentRegistrationError):
        registry.register(EchoAgent())


def test_supervisor_can_coordinate_explicit_plan() -> None:
    registry = AgentRegistry()
    registry.register(EchoAgent())
    supervisor = MultiAgentSupervisor(registry)

    executions = supervisor.coordinate(
        [AgentCall(agent_id=AgentId.CHAT_SUPPORT, payload="bounded-context")]
    )

    assert len(executions) == 1
    assert executions[0].agent_id == AgentId.CHAT_SUPPORT
    assert executions[0].result == "bounded-context"


def test_production_supervisor_registers_current_domain_agents() -> None:
    descriptors = get_multi_agent_supervisor().registry.descriptors()

    assert {descriptor.agent_id for descriptor in descriptors} == {
        AgentId.CHAT_SUPPORT,
        AgentId.CALL_GUARDIAN,
        AgentId.TASK_NAVIGATOR,
    }


def test_topology_reports_token_free_routing_without_credentials() -> None:
    topology = agent_topology(current_user=object())  # type: ignore[arg-type]

    assert topology.extra_llm_calls_per_dispatch == 0
    assert topology.routing_mode == "deterministic_explicit_agent_id"
    assert {agent.agent_id for agent in topology.agents} == {
        AgentId.CHAT_SUPPORT,
        AgentId.CALL_GUARDIAN,
        AgentId.TASK_NAVIGATOR,
    }
    assert "api_key" not in topology.model_dump_json()
