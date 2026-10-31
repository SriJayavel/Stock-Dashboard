"""
Composite Market Data Provider.
Routes requests to the best provider based on symbol, capabilities, and health.
Implements fallback logic and caching.
"""
import asyncio
import logging
from typing import Any, Optional, List

from backend.core.contracts.market_data import (
    MarketDataProvider, Candle, Quote, AssetInfo, ProviderCapabilities
)
from backend.adapters.market_data.yfinance_provider import YFinanceProvider
from backend.adapters.market_data.nse_provider import NSEProvider
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
        self._quote_cache_ttl = 5  # seconds

    # --- Provider Selection ---

    def _select_provider(self, symbol: str, capability: str = None) -> List[MarketDataProvider]:
        """Select best providers for a symbol, in priority order."""
        # Indian markets
        if symbol.endswith('.NS') or symbol.endswith('.BO'):
            return [self._nse, self._yfinance]

        # Crypto/Forex - yfinance handles these well
        if symbol.endswith('-USD') or symbol.endswith('=X'):
            return [self._yfinance]

        # Default to yfinance
        return [self._yfinance]

    def _get_all_providers(self) -> List[MarketDataProvider]:
        return [self._yfinance, self._nse]

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

    async def get_quotes(self, symbols: List[str]) -> List[Optional[Quote]]:
        # Batch with caching
        results = []
        uncached = []

        for symbol in symbols:
            cached = await self._get_cached_quote(symbol)
            if cached:
                results.append(cached)
            else:
                uncached.append((symbol, len(results)))
                results.append(None)  # placeholder

        if uncached:
            # Group by provider
            by_provider = {}
            for symbol, idx in uncached:
                providers = self._select_provider(symbol)
                primary = providers[0].name
                if primary not in by_provider:
                    by_provider[primary] = []
                by_provider[primary].append((symbol, idx))

            # Fetch from each provider
            for provider_name, symbols_idx in by_provider.items():
                provider = self._providers[provider_name]
                syms = [s for s, _ in symbols_idx]
                try:
                    quotes = await provider.get_quotes(syms)
                    for (symbol, idx), quote in zip(symbols_idx, quotes):
                        if quote:
                            await self._cache_quote(symbol, quote)
                            await emit_price_tick(symbol, quote.price, quote.timestamp)
                        results[idx] = quote
                except Exception as e:
                    logger.error(f"Batch quote failed for {provider_name}: {e}")

        return results

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