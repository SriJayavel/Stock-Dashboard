"""Cache Warmer Feature - Service Implementation"""
import logging
import time
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from backend.core.contracts.cache import LockProtocol
from backend.core.services.symbol_resolver import get_popular_universe
from backend.features.markets.service import MarketService
from backend.features.stocks.service import StockService

logger = logging.getLogger(__name__)


class CacheWarmerService:
    def __init__(
        self,
        markets: MarketService,
        stocks: StockService,
        lock: LockProtocol,
    ):
        self._markets = markets
        self._stocks = stocks
        self._lock = lock
        self._warming_in_progress = False
        self._last_warmed_at: Optional[datetime] = None
        self._total_symbols_warmed = 0

    async def warm_all_caches(self) -> Dict[str, Any]:
        if self._warming_in_progress:
            return {"status": "already_running", "message": "Cache warming already in progress"}

        lock_key = "cache_warmer:global_lock"
        acquired = await self._lock.acquire(lock_key, ttl=300, blocking_timeout=5)
        if not acquired:
            return {"status": "locked", "message": "Could not acquire warming lock"}

        self._warming_in_progress = True
        start_time = time.time()
        started_at = datetime.utcnow()
        errors = []
        warmed_symbols = 0
        warmed_market = False

        try:
            # Warm market overview first
            warmed_market = (await self._markets.refresh()).get("status") == "success"
            if not warmed_market:
                errors.append("Market snapshot unavailable")

            # Get symbols to warm (popular + any in cache namespace)
            symbols_to_warm = await self._get_symbols_to_warm()

            # Warm symbols with jittered pacing
            for symbol in symbols_to_warm:
                result = await self._warm_single_symbol(symbol)
                if result.get("overview_cached") or result.get("history_cached"):
                    warmed_symbols += 1
                if result.get("error"):
                    errors.append(result["error"])

                # Small delay to avoid burst
                await asyncio.sleep(0.1)

            self._last_warmed_at = datetime.utcnow()
            self._total_symbols_warmed = warmed_symbols

        except Exception as e:
            logger.error(f"Cache warming failed: {e}")
            errors.append(str(e))
        finally:
            self._warming_in_progress = False
            await self._lock.release(lock_key)

        duration = time.time() - start_time
        return {
            "status": "completed" if not errors else "partial",
            "warmed_symbols": warmed_symbols,
            "warmed_market": warmed_market,
            "errors": errors,
            "duration_seconds": duration,
            "started_at": started_at,
            "completed_at": datetime.utcnow(),
        }

    async def _get_symbols_to_warm(self) -> List[str]:
        # Get popular symbols from our resolver
        popular = [item["symbol"] for item in get_popular_universe()]

        # Also check cache for recently accessed symbols
        # This would require cache namespace iteration - for now use popular
        return popular[:50]  # Limit to 50 for reasonable warming time

    async def _warm_single_symbol(self, symbol_str: str) -> Dict[str, Any]:
        result = {
            "symbol": symbol_str,
            "overview_cached": False,
            "history_cached": False,
            "error": None,
        }

        errors = []
        try:
            overview = await self._stocks.get_overview(symbol_str)
            result["overview_cached"] = bool(overview and not overview.get("is_stale"))
        except Exception:
            logger.exception("Stock overview warming failed for %s", symbol_str)
            errors.append(f"{symbol_str} overview unavailable")

        try:
            history = await self._stocks.get_history(symbol_str, "1mo", "1d")
            result["history_cached"] = bool(history.get("candles"))
        except Exception:
            logger.exception("Stock history warming failed for %s", symbol_str)
            errors.append(f"{symbol_str} history unavailable")

        result["error"] = "; ".join(errors) or None
        return result

    async def warm_symbol_cache(self, symbol: str) -> Dict[str, Any]:
        return await self._warm_single_symbol(symbol)

    async def warm_market_cache(self) -> Dict[str, Any]:
        success = await self._warm_market_overview()
        return {
            "status": "completed" if success else "failed",
            "market_overview_cached": success,
            "error": None if success else "Failed to fetch market overview",
        }

    async def get_warm_status(self) -> Dict[str, Any]:
        return {
            "is_warming": self._warming_in_progress,
            "last_warmed_at": self._last_warmed_at.isoformat() if self._last_warmed_at else None,
            "total_symbols_warmed": self._total_symbols_warmed,
            "cache_health": await self._get_cache_health(),
        }

    async def _get_cache_health(self) -> Dict[str, Any]:
        # Check cache connectivity and stats
        health = {}
        try:
            # Test L1 cache
            test_key = "health_check:l1"
            await self._cache.set("health", test_key, {"test": True}, ttl=10)
            health["l1"] = "ok"
        except Exception as e:
            health["l1"] = f"error: {e}"

        # For hybrid cache, we'd check L2 as well
        # This depends on the specific implementation
        return health