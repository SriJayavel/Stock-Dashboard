"""
Markets Feature - Service Implementation
Provides market overview data with proper caching and fallback.
"""
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider
from backend.core.domain.models import Symbol
from backend.core.services.symbol_resolver import get_popular_universe

logger = logging.getLogger(__name__)


class MarketService:
    """Market data service using dependency-injected protocols."""

    def __init__(self, cache: CacheProtocol, market_data: MarketDataProvider):
        self._cache = cache
        self._market_data = market_data

    async def get_overview(self, refresh: bool = False) -> Dict[str, Any]:
        """Get market overview with indices, sectors, and macro data."""
        # Check cache first
        if not refresh:
            cached = await self._cache.get("market:overview", "full")
            if cached:
                cached["data_freshness"] = "cached"
                return cached

        # Fetch fresh data
        data = await self._fetch_market_overview()

        # Cache for next time
        await self._cache.set("market:overview", "full", data, ttl=300)
        return data

    async def _fetch_market_overview(self) -> Dict[str, Any]:
        """Fetch comprehensive market overview from providers."""
        try:
            # Get benchmark indices
            benchmark_symbols = [
                "^NSEI", "^NSEBANK", "^BSESN",  # India
                "^GSPC", "^DJI", "^IXIC", "^RUT",  # US
                "^FTSE", "^GDAXI", "^FCHI",  # Europe
                "^N225", "^HSI", "^STI", "^KS11",  # Asia
            ]

            # Get quotes for all benchmarks
            quotes = await self._market_data.get_quotes(benchmark_symbols)

            # Build macro categories
            macro = self._categorize_benchmarks(benchmark_symbols, quotes)

            # Get sector performance (using sector ETFs as proxy)
            sector_data = await self._fetch_sector_performance()

            # Get macro assets (forex, commodities, crypto)
            macro_assets = await self._fetch_macro_assets()

            # Determine market status
            market_status = self._get_market_status()

            # Build hero data (NIFTY 50 as primary)
            hero = self._build_hero(quotes, benchmark_symbols)

            return {
                "macro": macro,
                "sectors": sector_data,
                "macro_assets": macro_assets,
                "market_status": market_status,
                "hero": hero,
                "data_freshness": "live",
                "feed_health": self._assess_feed_health(quotes),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"Market overview fetch failed: {e}")
            # Return stale cache if available
            stale = await self._cache.get("market:overview_stale", "full")
            if stale:
                stale = dict(stale)
                stale["is_stale"] = True
                stale["data_freshness"] = "stale"
                return stale
            # Return minimal structure
            return self._empty_overview()

    def _categorize_benchmarks(self, symbols: List[str], quotes: List) -> Dict[str, List[Dict]]:
        """Categorize benchmarks by region."""
        regions = {
            "India": ["^NSEI", "^NSEBANK", "^BSESN", "^CNXIT", "^CNXAUTO", "^CNXPHARMA"],
            "Americas": ["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX"],
            "Europe": ["^FTSE", "^GDAXI", "^FCHI", "^STOXX50E"],
            "Asia": ["^N225", "^HSI", "^STI", "^KS11", "^TWII", "^AXJO"],
        }

        macro = {}
        for region, region_symbols in regions.items():
            macro[region] = []
            for sym in region_symbols:
                idx = symbols.index(sym) if sym in symbols else -1
                if idx >= 0 and quotes[idx]:
                    q = quotes[idx]
                    macro[region].append({
                        "symbol": sym,
                        "name": self._get_index_name(sym),
                        "price": q.price,
                        "change": q.change,
                        "change_pct": q.change_pct,
                        "volume": q.volume,
                        "high": q.high_52w,
                        "low": q.low_52w,
                        "timestamp": q.timestamp,
                        "region": region.lower(),
                    })
                else:
                    # Placeholder for missing data
                    macro[region].append({
                        "symbol": sym,
                        "name": self._get_index_name(sym),
                        "price": None,
                        "change": None,
                        "change_pct": None,
                        "volume": 0,
                        "high": None,
                        "low": None,
                        "timestamp": int(datetime.now().timestamp() * 1000),
                        "region": region.lower(),
                    })
        return macro

    def _get_index_name(self, symbol: str) -> str:
        names = {
            "^NSEI": "NIFTY 50", "^NSEBANK": "NIFTY BANK", "^BSESN": "SENSEX",
            "^CNXIT": "NIFTY IT", "^CNXAUTO": "NIFTY AUTO", "^CNXPHARMA": "NIFTY PHARMA",
            "^GSPC": "S&P 500", "^DJI": "Dow Jones", "^IXIC": "NASDAQ", "^RUT": "Russell 2000", "^VIX": "VIX",
            "^FTSE": "FTSE 100", "^GDAXI": "DAX", "^FCHI": "CAC 40", "^STOXX50E": "EURO STOXX 50",
            "^N225": "Nikkei 225", "^HSI": "Hang Seng", "^STI": "STI", "^KS11": "KOSPI", "^TWII": "TWSE", "^AXJO": "ASX 200",
        }
        return names.get(symbol, symbol)

    async def _fetch_sector_performance(self) -> List[Dict]:
        """Fetch sector performance using sector ETFs/indices."""
        sector_symbols = {
            "Financial Services": ["^NSEBANK", "ICICIBANK.NS", "HDFCBANK.NS"],
            "Information Technology": ["^CNXIT", "TCS.NS", "INFY.NS"],
            "Oil & Gas": ["RELIANCE.NS", "ONGC.NS"],
            "Automobile": ["^CNXAUTO", "MARUTI.NS", "TATAMOTORS.NS"],
            "Pharma": ["^CNXPHARMA", "SUNPHARMA.NS", "DRREDDY.NS"],
            "FMCG": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS"],
            "Metals": ["TATASTEEL.NS", "HINDALCO.NS", "JSWSTEEL.NS"],
            "Power": ["NTPC.NS", "POWERGRID.NS"],
        }

        all_symbols = []
        for symbols in sector_symbols.values():
            all_symbols.extend(symbols)

        quotes = await self._market_data.get_quotes(all_symbols)
        quote_map = dict(zip(all_symbols, quotes))

        sectors = []
        for sector_name, symbols in sector_symbols.items():
            changes = []
            for sym in symbols:
                q = quote_map.get(sym)
                if q and q.change_pct is not None:
                    changes.append(q.change_pct)

            avg_change = sum(changes) / len(changes) if changes else 0
            breadth = sum(1 for c in changes if c > 0)

            sectors.append({
                "name": sector_name,
                "change_pct": round(avg_change, 2),
                "breadth": f"{breadth}/{len(changes)}",
                "symbols": symbols[:3],  # Top 3 representative symbols
            })

        return sectors

    async def _fetch_macro_assets(self) -> Dict[str, List[Dict]]:
        """Fetch forex, commodities, and crypto data."""
        macro_symbols = {
            "forex": ["USDINR=X", "EURUSD=X", "GBPUSD=X", "USDJPY=X"],
            "commodities": ["GC=F", "CL=F", "SI=F", "NG=F"],
            "crypto": ["BTC-USD", "ETH-USD", "SOL-USD"],
        }

        result = {}
        for category, symbols in macro_symbols.items():
            quotes = await self._market_data.get_quotes(symbols)
            result[category] = []
            for sym, q in zip(symbols, quotes):
                if q:
                    result[category].append({
                        "symbol": sym,
                        "name": self._get_macro_name(sym),
                        "price": q.price,
                        "change": q.change,
                        "change_pct": q.change_pct,
                        "timestamp": q.timestamp,
                    })
                else:
                    result[category].append({
                        "symbol": sym,
                        "name": self._get_macro_name(sym),
                        "price": None,
                        "change": None,
                        "change_pct": None,
                        "timestamp": int(datetime.now().timestamp() * 1000),
                    })
        return result

    def _get_macro_name(self, symbol: str) -> str:
        names = {
            "USDINR=X": "USD/INR", "EURUSD=X": "EUR/USD", "GBPUSD=X": "GBP/USD", "USDJPY=X": "USD/JPY",
            "GC=F": "Gold", "CL=F": "Crude Oil", "SI=F": "Silver", "NG=F": "Natural Gas",
            "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
        }
        return names.get(symbol, symbol)

    def _build_hero(self, quotes: List, symbols: List[str]) -> Dict[str, Any]:
        """Build hero card data for NIFTY 50."""
        nifty_idx = symbols.index("^NSEI") if "^NSEI" in symbols else -1
        if nifty_idx >= 0 and quotes[nifty_idx]:
            q = quotes[nifty_idx]
            return {
                "symbol": "^NSEI",
                "name": "NIFTY 50",
                "price": q.price,
                "change": q.change,
                "change_pct": q.change_pct,
                "high": q.high_52w,
                "low": q.low_52w,
                "volume": q.volume,
                "timestamp": q.timestamp,
                "source": "NSE Direct",
                "status": "available",
            }
        return {
            "symbol": "^NSEI",
            "name": "NIFTY 50",
            "price": None,
            "change": None,
            "change_pct": None,
            "high": None,
            "low": None,
            "volume": 0,
            "timestamp": int(datetime.now().timestamp() * 1000),
            "source": "NSE Direct",
            "status": "unavailable",
        }

    def _get_market_status(self) -> Dict[str, Any]:
        """Get current market session status."""
        from zoneinfo import ZoneInfo
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        is_weekday = now_ist.weekday() < 5
        curr_time = now_ist.time()

        if is_weekday:
            if datetime.time(9, 15) <= curr_time <= datetime.time(15, 30):
                status = "OPEN"
            elif datetime.time(9, 0) <= curr_time < datetime.time(9, 15):
                status = "PRE-MARKET"
            else:
                status = "CLOSED"
        else:
            status = "CLOSED"

        return {
            "nse": status,
            "nyse": self._get_us_market_status(),
            "lse": self._get_lse_status(),
            "tyo": self._get_tyo_status(),
        }

    def _get_us_market_status(self) -> str:
        from zoneinfo import ZoneInfo
        now_ny = datetime.now(ZoneInfo("America/New_York"))
        is_weekday = now_ny.weekday() < 5
        curr_time = now_ny.time()
        if is_weekday:
            if datetime.time(9, 30) <= curr_time <= datetime.time(16, 0):
                return "OPEN"
            elif datetime.time(4, 0) <= curr_time < datetime.time(9, 30):
                return "PRE"
        return "CLOSED"

    def _get_lse_status(self) -> str:
        from zoneinfo import ZoneInfo
        now_lon = datetime.now(ZoneInfo("Europe/London"))
        is_weekday = now_lon.weekday() < 5
        curr_time = now_lon.time()
        if is_weekday:
            if datetime.time(8, 0) <= curr_time <= datetime.time(16, 30):
                return "OPEN"
        return "CLOSED"

    def _get_tyo_status(self) -> str:
        from zoneinfo import ZoneInfo
        now_tyo = datetime.now(ZoneInfo("Asia/Tokyo"))
        is_weekday = now_tyo.weekday() < 5
        curr_time = now_tyo.time()
        if is_weekday:
            if datetime.time(9, 0) <= curr_time <= datetime.time(15, 0):
                return "OPEN"
            elif datetime.time(11, 30) <= curr_time <= datetime.time(12, 30):
                return "LUNCH"
        return "CLOSED"

    def _assess_feed_health(self, quotes: List) -> Dict[str, str]:
        """Assess health of data feeds by category."""
        available = sum(1 for q in quotes if q and q.price is not None)
        total = len(quotes)
        if available == total:
            return {"indices": "LIVE", "sectors": "LIVE", "macro": "LIVE"}
        elif available > total * 0.5:
            return {"indices": "PARTIAL", "sectors": "PARTIAL", "macro": "PARTIAL"}
        return {"indices": "STALE", "sectors": "STALE", "macro": "STALE"}

    def _empty_overview(self) -> Dict[str, Any]:
        """Return empty but valid overview structure."""
        return {
            "macro": {"India": [], "Americas": [], "Europe": [], "Asia": []},
            "sectors": [],
            "macro_assets": {"forex": [], "commodities": [], "crypto": []},
            "market_status": {"nse": "CLOSED", "nyse": "CLOSED", "lse": "CLOSED", "tyo": "CLOSED"},
            "hero": {"symbol": "^NSEI", "name": "NIFTY 50", "price": None, "status": "unavailable"},
            "data_freshness": "unavailable",
            "feed_health": {"indices": "OFFLINE", "sectors": "OFFLINE", "macro": "OFFLINE"},
            "timestamp": datetime.now().isoformat(),
        }

    async def refresh(self) -> Dict[str, Any]:
        """Force refresh market overview."""
        try:
            data = await self._fetch_market_overview()
            await self._cache.set("market:overview", "full", data, ttl=300)
            await self._cache.set("market:overview_stale", "full", data, ttl=3600)
            return {"status": "success", "data": data}
        except Exception as e:
            logger.error(f"Market refresh failed: {e}")
            return {"status": "error", "message": str(e)}