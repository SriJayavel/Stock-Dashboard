"""
Regression test for /internal/refresh-cache endpoint.
Ensures BackgroundTasks annotation is valid and authentication is strictly enforced.
"""
import pytest
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.config import settings
from backend.api.dependencies import get_cache_warmer_service_dep


@pytest.fixture
def test_setup():
    app = create_app()
    mock_warmer = AsyncMock()
    mock_warmer.warm_all_caches = AsyncMock()
    app.dependency_overrides[get_cache_warmer_service_dep] = lambda: mock_warmer
    client = TestClient(app)
    return client, mock_warmer


def test_refresh_cache_unauthorized_missing_header(test_setup):
    """Requests without X-Internal-Secret must be rejected with 403."""
    client, _ = test_setup
    response = client.post("/internal/refresh-cache")
    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid or missing internal secret"}


def test_refresh_cache_unauthorized_invalid_secret(test_setup):
    """Requests with wrong X-Internal-Secret must be rejected with 403."""
    client, _ = test_setup
    response = client.post("/internal/refresh-cache", headers={"X-Internal-Secret": "wrong_secret"})
    assert response.status_code == 403


def test_refresh_cache_authorized_dispatches(test_setup):
    """Authorized requests with X-Internal-Secret return 202 Accepted without requiring query params."""
    client, mock_warmer = test_setup
    response = client.post(
        "/internal/refresh-cache",
        headers={"X-Internal-Secret": settings.INTERNAL_REFRESH_SECRET}
    )
    assert response.status_code == 202
    assert response.json() == {"status": "accepted", "message": "Cache warming dispatched"}
    assert mock_warmer.warm_all_caches.called
