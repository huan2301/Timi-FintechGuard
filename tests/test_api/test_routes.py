import pytest
from pydantic import ValidationError

from src.app.routers.api.admin.routes import get_runtime_settings
from src.app.schemas.admin import ContentItemUpdate
from src.main import app


def test_openapi_operation_ids_are_unique():
    schema = app.openapi()
    http_methods = {"get", "post", "put", "patch", "delete"}
    operation_ids = [
        operation.get("operationId")
        for path in schema["paths"].values()
        for method, operation in path.items()
        if method in http_methods
    ]

    assert len(operation_ids) == len(set(operation_ids))
    assert all(operation_ids)


def test_admin_runtime_settings_expose_only_non_secret_configuration():
    payload = get_runtime_settings().model_dump()

    assert "daily_transfer_limit_vnd" not in payload
    assert "external_transfer_mode" not in payload
    assert payload["risk_rules_version"]
    assert not any("secret" in key or "api_key" in key for key in payload)


def test_content_update_is_partial_but_rejects_null_required_columns():
    assert ContentItemUpdate(title="Tiêu đề mới").model_dump(exclude_unset=True) == {"title": "Tiêu đề mới"}
    with pytest.raises(ValidationError):
        ContentItemUpdate(page_key=None)


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
