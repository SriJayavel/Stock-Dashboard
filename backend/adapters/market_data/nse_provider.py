"""
NSE India Market Data Provider Adapter.
Implements MarketDataProvider protocol for Indian markets via direct NSE API.
"""
import asyncio
import logging
import time
from typing import Any, Optional, List, Dict
from datetime import datetime
from enum import Enum
import httpx

from backend.core.contracts.market_data import (
    MarketDataProvider, Candle, Quote, AssetInfo, ProviderCapabilities
)
from backend.config import settings

logger = logging.getLogger("nse_provider")


class ProviderErrorType(Enum):
    """Classification of provider errors for retry logic."""
    RETRYABLE = "retryable"          # Network timeout, 5xx, 429
    PERMANENT = "permanent"          # 403, 404, 400 - don't retry
    UNAVAILABLE = "unavailable"      # Provider disabled/circuit open


class NSEProviderError(Exception):
    """Structured NSE provider error with classification."""
    def __init__(self, message: str, error_type: ProviderErrorType, status_code: int = 0):
        super().__init__(message)
        self.error_type = error_type
        self.status_code = status_code


class CircuitBreaker:
    """Simple circuit breaker for provider failures."""
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.last_failure_time = 0
        self.is_open = False
        self._lock = asyncio.Lock()

    async def record_success(self):
        async with self._lock:
            self.failures = 0
            self.is_open = False

    async def record_failure(self, error_type: ProviderErrorType):
        async with self._lock:
            if error_type == ProviderErrorType.PERMANENT:
                # Open immediately for permanent errors
                self.is_open = True
                self.last_failure_time = time.time()
            else:
                self.failures += 1
                self.last_failure_time = time.time()
                if self.failures >= self.failure_threshold:
                    self.is_open = True
                    logger.warning(f"NSE circuit breaker opened after {self.failures} failures")

    async def can_proceed(self) -> bool:
        async with self._lock:
            if not self.is_open:
                return True
            # Check if recovery timeout has passed
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.is_open = False
                self.failures = 0
                logger.info("NSE circuit breaker half-open - allowing test request")
                return True
            return False


class NSEProvider:
    """Direct NSE India API provider with serverless-friendly configuration."""

    name = "nse"
    supported_asset_types = ["equity", "index"]
    supported_exchanges = ["NSE", "BSE"]
    rate_limit = {"requests_per_second": 5, "burst": 10}

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._session_initialized = False
        self._available = True
        self._circuit_breaker = CircuitBreaker(failure_threshold=3, recovery_timeout=120)
        self._semaphore = asyncio.Semaphore(3)  # Limit concurrent requests
        self._request_dedup: dict[str, asyncio.Future] = {}  # Deduplicate concurrent requests

    async def _get_client(self) -> Optional[httpx.AsyncClient]:
        """Get or create HTTP client with session. Returns None if unavailable."""
        if not self._available:
            return None

        if self._client is None:
            try:
                self._client = httpx.AsyncClient(
                    timeout=httpx.Timeout(10.0, connect=5.0),
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Referer": "https://www.nseindia.com/",
                        "Origin": "https://www.nseindia.com",
                        "Connection": "keep-alive",
                    },
                    follow_redirects=True,
                    verify=True,
                    limits=httpx.Limits(max_connections=5, max_keepalive_connections=2),
                )
                await self._initialize_session()
            except Exception as e:
                logger.warning(f"NSE client creation failed: {e}")
                self._available = False
                self._client = None
                return None
        return self._client

    async def _initialize_session(self) -> None:
        """Perform NSE cookie handshake. Non-blocking, best-effort."""
        if self._session_initialized:
            return
        try:
            client = await self._get_client()
            if client is None:
                return
            # Hit homepage to get cookies
            await asyncio.wait_for(client.get("https://www.nseindia.com"), timeout=8.0)
            # Hit market status to get more cookies (more reliable than option chain)
            await asyncio.wait_for(
                client.get("https://www.nseindia.com/api/marketStatus"),
                timeout=8.0
            )
            self._session_initialized = True
            logger.debug("NSE session initialized")
        except asyncio.TimeoutError:
            logger.warning("NSE session init timeout - provider will operate without session")
        except Exception as e:
            logger.warning(f"NSE session init failed: {e}")

    def _classify_error(self, exception: Exception, status_code: int = 0) -> ProviderErrorType:
        """Classify error for retry logic."""
        if isinstance(exception, asyncio.TimeoutError):
            return ProviderErrorType.RETRYABLE
        if isinstance(exception, httpx.HTTPStatusError):
            if status_code == 429:
                return ProviderErrorType.RETRYABLE
            if status_code in (403, 404, 400):
                return ProviderErrorType.PERMANENT
            if status_code >= 500:
                return ProviderErrorType.RETRYABLE
        if isinstance(exception, httpx.RequestError):
            return ProviderErrorType.RETRYABLE
        return ProviderErrorType.UNAVAILABLE

    @property
    def capabilities(self) -> List[str]:
        return [
            ProviderCapabilities.REAL_TIME_QUOTES,
            ProviderCapabilities.INTRADAY_HISTORY,
            ProviderCapabilities.INDIAN_MARKETS,
        ]

    # --- Asset Discovery ---

    async def search_symbols(self, query: str, limit: int = 20) -> List[AssetInfo]:
        """Search NSE symbols."""
        try:
            client = await self._get_client()
            return []
        except Exception:
            return []

    async def get_asset_info(self, symbol: str) -> Optional[AssetInfo]:
        """Get NSE asset metadata."""
        clean = symbol.replace('.NS', '').replace('.BO', '')

        return AssetInfo(
            symbol=symbol,
            name=clean,
            exchange="NSE" if symbol.endswith('.NS') else "BSE",
            asset_type="equity",
            currency="INR",
            country="IN",
            timezone="Asia/Kolkata",
            market_hours={"open": "09:15", "close": "15:30", "timezone": "Asia/Kolkata"},
        )

    async def resolve_symbol(self, symbol: str) -> Optional[str]:
        """NSE uses same symbols."""
        return symbol

    # --- Quotes ---

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote from NSE with circuit breaker and deduplication."""
        # Check circuit breaker
        if not await self._circuit_breaker.can_proceed():
            logger.debug(f"NSE circuit breaker open - skipping {symbol}")
            return None

        # Deduplicate concurrent requests for same symbol
        if symbol in self._request_dedup:
            try:
                return await self._request_dedup[symbol]
            except Exception:
                pass  # Fall through to new request

        future = self._fetch_quote(symbol)
        self._request_dedup[symbol] = future
        try:
            return await future
        finally:
            self._request_dedup.pop(symbol, None)

    async def _fetch_quote(self, symbol: str) -> Optional[Quote]:
        """Internal quote fetch with semaphore limiting."""
        async with self._semaphore:
            client = await self._get_client()
            if client is None:
                return None

            try:
                clean = symbol.replace('.NS', '').replace('.BO', '')

                # NSE quote API
                url = f"https://www.nseindia.com/api/quote-equity?symbol={clean}"
                resp = await asyncio.wait_for(client.get(url), timeout=8.0)

                # Classify and handle HTTP errors
                if resp.status_code == 403:
                    error = NSEProviderError("NSE access forbidden (403)", ProviderErrorType.PERMANENT, 403)
                    await self._circuit_breaker.record_failure(ProviderErrorType.PERMANENT)
                    logger.warning(f"NSE 403 for {symbol} - circuit breaker activated")
                    raise error
                elif resp.status_code == 404:
                    error = NSEProviderError(f"NSE symbol not found: {clean}", ProviderErrorType.PERMANENT, 404)
                    await self._circuit_breaker.record_failure(ProviderErrorType.PERMANENT)
                    raise error
                elif resp.status_code == 429:
                    error = NSEProviderError("NSE rate limited (429)", ProviderErrorType.RETRYABLE, 429)
                    await self._circuit_breaker.record_failure(ProviderErrorType.RETRYABLE)
                    raise error
                elif resp.status_code >= 500:
                    error = NSEProviderError(f"NSE server error: {resp.status_code}", ProviderErrorType.RETRYABLE, resp.status_code)
                    await self._circuit_breaker.record_failure(ProviderErrorType.RETRYABLE)
                    raise error

                resp.raise_for_status()
                data = resp.json()

                price_info = data.get('priceInfo', {})
                last_price = price_info.get('lastPrice')
                prev_close = price_info.get('previousClose')

                if last_price is None:
                    return None

                await self._circuit_breaker.record_success()
                return Quote(
                    symbol=symbol,
                    price=last_price,
                    change=last_price - (prev_close or last_price),
                    change_pct=price_info.get('pChange', 0),
                    volume=data.get('securityInfo', {}).get('totalTradedVolume', 0),
                    timestamp=int(datetime.now().timestamp() * 1000),
                    high_52w=price_info.get('intraDayHighLow', {}).get('max'),
                    low_52w=price_info.get('intraDayHighLow', {}).get('min'),
                )
            except NSEProviderError:
                raise
            except asyncio.TimeoutError:
                await self._circuit_breaker.record_failure(ProviderErrorType.RETRYABLE)
                logger.debug(f"NSE quote timeout for {symbol}")
            except Exception as e:
                error_type = self._classify_error(e, getattr(e, 'response', None) and e.response.status_code)
                await self._circuit_breaker.record_failure(error_type)
                logger.debug(f"NSE quote failed for {symbol}: {e}")
            return None

    async def get_quotes(self, symbols: List[str]) -> List[Optional[Quote]]:
        """Get quotes with concurrency limiting and error handling."""
        if not await self._circuit_breaker.can_proceed():
            logger.debug("NSE circuit breaker open - skipping batch")
            return [None] * len(symbols)

        # Process in smaller batches to avoid overwhelming the provider
        batch_size = 5
        results = [None] * len(symbols)

        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            tasks = [self.get_quote(s) for s in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            for j, result in enumerate(batch_results):
                idx = i + j
                if isinstance(result, Quote) or result is None:
                    results[idx] = result
                elif isinstance(result, NSEProviderError):
                    if result.error_type == ProviderErrorType.PERMANENT:
                        # Circuit breaker already recorded, stop further requests
                        logger.warning(f"NSE permanent error ({result.status_code}) - stopping batch")
                        await self._circuit_breaker.record_failure(ProviderErrorType.PERMANENT)
                        return results
                else:
                    logger.debug(f"NSE batch quote error for {batch[j]}: {result}")

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
        """Get historical data from NSE."""
        # NSE historical API is complex, fallback to yfinance for history
        return []

    async def get_intraday(
        self,
        symbol: str,
        interval: str = "1m",
        days: int = 1,
    ) -> List[Candle]:
        return []

    # --- Fundamentals ---

    async def get_fundamentals(self, symbol: str) -> dict:
        return {}

    async def get_dividends(self, symbol: str) -> List[dict]:
        return []

    async def get_splits(self, symbol: str) -> List[dict]:
        return []

    # --- Health ---

    async def get_market_overview(self) -> Dict[str, Any]:
        """NSE covers Indian equities only; global overview is handled by the
        composite provider. Return an empty-but-valid structure so the
        protocol is satisfied without triggering upstream requests."""
        return {
            "indices": {},
            "macro": {"Forex": {}, "Commodities": {}, "Crypto": {}},
            "retrieved_at": datetime.now().isoformat(),
            "source": "nse",
        }

    async def health_check(self) -> bool:
        if not await self._circuit_breaker.can_proceed():
            return False
        client = await self._get_client()
        if client is None:
            return False
        try:
            resp = await asyncio.wait_for(
                client.get("https://www.nseindia.com/api/marketStatus"),
                timeout=5.0
            )
            if resp.status_code == 200:
                await self._circuit_breaker.record_success()
                return True
            elif resp.status_code == 403:
                await self._circuit_breaker.record_failure(ProviderErrorType.PERMANENT)
            return False
        except Exception as e:
            error_type = self._classify_error(e)
            await self._circuit_breaker.record_failure(error_type)
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._session_initialized = False
        self._request_dedup.clear()