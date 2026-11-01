"""
NSE India Market Data Provider Adapter.
Implements MarketDataProvider protocol for Indian markets via direct NSE API.
"""
import asyncio
import logging
import json
import time
from typing import Any, Optional, List
from datetime import datetime
import httpx

from backend.core.contracts.market_data import (
    MarketDataProvider, Candle, Quote, AssetInfo, ProviderCapabilities
)
from backend.config import settings

logger = logging.getLogger("nse_provider")


class NSEProvider:
    """Direct NSE India API provider with serverless-friendly configuration."""

    name = "nse"
    supported_asset_types = ["equity", "index"]
    supported_exchanges = ["NSE", "BSE"]
    rate_limit = {"requests_per_second": 5, "burst": 10}

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._cookie_jar = None
        self._session_initialized = False
        self._available = True  # Track if provider is functional

    async def _get_client(self) -> Optional[httpx.AsyncClient]:
        """Get or create HTTP client with session. Returns None if unavailable."""
        if not self._available:
            return None

        if self._client is None:
            try:
                self._client = httpx.AsyncClient(
                    timeout=httpx.Timeout(8.0, connect=3.0),  # Shorter timeouts for serverless
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Referer": "https://www.nseindia.com/",
                    },
                    follow_redirects=True,
                    verify=True,  # SSL verification
                )
                # Initialize session with cookie handshake (non-blocking)
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
            # Hit homepage to get cookies - with short timeout
            await asyncio.wait_for(client.get("https://www.nseindia.com"), timeout=5.0)
            # Hit option chain to get more cookies
            await asyncio.wait_for(
                client.get("https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"),
                timeout=5.0
            )
            self._session_initialized = True
            logger.debug("NSE session initialized")
        except asyncio.TimeoutError:
            logger.warning("NSE session init timeout - provider will operate without session")
        except Exception as e:
            logger.warning(f"NSE session init failed: {e}")

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
            # NSE doesn't have public search API, use a static mapping or CSV
            # This is a simplified version
            return []
        except Exception:
            return []

    async def get_asset_info(self, symbol: str) -> Optional[AssetInfo]:
        """Get NSE asset metadata."""
        # Clean symbol
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
        """Get real-time quote from NSE."""
        client = await self._get_client()
        if client is None:
            logger.debug(f"NSE client unavailable for {symbol}")
            return None

        try:
            clean = symbol.replace('.NS', '').replace('.BO', '')

            # NSE quote API
            url = f"https://www.nseindia.com/api/quote-equity?symbol={clean}"
            resp = await asyncio.wait_for(client.get(url), timeout=5.0)
            resp.raise_for_status()
            data = resp.json()

            price_info = data.get('priceInfo', {})
            last_price = price_info.get('lastPrice')
            prev_close = price_info.get('previousClose')

            if last_price is None:
                return None

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
        except asyncio.TimeoutError:
            logger.debug(f"NSE quote timeout for {symbol}")
        except Exception as e:
            logger.debug(f"NSE quote failed for {symbol}: {e}")
        return None

    async def get_quotes(self, symbols: List[str]) -> List[Optional[Quote]]:
        # Use asyncio.gather with return_exceptions=True for resilience
        tasks = [self.get_quote(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r if isinstance(r, Quote) or r is None else None for r in results]

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

    async def health_check(self) -> bool:
        client = await self._get_client()
        if client is None:
            return False
        try:
            resp = await asyncio.wait_for(
                client.get("https://www.nseindia.com/api/marketStatus"),
                timeout=3.0
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._session_initialized = False