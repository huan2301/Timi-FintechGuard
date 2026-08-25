import pytest

from src.agents.graph import build_graph


@pytest.fixture(scope="module")
def agent():
    """Build agent graph 1 lần cho toàn bộ module test."""
    return build_graph()


@pytest.mark.asyncio
async def test_agent_basic_flow(agent):
    result = await agent.ainvoke({"query": "Hello"})
    assert "response" in result


@pytest.mark.asyncio
async def test_agent_state_structure(agent):
    result = await agent.ainvoke({"query": "Test query"})
    assert isinstance(result, dict)
    assert "query" in result
