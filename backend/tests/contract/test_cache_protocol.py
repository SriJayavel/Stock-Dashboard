"""
Contract Tests - Verify all cache implementations comply with CacheProtocol.
Run: pytest backend/tests/contract/ -v
"""
import pytest
import asyncio
from typing import Any, Optional, List

from backend.core.contracts.cache import CacheProtocol, CacheNamespaces
from backend.adapters.cache.memory_cache import MemoryCache
from backend.adapters.cache.redis_cache import RedisCache, HybridCache


class TestCacheContract:
    """Contract tests that ALL cache implementations must pass."""

    @pytest.fixture(params=["memory", "hybrid"])
    async def cache(self, request) -> CacheProtocol:
        """Fixture providing different cache implementations."""
        if request.param == "memory":
            cache = MemoryCache(maxsize=100, default_ttl=60)
            yield cache
        elif request.param == "hybrid":
            # Hybrid with memory only (no Redis in tests)
            l1 = MemoryCache(maxsize=100, default_ttl=60)
            cache = HybridCache(l1, l2_cache=None)
            yield cache

    @pytest.mark.asyncio
    async def test_get_set_roundtrip(self, cache: CacheProtocol):
        """Basic get/set should work."""
        await cache.set("test", "key1", "value1")
        result = await cache.get("test", "key1")
        assert result == "value1"

    @pytest.mark.asyncio
    async def test_get_missing_returns_none(self, cache: CacheProtocol):
        """Missing keys return None."""
        result = await cache.get("test", "nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_removes_key(self, cache: CacheProtocol):
        """Delete should remove key."""
        await cache.set("test", "key1", "value1")
        await cache.delete("test", "key1")
        result = await cache.get("test", "key1")
        assert result is None

    @pytest.mark.asyncio
    async def test_exists_returns_bool(self, cache: CacheProtocol):
        """Exists should return boolean."""
        await cache.set("test", "key1", "value1")
        assert await cache.exists("test", "key1") is True
        assert await cache.exists("test", "missing") is False

    @pytest.mark.asyncio
    async def test_clear_namespace(self, cache: CacheProtocol):
        """Clear namespace removes all keys in it."""
        await cache.set("ns1", "key1", "v1")
        await cache.set("ns1", "key2", "v2")
        await cache.set("ns2", "key1", "v3")

        await cache.clear_namespace("ns1")

        assert await cache.get("ns1", "key1") is None
        assert await cache.get("ns1", "key2") is None
        assert await cache.get("ns2", "key1") == "v3"

    @pytest.mark.asyncio
    async def test_get_many(self, cache: CacheProtocol):
        """Get many returns dict of found keys."""
        await cache.set("test", "a", 1)
        await cache.set("test", "b", 2)
        await cache.set("test", "c", 3)

        result = await cache.get_many("test", ["a", "b", "c", "missing"])

        assert result == {"a": 1, "b": 2, "c": 3}

    @pytest.mark.asyncio
    async def test_set_many(self, cache: CacheProtocol):
        """Set many stores multiple keys."""
        await cache.set_many("test", {"x": 10, "y": 20, "z": 30})

        assert await cache.get("test", "x") == 10
        assert await cache.get("test", "y") == 20
        assert await cache.get("test", "z") == 30

    @pytest.mark.asyncio
    async def test_ttl_expiration(self, cache: CacheProtocol):
        """Values should expire after TTL."""
        await cache.set("test", "key1", "value1", ttl=1)
        assert await cache.get("test", "key1") == "value1"

        await asyncio.sleep(1.5)

        assert await cache.get("test", "key1") is None

    @pytest.mark.asyncio
    async def test_ttl_none_means_no_expiry(self, cache: CacheProtocol):
        """TTL=None or 0 means no expiration."""
        await cache.set("test", "key1", "value1", ttl=0)
        assert await cache.get("test", "key1") == "value1"
        # Should still be there after sleep
        await asyncio.sleep(0.5)
        assert await cache.get("test", "key1") == "value1"

    @pytest.mark.asyncio
    async def test_namespace_isolation(self, cache: CacheProtocol):
        """Namespaces should be isolated."""
        await cache.set("ns1", "key", "value1")
        await cache.set("ns2", "key", "value2")

        assert await cache.get("ns1", "key") == "value1"
        assert await cache.get("ns2", "key") == "value2"

    @pytest.mark.asyncio
    async def test_complex_objects(self, cache: CacheProtocol):
        """Should handle complex objects (dict, list, etc.)."""
        obj = {"nested": {"list": [1, 2, 3], "bool": True}, "str": "test"}
        await cache.set("test", "complex", obj)
        result = await cache.get("test", "complex")
        assert result == obj

    @pytest.mark.asyncio
    async def test_overwrite_existing(self, cache: CacheProtocol):
        """Set should overwrite existing key."""
        await cache.set("test", "key", "v1")
        await cache.set("test", "key", "v2")
        assert await cache.get("test", "key") == "v2"


class TestCacheNamespaces:
    """Test cache namespace constants."""

    def test_all_namespaces_defined(self):
        """All expected namespaces should exist."""
        namespaces = CacheNamespaces.all()
        expected = [
            "market:overview", "stock:overview", "stock:history",
            "market:candles", "computed:indicators", "computed:screener",
            "computed:research", "computed:deep_research", "computed:correlation",
            "computed:portfolio_risk", "computed:sector_intel",
            "computed:v4_intelligence", "computed:macro_explorer",
            "discovery:search", "discovery:symbol_resolution",
        ]
        for exp in expected:
            assert exp in namespaces, f"Missing namespace: {exp}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])