"""Relationship Intelligence Feature - Service Implementation"""
import logging
from typing import Dict, Any
from backend.core.contracts.cache import CacheProtocol

logger = logging.getLogger(__name__)


class RelationshipIntelligenceService:
    def __init__(self, cache: CacheProtocol):
        self._cache = cache

    async def get_v4_intelligence(self, symbol: str) -> Dict[str, Any]:
        cache_key = f"v4_intelligence:{symbol}"
        cached = await self._cache.get("computed:v4_intelligence", cache_key)
        if cached:
            return cached

        from backend.services.relationship_engine import get_v4_intelligence as legacy_v4
        try:
            data = legacy_v4(symbol)
        except Exception as e:
            logger.error(f"V4 intelligence failed: {e}")
            return {"symbol": symbol, "error": str(e)}

        await self._cache.set("computed:v4_intelligence", cache_key, data, ttl=1800)
        return data

    async def get_macro_explorer(self, symbol: str) -> Dict[str, Any]:
        cache_key = f"macro_explorer:{symbol}"
        cached = await self._cache.get("computed:macro_explorer", cache_key)
        if cached:
            return cached

        from backend.services.relationship_engine import get_macro_explorer as legacy_macro
        try:
            data = legacy_macro(symbol)
        except Exception as e:
            logger.error(f"Macro explorer failed: {e}")
            return {"symbol": symbol, "error": str(e)}

        await self._cache.set("computed:macro_explorer", cache_key, data, ttl=1800)
        return data

    async def parse_query(self, query: str, symbol: str) -> Dict[str, Any]:
        from backend.services.relationship_engine import parse_research_query as legacy_parse
        try:
            return legacy_parse(query, symbol)
        except Exception as e:
            logger.error(f"Query parse failed: {e}")
            return {"query": query, "error": str(e)}