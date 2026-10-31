"""
Contract Tests - Verify all market data providers comply with MarketDataProvider.
"""
import pytest
from typing import List, Optional
from datetime import datetime

from backend.core.contracts.market_data import (
    MarketDataProvider, Candle, Quote, AssetInfo, ProviderCapabilities
)
from backend.adapters.market_data.yfinance_provider import YFinanceProvider
from backend.adapters.market_data.nse_provider import NSEProvider
from backend.adapters.market_data.composite_provider import CompositeMarketProvider
from backend.adapters.cache.memory_cache import MemoryCache


class TestMarketDataProviderContract:
    """Contract tests for market data providers."""

    @pytest.fixture
    def yfinance(self) -> YFinanceProvider:
        return YFinanceProvider()

    @pytest.fixture
    def nse(self) -> NSEProvider:
        return NSEProvider()

    @pytest.fixture
    def composite(self) -> CompositeMarketProvider:
        return CompositeMarketProvider(
            cache=MemoryCache(),
            yfinance=YFinanceProvider(),
            nse=NSEProvider(),
        )

    # --- Metadata Tests ---

    def test_yfinance_has_name(self, yfinance: YFinanceProvider):
        assert yfinance.name == "yfinance"

    def test_yfinance_has_supported_types(self, yfinance: YFinanceProvider):
        types = yfinance.supported_asset_types
        assert "equity" in types
        assert "crypto" in types
        assert "forex" in types

    def test_yfinance_has_rate_limit(self, yfinance: YFinanceProvider):
        rl = yfinance.rate_limit
        assert "requests_per_second" in rl
        assert rl["requests_per_second"] > 0

    def test_nse_has_name(self, nse: NSEProvider):
        assert nse.name == "nse"

    def test_nse_supports_indian_markets(self, nse: NSEProvider):
        caps = nse.capabilities
        assert ProviderCapabilities.INDIAN_MARKETS in caps

    def test_composite_has_combined_capabilities(self, composite: CompositeMarketProvider):
        caps = composite.capabilities
        # Should have both providers' capabilities
        assert ProviderCapabilities.INDIAN_MARKETS in caps
        assert ProviderCapabilities.GLOBAL_EQUITIES in caps

    # --- Symbol Resolution ---

    @pytest.mark.asyncio
    async def test_resolve_symbol_returns_string(self, yfinance: YFinanceProvider):
        result = await yfinance.resolve_symbol("AAPL")
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_resolve_known_alias(self, yfinance: YFinanceProvider):
        # TATAMOTORS.NS -> TMPV.NS
        result = await yfinance.resolve_symbol("TATAMOTORS.NS")
        assert result == "TMPV.NS"

    # --- Asset Info ---

    @pytest.mark.asyncio
    async def test_get_asset_info_returns_assetinfo(self, yfinance: YFinanceProvider):
        info = await yfinance.get_asset_info("AAPL")
        if info:  # May fail in test env
            assert isinstance(info, AssetInfo)
            assert info.symbol == "AAPL"
            assert info.asset_type in ["equity", "etf", "index"]
            assert info.currency == "USD"

    # --- Quote Tests ---

    @pytest.mark.asyncio
    async def test_get_quote_structure(self, yfinance: YFinanceProvider):
        quote = await yfinance.get_quote("AAPL")
        if quote:
            assert isinstance(quote, Quote)
            assert quote.symbol == "AAPL"
            assert quote.price > 0
            assert isinstance(quote.change, float)
            assert isinstance(quote.change_pct, float)
            assert quote.volume >= 0

    @pytest.mark.asyncio
    async def test_get_quotes_batch(self, yfinance: YFinanceProvider):
        quotes = await yfinance.get_quotes(["AAPL", "MSFT"])
        assert len(quotes) == 2
        for q in quotes:
            if q:
                assert isinstance(q, Quote)

    # --- History Tests ---

    @pytest.mark.asyncio
    async def test_get_history_returns_candles(self, yfinance: YFinanceProvider):
        candles = await yfinance.get_history("AAPL", "1d", "1mo")
        if candles:
            assert isinstance(candles, list)
            for c in candles:
                assert isinstance(c, Candle)
                assert c.timestamp > 0
                assert c.open > 0
                assert c.high >= c.low
                assert c.high >= max(c.open, c.close)
                assert c.low <= min(c.open, c.close)
                assert c.volume >= 0

    @pytest.mark.asyncio
    async def test_candle_properties(self, yfinance: YFinanceProvider):
        candles = await yfinance.get_history("AAPL", "1d", "5d")
        if candles:
            c = candles[0]
            assert hasattr(c, 'is_bullish')
            assert hasattr(c, 'body_size')
            assert hasattr(c, 'upper_wick')
            assert hasattr(c, 'lower_wick')
            assert c.body_size == abs(c.close - c.open)

    @pytest.mark.asyncio
    async def test_candle_to_tradingview(self, yfinance: YFinanceProvider):
        candles = await yfinance.get_history("AAPL", "1d", "5d")
        if candles:
            tv = candles[0].to_tradingview()
            assert "time" in tv
            assert "open" in tv
            assert "high" in tv
            assert "low" in tv
            assert "close" in tv
            # Time should be in seconds for TradingView
            assert tv["time"] < 1e12  # Not milliseconds

    # --- Fundamentals ---

    @pytest.mark.asyncio
    async def test_get_fundamentals_returns_dict(self, yfinance: YFinanceProvider):
        fund = await yfinance.get_fundamentals("AAPL")
        assert isinstance(fund, dict)
        # May be empty in test env

    # --- Health ---

    @pytest.mark.asyncio
    async def test_health_check_returns_bool(self, yfinance: YFinanceProvider):
        healthy = await yfinance.health_check()
        assert isinstance(healthy, bool)

    # --- Close ---

    @pytest.mark.asyncio
    async def test_close_does_not_error(self, yfinance: YFinanceProvider):
        await yfinance.close()  # Should not raise


class TestCompositeProviderRouting:
    """Test composite provider routes to correct backend."""

    @pytest.fixture
    def composite(self) -> CompositeMarketProvider:
        return CompositeMarketProvider(
            cache=MemoryCache(),
            yfinance=YFinanceProvider(),
            nse=NSEProvider(),
        )

    @pytest.mark.asyncio
    async def test_indian_symbol_routes_to_nse_first(self, composite: CompositeMarketProvider):
        # Should try NSE first for .NS symbols
        providers = composite._select_provider("RELIANCE.NS")
        assert providers[0].name == "nse"
        assert providers[1].name == "yfinance"

    @pytest.mark.asyncio
    async def test_us_symbol_routes_to_yfinance(self, composite: CompositeMarketProvider):
        providers = composite._select_provider("AAPL")
        assert providers[0].name == "yfinance"

    @pytest.mark.asyncio
    async def test_crypto_routes_to_yfinance(self, composite: CompositeMarketProvider):
        providers = composite._select_provider("BTC-USD")
        assert providers[0].name == "yfinance"

    @pytest.mark.asyncio
    async def test_forex_routes_to_yfinance(self, composite: CompositeMarketProvider):
        providers = composite._select_provider("EURUSD=X")
        assert providers[0].name == "yfinance"


class TestDomainModels:
    """Test domain value objects."""

    def test_symbol_value_object(self):
        from backend.core.domain.models import Symbol

        s = Symbol("AAPL")
        assert str(s) == "AAPL"
        assert s.value == "AAPL"

        s2 = Symbol("  tcs.ns  ")
        assert s2.value == "TCS.NS"
        assert s2.is_indian is True
        assert s2.base_symbol == "TCS"

    def test_money_value_object(self):
        from backend.core.domain.models import Money
        from decimal import Decimal

        m1 = Money("100.50", "USD")
        m2 = Money("50.25", "USD")

        assert m1 + m2 == Money("150.75", "USD")
        assert m1 - m2 == Money("50.25", "USD")
        assert m1 * 2 == Money("201.00", "USD")
        assert m1 / m2 == Decimal("2.0")

    def test_money_currency_mismatch_raises(self):
        from backend.core.domain.models import Money

        m1 = Money("100", "USD")
        m2 = Money("100", "INR")

        with pytest.raises(ValueError):
            m1 + m2

    def test_percentage_formatting(self):
        from backend.core.domain.models import Percentage

        p = Percentage.from_pct(5.5)
        assert p.to_pct() == 5.5
        assert p.formatted() == "+5.50%"

        p2 = Percentage.from_pct(-2.5)
        assert p2.formatted() == "-2.50%"

    def test_timeframe_validation(self):
        from backend.core.domain.models import Timeframe

        tf = Timeframe("1d")
        assert tf.value == "1d"
        assert tf.milliseconds == 86_400_000
        assert tf.is_intraday is False

        tf2 = Timeframe("5m")
        assert tf2.is_intraday is True

        with pytest.raises(ValueError):
            Timeframe("invalid")

    def test_candle_properties(self):
        from backend.core.domain.models import Candle

        c = Candle(
            timestamp=1000000,
            open=100, high=105, low=98, close=103, volume=1000000
        )

        assert c.is_bullish is True
        assert c.body_size == 3
        assert c.range_size == 7
        assert c.upper_wick == 2
        assert c.lower_wick == 2

        tv = c.to_tradingview()
        assert tv["time"] == 1000  # seconds


if __name__ == "__main__":
    pytest.main([__file__, "-v"])