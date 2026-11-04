"""
Composite Market Data Provider.
Routes requests to the best provider based on symbol, capabilities, and health.
Implements fallback logic and caching.
"""
import asyncio
import logging
from datetime import datetime
from typing import Any, Optional, List, Dict

from backend.core.contracts.market_data import (
    MarketDataProvider, Candle, Quote, AssetInfo, ProviderCapabilities
)
from backend.adapters.market_data.yfinance_provider import YFinanceProvider
from backend.adapters.market_data.nse_provider import NSEProvider, NSEProviderError, ProviderErrorType
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.events import get_event_bus, emit_price_tick, EventTypes

logger = logging.getLogger("composite_market_provider")


class CompositeMarketProvider:
    """
    Smart provider that routes to the best backend.
    - Indian symbols (.NS, .BO) → NSE (primary) → yfinance (fallback)
    - Everything else → yfinance
    - Caches quotes for performance
    """

    def __init__(
        self,
        cache: Optional[CacheProtocol] = None,
        yfinance: Optional[YFinanceProvider] = None,
        nse: Optional[NSEProvider] = None,
    ):
        self._cache = cache
        self._yfinance = yfinance or YFinanceProvider()
        self._nse = nse or NSEProvider()
        self._providers = {
            "yfinance": self._yfinance,
            "nse": self._nse,
        }
        self._quote_cache_ttl = 60  # seconds - increased from 5 to reduce upstream load
        self._request_dedup: dict[str, asyncio.Future] = {}  # Deduplicate concurrent requests

    def _is_permanent_error(self, error: Exception) -> bool:
        """Check if error is permanent (should not retry/fallback)."""
        if isinstance(error, NSEProviderError):
            return error.error_type == ProviderErrorType.PERMANENT
        return False

    # --- Provider Selection ---

    def _select_provider(self, symbol: str, capability: str = None) -> List[MarketDataProvider]:
        """Select best providers for a symbol, in priority order."""
        # Indian markets
        if symbol.endswith('.NS') or symbol.endswith('.BO'):
            # Check if NSE is available before adding it
            providers = []
            if getattr(self._nse, '_available', True):
                providers.append(self._nse)
            providers.append(self._yfinance)
            return providers

        # Crypto/Forex - yfinance handles these well
        if symbol.endswith('-USD') or symbol.endswith('=X'):
            return [self._yfinance]

        # Default to yfinance
        return [self._yfinance]

    def _get_all_providers(self) -> List[MarketDataProvider]:
        providers = [self._yfinance]
        if getattr(self._nse, '_available', True):
            providers.append(self._nse)
        return providers

    # --- Caching Helpers ---

    async def _get_cached_quote(self, symbol: str) -> Optional[Quote]:
        if not self._cache:
            return None
        cached = await self._cache.get("quotes", symbol)
        if cached:
            return Quote(**cached)
        return None

    async def _cache_quote(self, symbol: str, quote: Quote) -> None:
        if self._cache:
            await self._cache.set("quotes", symbol, quote.__dict__, ttl=self._quote_cache_ttl)

    # --- Asset Discovery ---

    async def search_symbols(self, query: str, limit: int = 20) -> List[AssetInfo]:
        # Try yfinance first (broader coverage)
        results = await self._yfinance.search_symbols(query, limit)
        if results:
            return results
        return await self._nse.search_symbols(query, limit)

    async def get_asset_info(self, symbol: str) -> Optional[AssetInfo]:
        providers = self._select_provider(symbol)
        for provider in providers:
            info = await provider.get_asset_info(symbol)
            if info:
                return info
        return None

    async def resolve_symbol(self, symbol: str) -> Optional[str]:
        providers = self._select_provider(symbol)
        for provider in providers:
            resolved = await provider.resolve_symbol(symbol)
            if resolved:
                return resolved
        return symbol

    # --- Quotes ---

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        # Check cache first
        cached = await self._get_cached_quote(symbol)
        if cached:
            return cached

        providers = self._select_provider(symbol)
        last_error = None

        for provider in providers:
            try:
                quote = await provider.get_quote(symbol)
                if quote:
                    await self._cache_quote(symbol, quote)
                    # Emit price tick for WebSocket
                    await emit_price_tick(symbol, quote.price, quote.timestamp)
                    return quote
            except Exception as e:
                last_error = e
                logger.debug(f"{provider.name} quote failed for {symbol}: {e}")
                continue

        if last_error:
            logger.warning(f"All providers failed for {symbol}: {last_error}")
        return None

    async def get_market_overview(self) -> Dict[str, Any]:
        """Fetch a comprehensive market snapshot with caching.

        Returns indices + macro assets in a structure consumed by
        MarketService and the frontend markets workspace. Caches the
        result for 60s to protect upstream rate limits.
        """
        cache_key = "market:overview"
        if self._cache:
            cached = await self._cache.get(cache_key, "current")
            if cached:
                return cached

        benchmark_symbols = [
            "^NSEI", "^NSEBANK", "^BSESN",
            "^GSPC", "^DJI", "^IXIC", "^RUT",
            "^FTSE", "^GDAXI", "^FCHI",
            "^N225", "^HSI", "^STI", "^KS11",
            "^AXJO", "^GSPTSE", "^MXX",
        ]
        macro_symbols = {
            "Forex": ["USDINR=X", "EURUSD=X", "GBPUSD=X", "USDJPY=X"],
            "Commodities": ["GC=F", "CL=F", "SI=F", "NG=F"],
            "Crypto": ["BTC-USD", "ETH-USD", "SOL-USD"],
        }

        all_symbols = list(benchmark_symbols)
        for symbols in macro_symbols.values():
            all_symbols.extend(symbols)

        quotes = await self.get_quotes(all_symbols)
        quote_map: Dict[str, Optional[Quote]] = dict(zip(all_symbols, quotes))

        def _index_item(sym: str) -> Dict[str, Any]:
            q = quote_map.get(sym)
            if not q or q.price is None:
                return {
                    "symbol": sym, "price": None, "change": None,
                    "change_pct": None, "volume": 0, "high": None,
                    "low": None, "source": "unavailable", "is_stale": False,
                }
            return {
                "symbol": sym,
                "price": q.price,
                "change": q.change,
                "change_pct": q.change_pct,
                "volume": q.volume,
                "high": q.high_52w,
                "low": q.low_52w,
                "source": "yfinance",
                "is_stale": False,
                "source_timestamp": int(datetime.now().timestamp() * 1000),
            }

        indices = {sym: _index_item(sym) for sym in benchmark_symbols}
        macro = {category: {sym: _index_item(sym) for sym in syms} for category, syms in macro_symbols.items()}

        result = {
            "indices": indices,
            "macro": macro,
            "retrieved_at": datetime.now().isoformat(),
            "source": "composite_provider",
        }

        if self._cache:
            await self._cache.set(cache_key, "current", result, ttl=60)
        return result

    async def get_quotes(self, symbols: List[str]) -> List[Optional[Quote]]:
        # Batch with caching and deduplication
        results = []
        uncached = []
        symbol_providers = {}

        for symbol in symbols:
            cached = await self._get_cached_quote(symbol)
            if cached:
                results.append(cached)
            else:
                uncached.append((symbol, len(results)))
                results.append(None)  # placeholder
                symbol_providers[symbol] = self._select_provider(symbol)

        if not uncached:
            return results

        # Group by primary provider
        by_provider = {}
        for symbol, idx in uncached:
            providers = symbol_providers[symbol]
            primary = providers[0].name
            if primary not in by_provider:
                by_provider[primary] = []
            by_provider[primary].append((symbol, idx))

        # Fetch from each provider with error handling
        for provider_name, symbols_idx in by_provider.items():
            provider = self._providers[provider_name]
            syms = [s for s, _ in symbols_idx]

            # Deduplicate concurrent requests for same provider
            dedup_key = f"{provider_name}:{','.join(sorted(syms))}"
            if dedup_key in self._request_dedup:
                try:
                    cached_results = await self._request_dedup[dedup_key]
                    for (symbol, idx), quote in zip(symbols_idx, cached_results):
                        if quote:
                            await self._cache_quote(symbol, quote)
                            await emit_price_tick(symbol, quote.price, quote.timestamp)
                        results[idx] = quote
                    continue
                except Exception:
                    pass  # Fall through to new request

            future = self._fetch_from_provider(provider, syms, symbols_idx, symbol_providers, results)
            self._request_dedup[dedup_key] = future
            try:
                await future
            finally:
                self._request_dedup.pop(dedup_key, None)

        return results

    async def _fetch_from_provider(
        self,
        provider: MarketDataProvider,
        syms: List[str],
        symbols_idx: List[tuple],
        symbol_providers: dict,
        results: List[Optional[Quote]]
    ):
        """Fetch quotes from a provider with fallback handling."""
        try:
            quotes = await provider.get_quotes(syms)
            all_failed = True
            for (symbol, idx), quote in zip(symbols_idx, quotes):
                if quote:
                    all_failed = False
                    await self._cache_quote(symbol, quote)
                    await emit_price_tick(symbol, quote.price, quote.timestamp)
                results[idx] = quote

            # If all quotes failed from this provider, try fallback providers
            # BUT skip fallback if the error was permanent (e.g., 403, 404)
            if all_failed:
                # Check if provider raised permanent error
                # We can't easily detect this here, so we rely on provider's internal circuit breaker
                first_symbol = symbols_idx[0][0]
                fallback_providers = symbol_providers[first_symbol][1:] if len(symbol_providers[first_symbol]) > 1 else []
                for fallback in fallback_providers:
                    try:
                        fallback_quotes = await fallback.get_quotes(syms)
                        any_success = False
                        for (symbol, idx), quote in zip(symbols_idx, fallback_quotes):
                            if quote and results[idx] is None:
                                any_success = True
                                await self._cache_quote(symbol, quote)
                                await emit_price_tick(symbol, quote.price, quote.timestamp)
                                results[idx] = quote
                        if any_success:
                            break
                    except Exception as e:
                        # Don't retry fallbacks for permanent errors
                        if self._is_permanent_error(e):
                            logger.debug(f"Skipping fallback {fallback.name} due to permanent error: {e}")
                            break
                        logger.debug(f"Fallback {fallback.name} failed: {e}")
                        continue

        except Exception as e:
            # Don't retry fallbacks for permanent errors
            if self._is_permanent_error(e):
                logger.warning(f"Provider {provider.name} permanent error - not attempting fallback: {e}")
            else:
                logger.error(f"Batch quote failed for {provider.name}: {e}")

    # --- Historical Data ---

    async def get_history(
        self,
        symbol: str,
        interval: str,
        range_: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[Candle]:
        providers = self._select_provider(symbol)
        last_error = None

        for provider in providers:
            try:
                candles = await provider.get_history(symbol, interval, range_, start, end)
                if candles:
                    return candles
            except Exception as e:
                last_error = e
                logger.debug(f"{provider.name} history failed for {symbol}: {e}")
                continue

        if last_error:
            logger.warning(f"All providers failed history for {symbol}: {last_error}")
        return []

    async def get_intraday(
        self,
        symbol: str,
        interval: str = "1m",
        days: int = 1,
    ) -> List[Candle]:
        providers = self._select_provider(symbol)

        for provider in providers:
            try:
                candles = await provider.get_intraday(symbol, interval, days)
                if candles:
                    return candles
            except Exception as e:
                logger.debug(f"{provider.name} intraday failed for {symbol}: {e}")
                continue
        return []

    # --- Fundamentals ---

    async def get_fundamentals(self, symbol: str) -> dict:
        # yfinance has better fundamentals
        return await self._yfinance.get_fundamentals(symbol)

    async def get_dividends(self, symbol: str) -> List[dict]:
        return await self._yfinance.get_dividends(symbol)

    async def get_splits(self, symbol: str) -> List[dict]:
        return await self._yfinance.get_splits(symbol)

    # --- Health ---

    async def health_check(self) -> bool:
        results = await asyncio.gather(
            self._yfinance.health_check(),
            self._nse.health_check(),
            return_exceptions=True
        )
        return any(r is True for r in results if not isinstance(r, Exception))

    async def close(self) -> None:
        await asyncio.gather(
            self._yfinance.close(),
            self._nse.close(),
            return_exceptions=True
        )

    # --- Capabilities ---

    @property
    def name(self) -> str:
        return "composite"

    @property
    def supported_asset_types(self) -> List[str]:
        return list(set(
            self._yfinance.supported_asset_types + self._nse.supported_asset_types
        ))

    @property
    def supported_exchanges(self) -> List[str]:
        return list(set(
            self._yfinance.supported_exchanges + self._nse.supported_exchanges
        ))

    @property
    def rate_limit(self) -> dict:
        return {"requests_per_second": 15, "burst": 30}

    @property
    def capabilities(self) -> List[str]:
        return list(set(
            self._yfinance.capabilities + self._nse.capabilities
        ))