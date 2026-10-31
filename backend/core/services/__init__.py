"""
Core Domain Services Package
Pure business logic with no external dependencies.
"""

from backend.core.services.calendar import (
    ExchangeCalendar,
    NSEExchangeCalendar,
    USExchangeCalendar,
    CryptoExchangeCalendar,
    ForexExchangeCalendar,
    get_calendar_for_symbol,
)

from backend.core.services.indicators import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_macd,
    calculate_bollinger_bands,
    apply_all_indicators,
    generate_technical_observations,
)

from backend.core.services.symbol_resolver import (
    PROVIDER_SYMBOL_ALIASES,
    POPULAR_UNIVERSE,
    get_companies_catalog,
    get_provider_symbol,
    resolve_symbol,
    search_assets,
    get_popular_universe,
)

from backend.core.services.tradingview_formatter import (
    format_currency,
    format_market_cap,
    format_price,
    format_change,
    format_volume,
    build_candle_data,
    build_volume_series,
    build_indicator_series,
    build_latest_quote,
    build_technical_snapshot,
    build_lightweight_charts_payload,
    get_range_note,
    calculate_dynamic_ttl,
)

__all__ = [
    # Calendar
    "ExchangeCalendar",
    "NSEExchangeCalendar",
    "USExchangeCalendar",
    "CryptoExchangeCalendar",
    "ForexExchangeCalendar",
    "get_calendar_for_symbol",
    # Indicators
    "calculate_sma",
    "calculate_ema",
    "calculate_rsi",
    "calculate_macd",
    "calculate_bollinger_bands",
    "apply_all_indicators",
    "generate_technical_observations",
    # Symbol Resolver
    "PROVIDER_SYMBOL_ALIASES",
    "POPULAR_UNIVERSE",
    "get_companies_catalog",
    "get_provider_symbol",
    "resolve_symbol",
    "search_assets",
    "get_popular_universe",
    # TradingView Formatter
    "format_currency",
    "format_market_cap",
    "format_price",
    "format_change",
    "format_volume",
    "build_candle_data",
    "build_volume_series",
    "build_indicator_series",
    "build_latest_quote",
    "build_technical_snapshot",
    "build_lightweight_charts_payload",
    "get_range_note",
    "calculate_dynamic_ttl",
]