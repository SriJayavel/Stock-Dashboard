from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from backend.adapters.cache.memory_cache import MemoryCache
from backend.features.markets.service import MarketService
from backend.main import create_app


def test_public_search_matches_dashboard_contract():
    response = TestClient(create_app()).get("/api/search", params={"q": "TCS"})

    assert response.status_code == 200
    assert any(result["symbol"] == "TCS.NS" for result in response.json())


async def test_market_snapshot_read_is_cache_only():
    cache = MemoryCache()
    provider = AsyncMock()
    service = MarketService(cache, provider)

    assert (await service.get_overview())["macro"]
    provider.get_market_overview.assert_not_awaited()

    snapshot = {"macro": {"Indices": [{"symbol": "^NSEI", "price": 123}]}}
    await cache.set("market:overview_stale", "full", snapshot, ttl=60)

    assert await service.get_overview() == {
        **snapshot, "is_stale": True, "data_freshness": "stale",
    }
    provider.get_market_overview.assert_not_awaited()
