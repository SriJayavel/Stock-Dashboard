"""
YFinance Market Data Provider Adapter.
Implements MarketDataProvider protocol using yfinance library.
"""
import asyncio
import logging
import yfinance as yf
import pandas as pd
from typing import Any, Optional, List
from datetime import datetime
from functools import lru_cache

from backend.core.contracts.market_data import (
    MarketDataProvider, Candle, Quote, AssetInfo, ProviderCapabilities
)
from backend.config import settings

logger = logging.getLogger("yfinance_provider")


class YFinanceProvider:
    """YFinance implementation of MarketDataProvider."""

    name = "yfinance"
    supported_asset_types = ["equity", "etf", "index", "crypto", "forex", "commodity"]
    supported_exchanges = ["US", "NASDAQ", "NYSE", "LSE", "TSE", "HKEX", "ASX", "TSX", "FWB", "EPA", "NSE", "BSE"]
    rate_limit = {"requests_per_second": 10, "burst": 20}

    def __init__(self):
        self._session = None

    async def _get_ticker(self, symbol: str) -> yf.Ticker:
        """Get yfinance Ticker object (cached)."""
        # yfinance Ticker is lightweight, create fresh each time
        return yf.Ticker(symbol)

    # --- Metadata ---

    @property
    def capabilities(self) -> List[str]:
        return [
            ProviderCapabilities.REAL_TIME_QUOTES,
            ProviderCapabilities.INTRADAY_HISTORY,
            ProviderCapabilities.EXTENDED_HOURS,
            ProviderCapabilities.FUNDAMENTALS,
            ProviderCapabilities.DIVIDENDS_SPLITS,
            ProviderCapabilities.GLOBAL_EQUITIES,
            ProviderCapabilities.CRYPTO,
            ProviderCapabilities.FOREX,
        ]

    # --- Asset Discovery ---

    async def search_symbols(self, query: str, limit: int = 20) -> List[AssetInfo]:
        """Search symbols using yfinance."""
        # yfinance doesn't have built-in search, use a simple approach
        # In production, you'd use a proper search API
        try:
            ticker = await self._get_ticker(query.upper())
            info = ticker.info
            if info and info.get('symbol'):
                return [self._info_to_asset(info)]
        except Exception:
            pass
        return []

    async def get_asset_info(self, symbol: str) -> Optional[AssetInfo]:
        """Get asset metadata."""
        try:
            ticker = await self._get_ticker(symbol)
            info = ticker.info
            if info:
                return self._info_to_asset(info)
        except Exception as e:
            logger.debug(f"Failed to get asset info for {symbol}: {e}")
        return None

    async def resolve_symbol(self, symbol: str) -> Optional[str]:
        """Resolve canonical to provider symbol (yfinance uses same symbols mostly)."""
        # Handle known aliases
        aliases = {
            "TATAMOTORS.NS": "TMPV.NS",
        }
        return aliases.get(symbol, symbol)

    def _info_to_asset(self, info: dict) -> AssetInfo:
        """Convert yfinance info dict to AssetInfo."""
        return AssetInfo(
            symbol=info.get('symbol', ''),
            name=info.get('longName') or info.get('shortName') or '',
            exchange=info.get('exchange', ''),
            asset_type=self._map_asset_type(info.get('quoteType', '')),
            currency=info.get('currency', 'USD'),
            country=info.get('country', ''),
            timezone=info.get('timeZoneFullName', 'UTC'),
            market_hours=self._get_market_hours(info.get('exchange', '')),
            sector=info.get('sector'),
            industry=info.get('industry'),
            website=info.get('website'),
            description=info.get('longBusinessSummary'),
        )

    def _map_asset_type(self, quote_type: str) -> str:
        mapping = {
            'EQUITY': 'equity',
            'ETF': 'etf',
            'INDEX': 'index',
            'CRYPTOCURRENCY': 'crypto',
            'CURRENCY': 'forex',
            'COMMODITY': 'commodity',
        }
        return mapping.get(quote_type.upper(), 'equity')

    def _get_market_hours(self, exchange: str) -> dict:
        hours = {
            'NASDAQ': {"open": "09:30", "close": "16:00", "timezone": "America/New_York"},
            'NYSE': {"open": "09:30", "close": "16:00", "timezone": "America/New_York"},
            'NSE': {"open": "09:15", "close": "15:30", "timezone": "Asia/Kolkata"},
            'BSE': {"open": "09:15", "close": "15:30", "timezone": "Asia/Kolkata"},
            'LSE': {"open": "08:00", "close": "16:30", "timezone": "Europe/London"},
            'TSE': {"open": "09:00", "close": "15:00", "timezone": "Asia/Tokyo"},
        }
        return hours.get(exchange, {"open": "09:00", "close": "17:00", "timezone": "UTC"})

    # --- Quotes ---

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote."""
        try:
            ticker = await self._get_ticker(symbol)
            # Use fast_info for speed
            fast_info = ticker.fast_info
            if not fast_info or fast_info.get('last_price') is None:
                # Fallback to regular info
                info = ticker.info
                return self._info_to_quote(info, symbol)

            return Quote(
                symbol=symbol,
                price=fast_info.get('last_price', 0),
                change=fast_info.get('last_price', 0) - fast_info.get('previous_close', 0),
                change_pct=((fast_info.get('last_price', 0) - fast_info.get('previous_close', 0))
                          / fast_info.get('previous_close', 1) * 100) if fast_info.get('previous_close') else 0,
                volume=fast_info.get('volume', 0),
                timestamp=int(datetime.now().timestamp() * 1000),
                high_52w=fast_info.get('year_high'),
                low_52w=fast_info.get('year_low'),
                market_cap=fast_info.get('market_cap'),
                prev_close=fast_info.get('previous_close'),
            )
        except Exception as e:
            logger.debug(f"Failed to get quote for {symbol}: {e}")
        return None

    def _info_to_quote(self, info: dict, symbol: str) -> Optional[Quote]:
        """Convert yfinance info to Quote."""
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        prev_close = info.get('previousClose')
        if price is None or prev_close is None:
            return None

        return Quote(
            symbol=symbol,
            price=price,
            change=price - prev_close,
            change_pct=((price - prev_close) / prev_close * 100) if prev_close else 0,
            volume=info.get('volume', 0),
            timestamp=int(datetime.now().timestamp() * 1000),
            bid=info.get('bid'),
            ask=info.get('ask'),
            bid_size=info.get('bidSize'),
            ask_size=info.get('askSize'),
            high_52w=info.get('fiftyTwoWeekHigh'),
            low_52w=info.get('fiftyTwoWeekLow'),
            market_cap=info.get('marketCap'),
            pe_ratio=info.get('trailingPE'),
            prev_close=prev_close,
            pe_trailing=info.get('trailingPE'),
            pe_forward=info.get('forwardPE'),
            pb_ratio=info.get('priceToBook'),
            ev_ebitda=info.get('enterpriseToEbitda'),
            peg_ratio=info.get('pegRatio'),
            dividend_yield=info.get('dividendYield'),
            roe=info.get('returnOnEquity'),
            roa=info.get('returnOnAssets'),
            profit_margin=info.get('profitMargins'),
            debt_to_equity=info.get('debtToEquity'),
            current_ratio=info.get('currentRatio'),
            target_mean=info.get('targetMeanPrice'),
            recommendation=info.get('recommendationKey'),
            avg_volume=info.get('averageVolume'),
        )

    async def get_quotes(self, symbols: List[str]) -> List[Optional[Quote]]:
        """Get quotes for multiple symbols (batched)."""
        # yfinance doesn't support true batch quotes, do concurrent
        tasks = [self.get_quote(s) for s in symbols]
        return await asyncio.gather(*tasks)

    # --- Historical Data ---

    async def get_history(
        self,
        symbol: str,
        interval: str,
        range_: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[Candle]:
        """Get historical candles."""
        try:
            ticker = await self._get_ticker(symbol)

            # Convert interval/range to yfinance format
            yf_interval = self._convert_interval(interval)
            yf_period = self._convert_range(range_)

            # Use history method
            if start and end:
                hist = ticker.history(start=start, end=end, interval=yf_interval)
            else:
                hist = ticker.history(period=yf_period, interval=yf_interval)

            if hist.empty:
                return []

            return self._dataframe_to_candles(hist)
        except Exception as e:
            logger.error(f"Failed to get history for {symbol}: {e}")
            return []

    async def get_intraday(
        self,
        symbol: str,
        interval: str = "1m",
        days: int = 1,
    ) -> List[Candle]:
        """Get recent intraday data."""
        # Map days to period
        period_map = {1: "1d", 5: "5d", 7: "1wk", 30: "1mo"}
        period = period_map.get(days, "1d")
        return await self.get_history(symbol, interval, period)

    def _convert_interval(self, interval: str) -> str:
        mapping = {
            '1m': '1m', '2m': '2m', '5m': '5m', '15m': '15m',
            '30m': '30m', '60m': '1h', '90m': '1h', '1h': '1h',
            '1d': '1d', '1wk': '1wk', '1mo': '1mo',
        }
        return mapping.get(interval, '1d')

    def _convert_range(self, range_: str) -> str:
        mapping = {
            '1d': '1d', '5d': '5d', '1mo': '1mo', '3mo': '3mo',
            '6mo': '6mo', '1y': '1y', '2y': '2y', '5y': '5y',
            'max': 'max', 'ytd': 'ytd',
        }
        return mapping.get(range_, '1y')

    def _dataframe_to_candles(self, df: pd.DataFrame) -> List[Candle]:
        """Convert pandas DataFrame to Candle list."""
        candles = []
        for idx, row in df.iterrows():
            candles.append(Candle(
                timestamp=int(idx.timestamp() * 1000),
                open=float(row['Open']),
                high=float(row['High']),
                low=float(row['Low']),
                close=float(row['Close']),
                volume=float(row['Volume']),
            ))
        return candles

    # --- Fundamentals ---

    async def get_fundamentals(self, symbol: str) -> dict:
        """Get fundamental data."""
        try:
            ticker = await self._get_ticker(symbol)
            info = ticker.info
            financials = ticker.financials
            balance_sheet = ticker.balance_sheet
            cashflow = ticker.cashflow

            return {
                'info': info,
                'financials': financials.to_dict() if financials is not None else {},
                'balance_sheet': balance_sheet.to_dict() if balance_sheet is not None else {},
                'cashflow': cashflow.to_dict() if cashflow is not None else {},
            }
        except Exception as e:
            logger.error(f"Failed to get fundamentals for {symbol}: {e}")
            return {}

    async def get_dividends(self, symbol: str) -> List[dict]:
        try:
            ticker = await self._get_ticker(symbol)
            divs = ticker.dividends
            if divs is not None and not divs.empty:
                return [{'date': str(idx.date()), 'amount': float(val)} for idx, val in divs.items()]
        except Exception:
            pass
        return []

    async def get_splits(self, symbol: str) -> List[dict]:
        try:
            ticker = await self._get_ticker(symbol)
            splits = ticker.splits
            if splits is not None and not splits.empty:
                return [{'date': str(idx.date()), 'ratio': float(val)} for idx, val in splits.items()]
        except Exception:
            pass
        return []

    # --- Health ---

    async def health_check(self) -> bool:
        try:
            ticker = await self._get_ticker("AAPL")
            _ = ticker.fast_info
            return True
        except Exception:
            return False

    async def close(self) -> None:
        # yfinance doesn't need explicit cleanup
        pass