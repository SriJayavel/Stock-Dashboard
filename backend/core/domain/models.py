"""
Domain Models - Pure business objects with no framework dependencies.
These are the core entities of the financial terminal.
"""
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from enum import Enum


class AssetType(Enum):
    EQUITY = "equity"
    INDEX = "index"
    ETF = "etf"
    FOREX = "forex"
    CRYPTO = "crypto"
    COMMODITY = "commodity"
    BOND = "bond"
    OPTION = "option"
    FUTURE = "future"


class MarketStatus(Enum):
    OPEN = "open"
    CLOSED = "closed"
    PRE_MARKET = "pre_market"
    AFTER_HOURS = "after_hours"
    UNKNOWN = "unknown"


class DataFreshness(Enum):
    LIVE = "live"
    DELAYED = "delayed"
    STALE = "stale"
    CACHED = "cached"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class Symbol:
    """Value object for a trading symbol."""
    value: str

    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("Symbol must be a non-empty string")
        object.__setattr__(self, 'value', self.value.strip().upper())

    @property
    def is_indian(self) -> bool:
        return self.value.endswith('.NS') or self.value.endswith('.BO')

    @property
    def is_crypto(self) -> bool:
        return self.value.endswith('-USD') or self.value.endswith('=X') and 'USD' in self.value

    @property
    def is_forex(self) -> bool:
        return self.value.endswith('=X')

    @property
    def base_symbol(self) -> str:
        """Symbol without exchange suffix."""
        for suffix in ['.NS', '.BO', '.L', '.DE', '.PA', '.T', '-USD', '=X']:
            if self.value.endswith(suffix):
                return self.value[:-len(suffix)]
        return self.value

    def __str__(self) -> str:
        return self.value

    def __hash__(self) -> int:
        return hash(self.value)


@dataclass(frozen=True)
class Money:
    """Value object for monetary amounts with currency."""
    amount: Decimal
    currency: str = "USD"

    def __post_init__(self):
        if not isinstance(self.amount, Decimal):
            object.__setattr__(self, 'amount', Decimal(str(self.amount)))
        object.__setattr__(self, 'currency', self.currency.upper())

    def __add__(self, other: 'Money') -> 'Money':
        if self.currency != other.currency:
            raise ValueError(f"Cannot add {self.currency} and {other.currency}")
        return Money(self.amount + other.amount, self.currency)

    def __sub__(self, other: 'Money') -> 'Money':
        if self.currency != other.currency:
            raise ValueError(f"Cannot subtract {self.currency} and {other.currency}")
        return Money(self.amount - other.amount, self.currency)

    def __mul__(self, factor: float) -> 'Money':
        return Money(self.amount * Decimal(str(factor)), self.currency)

    def __truediv__(self, other: 'Money') -> Decimal:
        if self.currency != other.currency:
            raise ValueError(f"Cannot divide {self.currency} by {other.currency}")
        return self.amount / other.amount

    def __lt__(self, other: 'Money') -> bool:
        if self.currency != other.currency:
            raise ValueError(f"Cannot compare {self.currency} and {other.currency}")
        return self.amount < other.amount

    def formatted(self, decimals: int = 2) -> str:
        symbols = {'USD': '$', 'INR': '₹', 'EUR': '€', 'GBP': '£', 'JPY': '¥'}
        sym = symbols.get(self.currency, self.currency + ' ')
        return f"{sym}{self.amount:,.{decimals}f}"


@dataclass(frozen=True)
class Percentage:
    """Value object for percentages."""
    value: Decimal  # Stored as decimal (0.05 = 5%)

    def __post_init__(self):
        if not isinstance(self.value, Decimal):
            object.__setattr__(self, 'value', Decimal(str(self.value)))

    @classmethod
    def from_pct(cls, pct: float) -> 'Percentage':
        return cls(Decimal(str(pct)) / Decimal('100'))

    def to_pct(self) -> float:
        return float(self.value * Decimal('100'))

    def formatted(self, decimals: int = 2) -> str:
        sign = '+' if self.value >= 0 else ''
        return f"{sign}{self.to_pct():.{decimals}f}%"


@dataclass(frozen=True)
class Timeframe:
    """Value object for chart timeframes."""
    value: str  # 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo

    VALID = ('1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '1wk', '1mo')

    def __post_init__(self):
        if self.value not in self.VALID:
            raise ValueError(f"Invalid timeframe: {self.value}. Valid: {self.VALID}")

    @property
    def is_intraday(self) -> bool:
        return self.value in ('1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h')

    @property
    def milliseconds(self) -> int:
        mapping = {
            '1m': 60_000, '2m': 120_000, '5m': 300_000,
            '15m': 900_000, '30m': 1_800_000, '60m': 3_600_000,
            '90m': 5_400_000, '1h': 3_600_000,
            '1d': 86_400_000, '1wk': 604_800_000, '1mo': 2_592_000_000,
        }
        return mapping.get(self.value, 86_400_000)


@dataclass(frozen=True)
class Range:
    """Value object for historical data ranges."""
    value: str  # 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max, ytd

    VALID = ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max', 'ytd')

    def __post_init__(self):
        if self.value not in self.VALID:
            raise ValueError(f"Invalid range: {self.value}. Valid: {self.VALID}")


@dataclass
class Candle:
    """OHLCV candle with metadata."""
    timestamp: int  # Unix milliseconds (UTC)
    open: float
    high: float
    low: float
    close: float
    volume: float

    # Optional computed
    vwap: Optional[float] = None
    trades: Optional[int] = None

    # Indicators (populated by indicator service)
    ema_9: Optional[float] = None
    ema_20: Optional[float] = None
    ema_50: Optional[float] = None
    ema_200: Optional[float] = None
    rsi_14: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None

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

    def to_volume_bar(self) -> dict:
        return {
            'time': self.timestamp // 1000,
            'value': self.volume,
            'color': 'rgba(38,166,154,0.6)' if self.is_bullish else 'rgba(239,83,80,0.6)',
        }


@dataclass
class StockOverview:
    """Complete stock overview with valuation metrics."""
    symbol: Symbol
    name: str
    exchange: str
    currency: str
    asset_type: AssetType

    # Price data
    current_price: float
    change: float
    change_pct: float
    volume: float
    timestamp: int

    # Valuation
    market_cap: Optional[float] = None
    enterprise_value: Optional[float] = None
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    peg_ratio: Optional[float] = None
    price_to_book: Optional[float] = None
    price_to_sales: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    ev_to_ebitda: Optional[float] = None

    # Profitability
    profit_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    roic: Optional[float] = None

    # Growth
    revenue_growth_yoy: Optional[float] = None
    earnings_growth_yoy: Optional[float] = None

    # Financial health
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    interest_coverage: Optional[float] = None

    # Dividends
    dividend_yield: Optional[float] = None
    dividend_rate: Optional[float] = None
    payout_ratio: Optional[float] = None

    # 52-week
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    avg_volume: Optional[float] = None

    # Analyst
    target_price: Optional[float] = None
    target_high: Optional[float] = None
    target_low: Optional[float] = None
    recommendation: Optional[str] = None
    num_analysts: Optional[int] = None

    # Metadata
    data_freshness: DataFreshness = DataFreshness.CACHED
    data_source: str = "unknown"
    last_updated: Optional[datetime] = None

    @property
    def distance_from_high_52w(self) -> Optional[Percentage]:
        if self.high_52w and self.current_price:
            return Percentage.from_pct((self.current_price - self.high_52w) / self.high_52w * 100)
        return None

    @property
    def distance_from_low_52w(self) -> Optional[Percentage]:
        if self.low_52w and self.current_price:
            return Percentage.from_pct((self.current_price - self.low_52w) / self.low_52w * 100)
        return None


@dataclass
class WatchlistItem:
    """Watchlist entry."""
    symbol: Symbol
    name: str
    added_at: datetime = field(default_factory=datetime.utcnow)
    notes: str = ""
    tags: List[str] = field(default_factory=list)
    alert_price_above: Optional[float] = None
    alert_price_below: Optional[float] = None
    alert_pct_change: Optional[float] = None

    # Runtime (not persisted)
    current_price: Optional[float] = None
    change_pct: Optional[float] = None


@dataclass
class AlertRule:
    """Price/indicator alert rule."""
    id: str
    user_id: str
    symbol: Symbol
    condition: str  # price_above, price_below, pct_change, rsi_above, rsi_below, macd_cross
    threshold: float
    timeframe: Timeframe = Timeframe('1d')
    enabled: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    triggered_at: Optional[datetime] = None
    cooldown_minutes: int = 60


@dataclass
class ScreenerFilter:
    """Single screener filter condition."""
    metric: str
    operator: str  # gt, lt, gte, lte, eq, between
    value: Any
    value2: Optional[Any] = None  # for 'between'


@dataclass
class ScreenerQuery:
    """Complete screener query."""
    universe: str
    filters: List[ScreenerFilter] = field(default_factory=list)
    logic: str = "AND"  # AND, OR
    sort_by: Optional[str] = None
    sort_desc: bool = True
    limit: int = 100
    offset: int = 0