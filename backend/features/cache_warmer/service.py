"""Cache Warmer Feature - Service Implementation"""
import logging
import time
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Set
from backend.core.contracts.cache import CacheProtocol, LockProtocol
from backend.core.contracts.market_data import MarketDataProvider
from backend.core.domain.models import Symbol
from backend.core.services.symbol_resolver import resolve_symbol, get_popular_universe

logger = logging.getLogger(__name__)


class CacheWarmerService:
    def __init__(
        self,
        cache: CacheProtocol,
        market_data: MarketDataProvider,
        lock: LockProtocol,
    ):
        self._cache = cache
        self._market_data = market_data
        self._lock = lock
        self._warming_in_progress = False
        self._last_warmed_at: datetime = None
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

        try:
            # Warm market overview first
            await self._warm_market_overview()

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
            "warmed_market": True,
            "errors": errors,
            "duration_seconds": duration,
            "started_at": started_at,
            "completed_at": datetime.utcnow(),
        }

    async def _warm_market_overview(self) -> bool:
        try:
            overview = await self._market_data.get_market_overview()
            if overview:
                await self._cache.set(
                    "market:overview",
                    "current",
                    overview,
                    ttl=300,
                )
                return True
        except Exception as e:
            logger.warning(f"Market overview warming failed: {e}")
        return False

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

        try:
            symbol = Symbol.from_string(symbol_str)

            # Warm overview
            overview = await self._market_data.get_overview(symbol)
            if overview:
                await self._cache.set(
                    "stock:overview",
                    symbol_str,
                    overview,
                    ttl=1800,
                )
                result["overview_cached"] = True

            # Warm history (1d, 1mo)
            history = await self._market_data.get_history(
                symbol, timeframe="1d", range="1mo"
            )
            if history:
                await self._cache.set(
                    "stock:history",
                    f"{symbol_str}:1d:1mo",
                    history,
                    ttl=1800,
                )
                result["history_cached"] = True

        except Exception as e:
            logger.warning(f"Symbol warming failed for {symbol_str}: {e}")
            result["error"] = str(e)

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