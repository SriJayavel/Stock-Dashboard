"""
Markets Feature - Service Implementation
Provides market overview data with proper caching and fallback.
"""
import logging
import asyncio
from datetime import datetime, time
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
                # Ensure timestamps exist for frontend refresh detection
                cached.setdefault("last_attempted_at", datetime.now().isoformat())
                cached.setdefault("retrieved_at", datetime.now().isoformat())
                return cached

        # Fetch fresh data
        data = await self._fetch_market_overview()

        # Cache for next time - include all timestamps for refresh detection
        await self._cache.set("market:overview", "full", data, ttl=300)
        await self._cache.set("market:overview_stale", "full", data, ttl=3600)
        return data

    async def _fetch_market_overview(self) -> Dict[str, Any]:
        """Fetch comprehensive market overview from providers.

        Uses provider's get_market_overview() for caching, then enriches
        with sector data. Returns structured data consumed by frontend.
        """
        try:
            # Use provider's cached market overview (30s TTL, deduped, batched)
            overview = await self._market_data.get_market_overview()

            # Extract provider data
            provider_indices = overview.get("indices", {})
            provider_macro = overview.get("macro", {})

            # Build unified macro structure from provider data
            # Provider returns indices as {symbol: dict} and macro as {category: {symbol: dict}}
            # Frontend expects macro as {category: [list of dicts]}
            indices_flat = list(provider_indices.values())

            def _macro_to_list(category_data):
                """Convert provider's {symbol: dict} to list of dicts."""
                if isinstance(category_data, dict):
                    return list(category_data.values())
                if isinstance(category_data, list):
                    return category_data
                return []

            # Ensure all required regions exist
            unified_macro = {
                "Indices": indices_flat,
                "India": _macro_to_list(provider_macro.get("India", [])),
                "Americas": _macro_to_list(provider_macro.get("Americas", [])),
                "Europe": _macro_to_list(provider_macro.get("Europe", [])),
                "Asia": _macro_to_list(provider_macro.get("Asia", [])),
                "Forex": _macro_to_list(provider_macro.get("Forex", [])),
                "Commodities": _macro_to_list(provider_macro.get("Commodities", [])),
                "Crypto": _macro_to_list(provider_macro.get("Crypto", [])),
            }

            # Get sector performance (using sector ETFs as proxy)
            sector_data = await self._fetch_sector_performance()

            # Determine market status
            market_status = self._get_market_status()

            # Build hero data from unified macro
            hero = self._build_hero_from_macro(unified_macro)

            # Collect all quotes for feed health assessment
            all_items = (
                indices_flat
                + unified_macro.get("Forex", [])
                + unified_macro.get("Commodities", [])
                + unified_macro.get("Crypto", [])
            )
            available_count = sum(1 for item in all_items if item.get("price") is not None)

            return {
                "macro": unified_macro,
                "sectors": sector_data,
                "market_status": market_status,
                "hero": hero,
                "data_freshness": "live",
                "feed_health": self._assess_feed_health(len(all_items), available_count),
                "retrieved_at": overview.get("retrieved_at", datetime.now().isoformat()),
                "last_attempted_at": datetime.now().isoformat(),
                "timestamp": datetime.now().isoformat(),
                "source": overview.get("source", "unknown"),
            }
        except Exception as e:
            logger.error(f"Market overview fetch failed: {e}")
            # Return stale cache if available
            stale = await self._cache.get("market:overview_stale", "full")
            if stale:
                stale = dict(stale)
                # Normalize old cache format (macro_assets -> macro)
                if "macro_assets" in stale and "macro" not in stale:
                    stale["macro"] = {
                        "Indices": [],
                        "India": [], "Americas": [], "Europe": [], "Asia": [],
                        "Forex": stale["macro_assets"].get("Forex", []),
                        "Commodities": stale["macro_assets"].get("Commodities", []),
                        "Crypto": stale["macro_assets"].get("Crypto", []),
                    }
                stale["is_stale"] = True
                stale["data_freshness"] = "stale"
                # Ensure timestamps exist for refresh detection
                if "last_attempted_at" not in stale:
                    stale["last_attempted_at"] = datetime.now().isoformat()
                if "retrieved_at" not in stale:
                    stale["retrieved_at"] = datetime.now().isoformat()
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
        # BENCHMARK_SECTOR definition with Indian and US constituents separated
        BENCHMARK_SECTORS = {
            "Financial Services": {
                "indian_proxy": "^NSEBANK",
                "benchmark_etf": "XLF",
                "constituents": ["ICICIBANK.NS", "HDFCBANK.NS", "SBIN.NS"],
                "us_constituents": ["JPM", "BAC", "GS"],
            },
            "Information Technology": {
                "indian_proxy": "^CNXIT",
                "benchmark_etf": "XLK",
                "constituents": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS"],
                "us_constituents": ["NVDA", "AAPL", "MSFT", "GOOGL"],
            },
            "Oil & Gas": {
                "indian_proxy": "^CNXENERGY",
                "benchmark_etf": "XLE",
                "constituents": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS"],
                "us_constituents": ["XOM", "CVX", "COP"],
            },
            "Automobile": {
                "indian_proxy": "^CNXAUTO",
                "benchmark_etf": "CARZ",
                "constituents": ["MARUTI.NS", "TATAMOTORS.NS", "M&M.NS"],
                "us_constituents": ["TSLA", "F", "GM"],
            },
            "Pharma": {
                "indian_proxy": "^CNXPHARMA",
                "benchmark_etf": "XLV",
                "constituents": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS"],
                "us_constituents": ["JNJ", "PFE", "MRK"],
            },
            "FMCG": {
                "indian_proxy": "^CNXFMCG",
                "benchmark_etf": "XLP",
                "constituents": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS"],
                "us_constituents": ["PG", "KO", "PEP"],
            },
            "Metals": {
                "indian_proxy": "^CNXMETAL",
                "benchmark_etf": "XME",
                "constituents": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS"],
                "us_constituents": ["RIO", "BHP", "NEM"],
            },
            "Power": {
                "indian_proxy": "^CNXINFRA",
                "benchmark_etf": "XLI",
                "constituents": ["NTPC.NS", "POWERGRID.NS", "NHPC.NS"],
                "us_constituents": ["NEE", "D"],
            },
        }

        all_symbols = []
        for sector_data in BENCHMARK_SECTORS.values():
            all_symbols.extend(sector_data["constituents"])
            all_symbols.extend(sector_data.get("us_constituents", []))

        quotes = await self._market_data.get_quotes(all_symbols)
        quote_map = dict(zip(all_symbols, quotes))

        sectors = []
        for sector_name, sector_data in BENCHMARK_SECTORS.items():
            indian_symbols = sector_data["constituents"]
            us_symbols = sector_data.get("us_constituents", [])
            all_sector_symbols = indian_symbols + us_symbols

            changes = []
            for sym in all_sector_symbols:
                q = quote_map.get(sym)
                if q and q.change_pct is not None:
                    changes.append(q.change_pct)

            avg_change = sum(changes) / len(changes) if changes else 0

            # Breadth: Advancing / Total Tracked (only Indian constituents)
            # as per user's note: "Advancing / Total Tracked"
            advancing = sum(1 for c in changes if c > 0.1)
            breadth_pct = round((advancing / len(indian_symbols)) * 100, 1) if indian_symbols else 0
            breadth_display = f"{advancing}/{len(indian_symbols)}"

            sectors.append({
                "name": sector_name,
                "change_pct": round(avg_change, 2),
                "breadth_pct": breadth_pct,
                "breadth": breadth_display,
                "symbols": indian_symbols[:3],  # Top 3 Indian representative symbols
                "us_symbols": us_symbols,
                "benchmark_etf": sector_data.get("benchmark_etf", ""),
                "indian_proxy": sector_data.get("indian_proxy", ""),
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

    def _build_hero_from_macro(self, macro: Dict[str, Any]) -> Dict[str, Any]:
        """Build hero card from unified macro data (provider-based overview)."""
        nifty_item = None
        for item in macro.get("Indices", []):
            if item.get("symbol") == "^NSEI":
                nifty_item = item
                break
        if nifty_item and nifty_item.get("price") is not None:
            return {
                "symbol": "^NSEI",
                "name": "NIFTY 50",
                "price": nifty_item["price"],
                "change": nifty_item.get("change"),
                "change_pct": nifty_item.get("change_pct"),
                "high": nifty_item.get("high"),
                "low": nifty_item.get("low"),
                "volume": nifty_item.get("volume", 0),
                "timestamp": nifty_item.get("source_timestamp"),
                "source": nifty_item.get("source", "composite_provider"),
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
            "source": "composite_provider",
            "status": "unavailable",
        }

    def _get_market_status(self) -> Dict[str, Any]:
        """Get current market session status."""
        from zoneinfo import ZoneInfo
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        is_weekday = now_ist.weekday() < 5
        curr_time = now_ist.time()

        if is_weekday:
            if time(9, 15) <= curr_time <= time(15, 30):
                status = "OPEN"
            elif time(9, 0) <= curr_time < time(9, 15):
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
            if time(9, 30) <= curr_time <= time(16, 0):
                return "OPEN"
            elif time(4, 0) <= curr_time < time(9, 30):
                return "PRE"
        return "CLOSED"

    def _get_lse_status(self) -> str:
        from zoneinfo import ZoneInfo
        now_lon = datetime.now(ZoneInfo("Europe/London"))
        is_weekday = now_lon.weekday() < 5
        curr_time = now_lon.time()
        if is_weekday:
            if time(8, 0) <= curr_time <= time(16, 30):
                return "OPEN"
        return "CLOSED"

    def _get_tyo_status(self) -> str:
        from zoneinfo import ZoneInfo
        now_tyo = datetime.now(ZoneInfo("Asia/Tokyo"))
        is_weekday = now_tyo.weekday() < 5
        curr_time = now_tyo.time()
        if is_weekday:
            if time(9, 0) <= curr_time <= time(15, 0):
                return "OPEN"
            elif time(11, 30) <= curr_time <= time(12, 30):
                return "LUNCH"
        return "CLOSED"

    def _assess_feed_health(self, total: int, available: int) -> Dict[str, str]:
        """Assess health of data feeds by category.

        Args:
            total: total number of items queried (all categories combined).
            available: number of items that returned a non-null price.
        """
        if total == 0:
            return {"indices": "OFFLINE", "sectors": "OFFLINE", "macro": "OFFLINE"}
        if available == total:
            return {"indices": "LIVE", "sectors": "LIVE", "macro": "LIVE"}
        elif available > total * 0.5:
            return {"indices": "PARTIAL", "sectors": "PARTIAL", "macro": "PARTIAL"}
        return {"indices": "STALE", "sectors": "STALE", "macro": "STALE"}

    def _empty_overview(self) -> Dict[str, Any]:
        """Return empty but valid overview structure."""
        now = datetime.now().isoformat()
        return {
            "macro": {
                "Indices": [],
                "India": [], "Americas": [], "Europe": [], "Asia": [],
                "Forex": [], "Commodities": [], "Crypto": [],
            },
            "sectors": [],
            "market_status": {"nse": "CLOSED", "nyse": "CLOSED", "lse": "CLOSED", "tyo": "CLOSED"},
            "hero": {"symbol": "^NSEI", "name": "NIFTY 50", "price": None, "status": "unavailable"},
            "data_freshness": "unavailable",
            "feed_health": {"indices": "OFFLINE", "sectors": "OFFLINE", "macro": "OFFLINE"},
            "retrieved_at": now,
            "last_attempted_at": now,
            "timestamp": now,
            "source": "unavailable",
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