"""
Markets Feature - Service Implementation
"""
import logging
from typing import Dict, Any, List, Optional
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider

logger = logging.getLogger(__name__)


class MarketService:
    """Market data service using dependency-injected protocols."""

    def __init__(self, cache: CacheProtocol, market_data: MarketDataProvider):
        self._cache = cache
        self._market_data = market_data

    async def get_overview(self, refresh: bool = False) -> Dict[str, Any]:
        """Get market overview - uses legacy function for now, will be replaced."""
        # Check cache first
        if not refresh:
            cached = await self._cache.get("market:overview", "full")
            if cached:
                cached["data_freshness"] = "cached"
                return cached

        # Use legacy function - will be replaced with native implementation
        from backend.services.data_pipeline import get_market_overview as legacy_get_overview
        try:
            data = legacy_get_overview(refresh=refresh)
        except Exception as e:
            logger.error(f"Market overview failed: {e}")
            # Return stale cache if available
            stale = await self._cache.get("market:overview_stale", "full")
            if stale:
                stale = dict(stale)
                stale["is_stale"] = True
                stale["feed_health"] = {k: "STALE" for k in stale.get("macro", {})}
                return stale
            raise

        # Cache for next time
        await self._cache.set("market:overview", "full", data, ttl=300)
        return data

    async def refresh(self) -> Dict[str, Any]:
        """Force refresh market overview."""
        from backend.services.data_pipeline import refresh_market_overview as legacy_refresh
        try:
            data = legacy_refresh(lock_acquired=True)
            return {"status": "success", "data": data}
        except Exception as e:
            logger.error(f"Market refresh failed: {e}")
            return {"status": "error", "message": str(e)}