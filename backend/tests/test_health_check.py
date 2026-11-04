import asyncio
from unittest.mock import AsyncMock, patch

from backend.api.dependencies import get_container
from backend.core.contracts.cache import CacheProtocol


async def test_cache_probe_uses_cache_manager_namespace_and_key():
    """Test that health check probes cache with correct namespace and key."""

    # Create a mock cache that implements CacheProtocol
    mock_cache = AsyncMock(spec=CacheProtocol)
    mock_cache.get.return_value = "ok"
    mock_cache.set.return_value = None

    # Test the actual health check logic directly from main.py
    from backend.main import create_app

    # Use a container with our mock cache
    import backend.api.dependencies as deps
    original_get_container = deps.get_container

    class MockContainer:
        def __init__(self):
            self._cache = mock_cache
            self._market_data = None

        def cache(self) -> CacheProtocol:
            return self._cache

        def market_data(self):
            if self._market_data is None:
                from backend.core.contracts.market_data import MarketDataProvider
                mock_md = AsyncMock(spec=MarketDataProvider)
                mock_md.health_check.return_value = True
                self._market_data = mock_md
            return self._market_data

        async def startup(self):
            pass

        async def shutdown(self):
            pass

    mock_container = MockContainer()
    deps.set_container(mock_container)

    try:
        app = create_app()

        # Call the health check endpoint logic
        async with app.router.lifespan_context(app):
            # Find the health_check function
            health_check_fn = None
            for route in app.routes:
                if hasattr(route, 'path') and route.path == '/api/health':
                    health_check_fn = route.endpoint
                    break

            if health_check_fn:
                result = await health_check_fn()
                assert result["status"] == "healthy"
                assert result["dependencies"]["cache"] == "ok"
                print(f"Result: {result}")

        # Verify the mock was called correctly
        mock_cache.set.assert_called_once_with("health", "test", "ok", ttl=1)
        mock_cache.get.assert_called_once_with("health", "test")

        print("Test passed!")
    finally:
        deps.set_container(None)


if __name__ == "__main__":
    asyncio.run(test_cache_probe_uses_cache_manager_namespace_and_key())