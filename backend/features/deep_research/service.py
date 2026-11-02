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
        "constituents": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "LTM.NS", "NVDA", "AAPL", "MSFT"],
        "display_name": "Information Technology & Software",
    },
    "Banking & Finance": {
        "benchmark_etf": "XLF",
        "indian_proxy": "^NSEBANK",
        "constituents": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "JPM", "BAC"],
        "display_name": "Banking & Financial Services",
    },
    "Energy & Resources": {
        "benchmark_etf": "XLE",
        "indian_proxy": "^CNXENERGY",
        "constituents": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "NTPC.NS", "XOM", "CVX"],
        "display_name": "Energy, Oil & Petrochemicals",
    },
    "Automotive": {
        "benchmark_etf": "CARZ",
        "indian_proxy": "^CNXAUTO",
        "constituents": ["MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "TATAMOTORS.NS", "TSLA", "TM"],
        "display_name": "Automotive & Mobility",
    },
    "Pharma & Healthcare": {
        "benchmark_etf": "XLV",
        "indian_proxy": "^CNXPHARMA",
        "constituents": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "JNJ", "PFE"],
        "display_name": "Pharmaceuticals & Healthcare",
    },
    "Consumer FMCG": {
        "benchmark_etf": "XLP",
        "indian_proxy": "^CNXFMCG",
        "constituents": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS", "BRITANNIA.NS", "PG", "KO"],
        "display_name": "Consumer Staples & FMCG",
    },
    "Metals & Mining": {
        "benchmark_etf": "XME",
        "indian_proxy": "^CNXMETAL",
        "constituents": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "COALINDIA.NS", "RIO", "BHP"],
        "display_name": "Metals, Mining & Materials",
    },
    "Infrastructure & Industrials": {
        "benchmark_etf": "XLI",
        "indian_proxy": "^CNXINFRA",
        "constituents": ["LT.NS", "SIEMENS.NS", "ABB.NS", "BEL.NS", "CAT", "GE"],
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
                "sectors": {},
                "error": "Market data provider not configured"
            }
            await self._cache.set("computed:sector_intelligence", cache_key, data, ttl=3600)
            return data

        sectors_out = []
        for sec_name, meta in BENCHMARK_SECTORS.items():
            constituents = meta["constituents"]
            advancing = 0
            declining = 0
            unchanged = 0
            constituent_perf = []

            # Calculate breadth across all constituents
            try:
                quotes = await self._market_data.get_quotes(constituents)
                for sym, q in zip(constituents, quotes):
                    if q and q.price is not None and q.prev_close is not None and q.prev_close > 0:
                        pct = ((q.price - q.prev_close) / q.prev_close) * 100
                        constituent_perf.append({"symbol": sym, "change_pct": round(pct, 2)})
                        if pct > 0.1:
                            advancing += 1
                        elif pct < -0.1:
                            declining += 1
                        else:
                            unchanged += 1
            except Exception as e:
                logger.debug(f"Failed to get quotes for sector {sec_name}: {e}")

            # Sector performance from leading asset
            perf_pct = 0.0
            if constituent_perf:
                leading = next((c for c in constituent_perf if c["symbol"] == meta["constituents"][0]), None)
                if leading:
                    perf_pct = leading["change_pct"]
                else:
                    perf_pct = round(sum(c["change_pct"] for c in constituent_perf) / len(constituent_perf), 2)

            sectors_out.append({
                "sector": sec_name,
                "display_name": meta["display_name"],
                "benchmark_etf": meta.get("benchmark_etf", ""),
                "indian_proxy": meta.get("indian_proxy", ""),
                "performance_24h_pct": perf_pct,
                "constituents": constituents,
                "leading_asset": meta["constituents"][0],
                "advancing": advancing,
                "declining": declining,
                "unchanged": unchanged,
                "total_constituents": len(constituents),
                "breadth_pct": round((advancing / len(constituents)) * 100, 1) if constituents else 0,
                "constituent_performance": constituent_perf,
            })

        result = {
            "sectors": {s["sector"]: s for s in sectors_out},
            "retrieved_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        await self._cache.set("computed:sector_intelligence", cache_key, result, ttl=1800)
        return result