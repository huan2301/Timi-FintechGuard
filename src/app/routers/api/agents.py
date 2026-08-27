"""Authenticated observability endpoint for the multi-agent topology."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.app.agents import get_multi_agent_supervisor
from src.app.core.deps import get_current_user
from src.app.models.user import User

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentDescriptorOut(BaseModel):
    agent_id: str
    name: str
    description: str
    capabilities: list[str]
    api_path: str


class AgentTopologyOut(BaseModel):
    supervisor: str
    routing_mode: str
    extra_llm_calls_per_dispatch: int
    agents: list[AgentDescriptorOut]


@router.get("", response_model=AgentTopologyOut)
def agent_topology(
    current_user: User = Depends(get_current_user),
) -> AgentTopologyOut:
    """Describe registered specialists without exposing provider credentials."""

    del current_user
    descriptors = get_multi_agent_supervisor().registry.descriptors()
    return AgentTopologyOut(
        supervisor="timi_multi_agent_supervisor",
        routing_mode="chat_support_front_door",
        extra_llm_calls_per_dispatch=0,
        agents=[
            AgentDescriptorOut(
                agent_id=descriptor.agent_id,
                name=descriptor.name,
                description=descriptor.description,
                capabilities=list(descriptor.capabilities),
                api_path=descriptor.api_path,
            )
            for descriptor in descriptors
        ],
    )
