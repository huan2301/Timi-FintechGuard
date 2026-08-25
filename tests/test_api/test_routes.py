import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post("/api/v1/chat", json={"message": ""})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_face_login_route_is_not_exposed(client):
    response = await client.post("/api/v1/auth/login/face", json={})
    # The frontend GET catch-all matches this path, so an unsupported POST is
    # correctly rejected as 405 rather than being handled by a Face Login API.
    assert response.status_code == 405
