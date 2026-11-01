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

        logger.warning(f"Research legacy module not available for {symbol}")
        data = {
            "symbol": symbol,
            "error": "Research requires legacy module integration",
            "fundamentals": {},
            "valuation": {},
            "peer_comparison": {},
            "risk_metrics": {},
        }

        await self._cache.set("computed:research", cache_key, data, ttl=3600)
        return data

    async def get_deep_research(self, symbol: str) -> Dict[str, Any]:
        cache_key = f"deep_research:{symbol}"
        cached = await self._cache.get("computed:deep_research", cache_key)
        if cached:
            return cached

        logger.warning(f"Deep research legacy module not available for {symbol}")
        data = {
            "symbol": symbol,
            "error": "Deep research requires legacy module integration",
            "quarterly_trends": [],
            "corporate_actions": [],
            "valuation_envelope": {},
            "relative_benchmarking": {},
            "correlation_matrix": {},
            "sector_intelligence": {},
            "financial_health_score": None,
        }

        await self._cache.set("computed:deep_research", cache_key, data, ttl=1800)
        return data