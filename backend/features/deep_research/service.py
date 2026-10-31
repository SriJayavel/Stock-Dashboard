"""Deep Research Feature - Service Implementation"""
import logging
from typing import Dict, Any, List
from backend.core.contracts.cache import CacheProtocol

logger = logging.getLogger(__name__)


class DeepResearchService:
    def __init__(self, cache: CacheProtocol):
        self._cache = cache

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

    async def compute_correlation_matrix(self, symbols: List[str], period: str = "1y") -> Dict[str, Any]:
        from backend.services.deep_research import compute_correlation_matrix as legacy_corr
        try:
            return legacy_corr(symbols, period=period)
        except Exception as e:
            logger.error(f"Correlation matrix failed: {e}")
            return {"symbols": symbols, "error": str(e)}

    async def compute_portfolio_risk(self, positions: List[Dict[str, Any]], period: str = "1y") -> Dict[str, Any]:
        from backend.services.deep_research import compute_cached_portfolio_risk as legacy_risk
        try:
            return legacy_risk(positions, period=period)
        except Exception as e:
            logger.error(f"Portfolio risk failed: {e}")
            return {"positions": positions, "error": str(e)}

    async def get_sector_intelligence(self) -> Dict[str, Any]:
        cache_key = "sector_intelligence"
        cached = await self._cache.get("computed:sector_intelligence", cache_key)
        if cached:
            return cached

        from backend.services.deep_research import get_sector_intelligence as legacy_sector
        try:
            data = legacy_sector()
        except Exception as e:
            logger.error(f"Sector intelligence failed: {e}")
            return {"error": str(e)}

        await self._cache.set("computed:sector_intelligence", cache_key, data, ttl=3600)
        return data