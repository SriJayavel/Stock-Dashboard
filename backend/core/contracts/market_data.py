"""
Market Data Provider Protocol - Defines the contract for all market data sources.
Implementations: yfinance, NSE, Alpha Vantage, Polygon, etc.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional, List
from dataclasses import dataclass
from datetime import datetime
from typing_extensions import Protocol


@dataclass(frozen=True)
class Candle:
    """Single OHLCV candle."""
    timestamp: int  # Unix milliseconds
    open: float
    high: float
    low: float
    close: float
    volume: float

    # Optional computed fields
    vwap: Optional[float] = None
    trades: Optional[int] = None

    @property
    def is_bullish(self) -> bool:
        return self.close > self.open

    @property
    def body_size(self) -> float:
        return abs(self.close - self.open)

    @property
    def range_size(self) -> float:
        return self.high - self.low

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low

    def to_tradingview(self) -> dict:
        """Convert to TradingView Lightweight Charts format."""
        return {
            'time': self.timestamp // 1000,  # TradingView expects seconds
            'open': self.open,
            'high': self.high,
            'low': self.low,
            'close': self.close,
        }


@dataclass(frozen=True)
class Quote:
    """Real-time quote snapshot."""
    symbol: str
    price: float
    change: float
    change_pct: float
    volume: float
    timestamp: int

    # Extended fields
    bid: Optional[float] = None
    ask: Optional[float] = None
    bid_size: Optional[int] = None
    ask_size: Optional[int] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None

    # Additional fundamental fields (from yfinance)
    prev_close: Optional[float] = None
    pe_trailing: Optional[float] = None
    pe_forward: Optional[float] = None
    pb_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    peg_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    profit_margin: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    target_mean: Optional[float] = None
    recommendation: Optional[str] = None
    avg_volume: Optional[float] = None


@dataclass(frozen=True)
class AssetInfo:
    """Static asset metadata."""
    symbol: str
    name: str
    exchange: str
    asset_type: str  # equity, index, forex, crypto, commodity
    currency: str
    country: str
    timezone: str
    market_hours: dict  # {"open": "09:30", "close": "16:00", "timezone": "America/New_York"}
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None


class MarketDataProvider(Protocol):
    """Protocol for market data providers. All methods are async for consistency."""

    # --- Metadata ---

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g., 'yfinance', 'nse', 'polygon')."""
        ...

    @property
    @abstractmethod
    def supported_asset_types(self) -> List[str]:
        """Asset types this provider supports."""
        ...

    @property
    @abstractmethod
    def supported_exchanges(self) -> List[str]:
        """Exchanges this provider covers."""
        ...

    @property
    @abstractmethod
    def rate_limit(self) -> dict:
        """Rate limit info: {'requests_per_second': 10, 'burst': 20}."""
        ...

    # --- Asset Discovery ---

    @abstractmethod
    async def search_symbols(self, query: str, limit: int = 20) -> List[AssetInfo]:
        """Search for symbols matching query."""
        ...

    @abstractmethod
    async def get_asset_info(self, symbol: str) -> Optional[AssetInfo]:
        """Get static metadata for a symbol."""
        ...

    @abstractmethod
    async def resolve_symbol(self, symbol: str) -> Optional[str]:
        """Resolve canonical symbol to provider-specific symbol."""
        ...

    # --- Quotes ---

    @abstractmethod
    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote for a single symbol."""
        ...

    @abstractmethod
    async def get_quotes(self, symbols: List[str]) -> List[Optional[Quote]]:
        """Get real-time quotes for multiple symbols."""
        ...

    # --- Historical Data ---

    @abstractmethod
    async def get_history(
        self,
        symbol: str,
        interval: str,  # 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo
        range_: str,    # 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max, ytd
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[Candle]:
        """Get historical candles. Either (interval+range) OR (start+end)."""
        ...

    @abstractmethod
    async def get_intraday(
        self,
        symbol: str,
        interval: str = "1m",
        days: int = 1,
    ) -> List[Candle]:
        """Get recent intraday data (optimized for live charts)."""
        ...

    # --- Fundamentals ---

    @abstractmethod
    async def get_fundamentals(self, symbol: str) -> dict:
        """Get fundamental data (financials, ratios, etc.)."""
        ...

    @abstractmethod
    async def get_dividends(self, symbol: str) -> List[dict]:
        """Get dividend history."""
        ...

    @abstractmethod
    async def get_splits(self, symbol: str) -> List[dict]:
        """Get stock split history."""
        ...

    # --- Health ---

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if provider is healthy."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Clean up resources."""
        ...


# Provider capability flags
class ProviderCapabilities:
    """What a provider can do - used for routing."""

    REAL_TIME_QUOTES = "real_time_quotes"
    INTRADAY_HISTORY = "intraday_history"
    EXTENDED_HOURS = "extended_hours"
    FUNDAMENTALS = "fundamentals"
    DIVIDENDS_SPLITS = "dividends_splits"
    OPTIONS = "options"
    CRYPTO = "crypto"
    FOREX = "forex"
    INDIAN_MARKETS = "indian_markets"
    GLOBAL_EQUITIES = "global_equities"

    @classmethod
    def all(cls) -> List[str]:
        return [
            cls.REAL_TIME_QUOTES,
            cls.INTRADAY_HISTORY,
            cls.EXTENDED_HOURS,
            cls.FUNDAMENTALS,
            cls.DIVIDENDS_SPLITS,
            cls.OPTIONS,
            cls.CRYPTO,
            cls.FOREX,
            cls.INDIAN_MARKETS,
            cls.GLOBAL_EQUITIES,
        ]