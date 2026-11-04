"""Deep Research Feature - Service Implementation"""
import logging
from typing import Dict, Any, List, Optional
import datetime
import math
import numpy as np
import pandas as pd

from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider
from backend.core.services.symbol_resolver import resolve_symbol, get_provider_symbol
from backend.core.services.calendar import get_calendar_for_symbol

logger = logging.getLogger(__name__)

BENCHMARK_SECTORS = {
    "Technology": {
        "benchmark_etf": "XLK",
        "indian_proxy": "^CNXIT",
        "constituents": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPPRO.NS", "LTM.NS"],
        "us_constituents": ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"],
        "display_name": "Information Technology & Software",
    },
    "Banking & Finance": {
        "benchmark_etf": "XLF",
        "indian_proxy": "^NSEBANK",
        "constituents": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "PERSISTENT.NS"],
        "us_constituents": ["JPM", "BAC", "GS", "MS", "C"],
        "display_name": "Banking & Financial Services",
    },
    "Energy & Resources": {
        "benchmark_etf": "XLE",
        "indian_proxy": "^CNXENERGY",
        "constituents": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "NTPC.NS", "SAVRAN.NS"],
        "us_constituents": ["XOM", "CVX", "COP", "EPSN", "PSX"],
        "display_name": "Energy, Oil & Petrochemicals",
    },
    "Automotive": {
        "benchmark_etf": "CARZ",
        "indian_proxy": "^CNXAUTO",
        "constituents": ["MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "TATAMOTORS.NS", "HeroMoto.NS"],
        "us_constituents": ["TSLA", "TM", "F", "GM", "RIDM"],
        "display_name": "Automotive & Mobility",
    },
    "Pharma & Healthcare": {
        "benchmark_etf": "XLV",
        "indian_proxy": "^CNXPHARMA",
        "constituents": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "LUPIN.NS"],
        "us_constituents": ["JNJ", "PFE", "MRK", "ABBV", "BMY"],
        "display_name": "Pharmaceuticals & Healthcare",
    },
    "Consumer FMCG": {
        "benchmark_etf": "XLP",
        "indian_proxy": "^CNXFMCG",
        "constituents": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS", "BRITANNIA.NS", "VICKY.NS"],
        "us_constituents": ["PG", "KO", "PEP", "KHC", "MOS"],
        "display_name": "Consumer Staples & FMCG",
    },
    "Metals & Mining": {
        "benchmark_etf": "XME",
        "indian_proxy": "^CNXMETAL",
        "constituents": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "COALINDIA.NS", "SAIL.NS"],
        "us_constituents": ["RIO", "BHP", "NEM", "FMG", "SCCO"],
        "display_name": "Metals, Mining & Materials",
    },
    "Infrastructure & Industrials": {
        "benchmark_etf": "XLI",
        "indian_proxy": "^CNXINFRA",
        "constituents": ["LT.NS", "SIEMENS.NS", "ABB.NS", "BEL.NS", "L&T.NS"],
        "us_constituents": ["CAT", "GE", "HON", "UPS", "RTX"],
        "display_name": "Infrastructure & Capital Goods",
    },
}


def _safe_float(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None


class DeepResearchService:
    def __init__(self, cache: CacheProtocol, market_data: Optional[MarketDataProvider] = None):
        self._cache = cache
        self._market_data = market_data

    async def get_deep_research(self, symbol: str) -> Dict[str, Any]:
        cache_key = f"deep_research:{symbol}"
        cached = await self._cache.get("computed:deep_research", cache_key)
        if cached:
            return cached

        logger.warning(f"Deep research legacy module not available for {symbol}")
        data = {
            "symbol": symbol,
            "error": "Deep research requires legacy module integration",
            "quarterly_trends": [],
            "corporate_actions": [],
            "valuation_envelope": {},
            "relative_benchmarking": {},
            "correlation_matrix": {},
            "sector_intelligence": {},
            "financial_health_score": None,
        }

        await self._cache.set("computed:deep_research", cache_key, data, ttl=1800)
        return data

    async def compute_correlation_matrix(self, symbols: List[str], period: str = "1y") -> Dict[str, Any]:
        # Legacy module no longer exists - return empty matrix
        logger.warning("Correlation matrix legacy module not available")
        return {
            "symbols": symbols,
            "period": period,
            "matrix": {},
            "error": "Correlation matrix requires legacy module integration"
        }

    async def compute_portfolio_risk(self, positions: List[Dict[str, Any]], period: str = "1y") -> Dict[str, Any]:
        # Legacy module no longer exists - return empty risk
        logger.warning("Portfolio risk legacy module not available")
        return {
            "positions": positions,
            "period": period,
            "var_95": None,
            "var_99": None,
            "expected_shortfall": None,
            "max_drawdown": None,
            "error": "Portfolio risk requires legacy module integration"
        }

    async def get_sector_intelligence(self) -> Dict[str, Any]:
        cache_key = "sector_intelligence"
        cached = await self._cache.get("computed:sector_intelligence", cache_key)
        if cached:
            return cached

        if not self._market_data:
            logger.warning("Market data provider not available for sector intelligence")
            data = {
                "sectors": [],
                "error": "Market data provider not configured"
            }
            await self._cache.set("computed:sector_intelligence", cache_key, data, ttl=3600)
            return data

        # Collect all unique constituents across sectors (both Indian and US)
        all_constituents = []
        sector_constituents = {}
        for sec_name, meta in BENCHMARK_SECTORS.items():
            # Only Indian constituents for sector display
            sector_constituents[sec_name] = meta["constituents"]
            all_constituents.extend(meta["constituents"])
            # Also fetch US constituents
            if "us_constituents" in meta:
                all_constituents.extend(meta["us_constituents"])

        # Deduplicate while preserving order
        seen = set()
        unique_constituents = []
        for sym in all_constituents:
            if sym not in seen:
                seen.add(sym)
                unique_constituents.append(sym)

        # Limit uncached symbols to prevent overwhelming providers
        # The composite provider will check its cache first
        max_uncached = 20  # Max symbols to fetch if not cached

        sectors_out = []
        constituent_quotes = {}

        # Fetch quotes for all unique constituents (composite provider handles caching)
        try:
            quotes = await self._market_data.get_quotes(unique_constituents)
            for sym, q in zip(unique_constituents, quotes):
                if q:
                    constituent_quotes[sym] = q
        except Exception as e:
            logger.warning(f"Failed to get sector quotes: {e}")

        # Calculate breadth per sector using fetched quotes (only Indian constituents)
        for sec_name, meta in BENCHMARK_SECTORS.items():
            constituents = meta["constituents"]
            # Include US constituents separately
            us_constituents = meta.get("us_constituents", [])
            all_sector_symbols = constituents + us_constituents

            advancing = 0
            declining = 0
            unchanged = 0
            total_valid = 0
            constituent_perf = []
            weights = {}

            for sym in all_sector_symbols:
                q = constituent_quotes.get(sym)
                if q and q.price is not None and q.prev_close is not None and q.prev_close > 0:
                    pct = ((q.price - q.prev_close) / q.prev_close) * 100
                    constituent_perf.append({"symbol": sym, "change_pct": round(pct, 2)})
                    if pct > 0.1:
                        advancing += 1
                    elif pct < -0.1:
                        declining += 1
                    else:
                        unchanged += 1
                    total_valid += 1

            # Calculate weights based on market cap proxy (price * volume as % of sector total)
            total_value = sum(
                (constituent_quotes.get(s, {}).get("price", 0) or 0) *
                (constituent_quotes.get(s, {}).get("volume", 0) or 0)
                for s in constituents
            )
            for sym in constituents:
                q = constituent_quotes.get(sym)
                if q and q.price is not None and q.volume:
                    value = q.price * q.volume
                    weights[sym] = round((value / total_value) * 100, 2) if total_value > 0 else 0

            # Sector performance from leading asset (Indian proxy)
            perf_pct = 0.0
            if constituent_perf:
                leading = next((c for c in constituent_perf if c["symbol"] == meta["constituents"][0]), None)
                if leading:
                    perf_pct = leading["change_pct"]
                else:
                    perf_pct = round(sum(c["change_pct"] for c in constituent_perf) / len(constituent_perf), 2)

            # Breadth: Advancing / Total Tracked (only Indian constituents)
            breadth_pct = round((advancing / len(constituents)) * 100, 1) if constituents else 0

            sectors_out.append({
                "sector": sec_name,
                "display_name": meta["display_name"],
                "benchmark_etf": meta.get("benchmark_etf", ""),
                "indian_proxy": meta.get("indian_proxy", ""),
                "us_benchmark": meta.get("benchmark_etf", ""),
                "performance_24h_pct": perf_pct,
                "constituents": constituents,
                "us_constituents": us_constituents,
                "leading_asset": meta["constituents"][0],
                "advancing": advancing,
                "declining": declining,
                "unchanged": unchanged,
                "total_valid": total_valid,
                "breadth_pct": breadth_pct,
                "total_tracked": len(constituents),
                "constituent_performance": constituent_perf,
                "weights": weights,  # Live weights from cache
            })

        result = {
            "sectors": sectors_out,
            "retrieved_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        await self._cache.set("computed:sector_intelligence", cache_key, result, ttl=1800)
        return result