"""Contracts for the token-efficient specialist-agent supervisor."""

from dataclasses import dataclass

import pytest

from src.app.agents import AgentCall, AgentId, get_multi_agent_supervisor
from src.app.agents import supervisor as supervisor_module
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


def test_supervisor_dispatches_without_mutating_specialist_payload(monkeypatch) -> None:
    registry = AgentRegistry()
    registry.register(EchoAgent())
    supervisor = MultiAgentSupervisor(registry)
    payload = {"private_context": ["chat-only"]}
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(supervisor_module, "record_agent_call", lambda *args, **kwargs: calls.append(kwargs))

    assert supervisor.dispatch(AgentId.CHAT_SUPPORT, payload) is payload
    assert len(calls) == 1
    assert calls[0]["success"] is True
    assert calls[0]["operation"] == "dict"
    assert isinstance(calls[0]["latency_ms"], float)


def test_registry_rejects_duplicate_agent_ids() -> None:
    registry = AgentRegistry()
    registry.register(EchoAgent())

    with pytest.raises(AgentRegistrationError):
        registry.register(EchoAgent())


def test_supervisor_can_coordinate_explicit_plan(monkeypatch) -> None:
    registry = AgentRegistry()
    registry.register(EchoAgent())
    supervisor = MultiAgentSupervisor(registry)
    monkeypatch.setattr(supervisor_module, "record_agent_call", lambda *_args, **_kwargs: None)

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
    assert topology.routing_mode == "chat_support_front_door"
    assert {agent.agent_id for agent in topology.agents} == {
        AgentId.CHAT_SUPPORT,
        AgentId.CALL_GUARDIAN,
        AgentId.TASK_NAVIGATOR,
    }
    assert "api_key" not in topology.model_dump_json()
