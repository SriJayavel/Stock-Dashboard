"""Research Feature - Service Implementation"""
import logging
from typing import Dict, Any
from backend.core.contracts.cache import CacheProtocol

logger = logging.getLogger(__name__)


class ResearchService:
    def __init__(self, cache: CacheProtocol):
        self._cache = cache

    async def get_research(self, symbol: str) -> Dict[str, Any]:
        cache_key = f"research:{symbol}"
        cached = await self._cache.get("computed:research", cache_key)
        if cached:
            return cached

        from backend.services.research_pipeline import get_stock_research as legacy_research
        try:
            data = legacy_research(symbol)
        except Exception as e:
            logger.error(f"Research failed: {e}")
            return {"symbol": symbol, "error": str(e)}

        await self._cache.set("computed:research", cache_key, data, ttl=3600)
        return data

    async def get_deep_research(self, symbol: str) -> Dict[str, Any]:
        cache_key = f"deep_research:{symbol}"
        cached = await self._cache.get("computed:deep_research", cache_key)
        if cached:
            return cached

        from backend.services.deep_research import get_deep_stock_research as legacy_deep
        try:
            data = legacy_deep(symbol)
        except Exception as e:
            logger.error(f"Deep research failed: {e}")
            return {"symbol": symbol, "error": str(e)}

        await self._cache.set("computed:deep_research", cache_key, data, ttl=1800)
        return data