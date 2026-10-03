"""
Mara Market Data Provider Abstraction & Data Trust Engine
Decoupled provider interface separating exchange session state from data freshness.

Capabilities:
- MarketDataProvider (Abstract Base Class)
- YahooFinanceProvider (Default primary provider for multi-asset market data)
- Strict Epistemological Contract:
  Never label delayed provider feeds as "LIVE".
  Market session state != Data freshness state.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import datetime
from .market_calendar import get_calendar_for_symbol


class MarketDataProvider(ABC):
    """
    Abstract interface for financial market data providers.
    Enables future plug-in of genuine real-time providers (e.g. licensed NSE feeds,
    Interactive Brokers, Alpaca, Polygon, Kaiko) without altering the chart engine.
    """

    @abstractmethod
    def get_quote(self, symbol: str) -> Dict[str, Any]:
        """Fetch current valuation, price, change, day envelope, and session quote."""
        raise NotImplementedError

    @abstractmethod
    def get_candles(self, symbol: str, interval: str = "1m", range_param: str = "1d") -> Dict[str, Any]:
        """Fetch OHLCV candlestick bars and volume for specified interval and timeframe."""
        raise NotImplementedError

    @abstractmethod
    def get_market_status(self, symbol: str) -> Dict[str, Any]:
        """Retrieve exchange calendar status, timezone, trading hours, and session."""
        raise NotImplementedError

    @abstractmethod
    def get_freshness(self, symbol: str, source: str) -> str:
        """
        Determine epistemologically honest data freshness:
        LIVE | DELAYED | CACHED | STALE | UNAVAILABLE
        """
        raise NotImplementedError


class YahooFinanceProvider(MarketDataProvider):
    """
    Yahoo Finance / yfinance implementation of MarketDataProvider.
    Accurately classifies data freshness as DELAYED for equities and CACHED when closed.
    """

    def __init__(self, data_pipeline_module):
        self.pipeline = data_pipeline_module

    def get_market_status(self, symbol: str) -> Dict[str, Any]:
        calendar = get_calendar_for_symbol(symbol)
        session_info = calendar.get_session_state()
        session = session_info["session"]

        # Data freshness rule:
        # yfinance equity feeds are delayed by at least 15 minutes during active sessions.
        # When closed or on holiday, data is CACHED.
        # Under no circumstance is standard yfinance equity data labeled as LIVE.
        if session in ["OPEN", "PRE_MARKET", "POST_MARKET"]:
            freshness = "DELAYED"
        elif session in ["CLOSED", "HOLIDAY"]:
            freshness = "CACHED"
        else:
            freshness = "UNAVAILABLE"

        return {
            "symbol": symbol,
            "exchange": session_info["exchange"],
            "timezone": session_info["timezone"],
            "currency": session_info["currency"],
            "session": session,
            "market_status": session,  # Backward compatibility for Phase 2C clients
            "freshness": freshness,
            "source": "Yahoo Finance",
            "session_start": session_info.get("session_start"),
            "session_end": session_info.get("session_end"),
            "reason": session_info.get("reason"),
        }

    def get_freshness(self, symbol: str, source: str = "Yahoo Finance") -> str:
        status = self.get_market_status(symbol)
        return status["freshness"]

    def get_quote(self, symbol: str) -> Dict[str, Any]:
        return self.pipeline.get_stock_overview(symbol)

    def get_candles(self, symbol: str, interval: str = "1m", range_param: str = "1d") -> Dict[str, Any]:
        history = self.pipeline.get_stock_history(symbol=symbol, timeframe=range_param, interval=interval)
        status = self.get_market_status(symbol)

        # Merge standardized contract fields
        history["session"] = status["session"]
        history["market_status"] = status["session"]
        history["freshness"] = status["freshness"]
        history["source"] = status["source"]
        history["exchange"] = status["exchange"]
        history["timezone"] = status["timezone"]
        history["currency"] = status["currency"]
        return history
