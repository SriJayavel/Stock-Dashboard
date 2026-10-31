"""Screener Feature - Service Implementation"""
import logging
from typing import Dict, Any, List
from backend.core.contracts.cache import CacheProtocol

logger = logging.getLogger(__name__)


class ScreenerService:
    def __init__(self, cache: CacheProtocol):
        self._cache = cache

    async def get_snapshot(self, universe: str = "us_mega_caps") -> Dict[str, Any]:
        """Get screener snapshot - uses legacy function for now."""
        cache_key = f"screener:{universe}"
        cached = await self._cache.get("computed:screener", cache_key)
        if cached:
            return cached

        from backend.services.screener import get_screener_snapshot as legacy_screener
        try:
            data = legacy_screener(universe)
        except Exception as e:
            logger.error(f"Screener failed: {e}")
            return {"universe": universe, "items": [], "error": str(e)}

        await self._cache.set("computed:screener", cache_key, data, ttl=1800)
        return data

    async def get_universes(self) -> List[str]:
        return ["us_mega_caps", "indian_leaders", "semiconductors", "crypto", "commodities", "forex"]