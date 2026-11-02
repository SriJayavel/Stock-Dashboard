"""Screener Feature - Service Implementation"""
import logging
from typing import Dict, Any, List, Optional
import datetime

from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider
from backend.core.services.symbol_resolver import resolve_symbol, get_provider_symbol

logger = logging.getLogger(__name__)

SCREENER_UNIVERSES = {
    "us_mega_caps": {
        "title": "US Mega-Caps",
        "symbols": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK-B"],
    },
    "indian_leaders": {
        "title": "Indian Nifty Leaders",
        "symbols": ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "BHARTIARTL.NS", "SBIN.NS", "TATAMOTORS.NS"],
    },
    "semiconductors_ai": {
        "title": "Semiconductors & AI",
        "symbols": ["NVDA", "TSM", "ASML", "AMD", "AVGO", "QCOM", "INTC", "ARM"],
    },
    "crypto": {
        "title": "Cryptocurrencies",
        "symbols": ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "DOGE-USD"],
    },
    "commodities": {
        "title": "Global Commodities",
        "symbols": ["GC=F", "SI=F", "CL=F", "NG=F", "HG=F"],
    },
    "forex": {
        "title": "Major Forex Pairs",
        "symbols": ["EURUSD=X", "USDJPY=X", "GBPUSD=X", "USDCHF=X", "AUDUSD=X", "USDCAD=X", "NZDUSD=X", "USDINR=X"],
    },
}


def _format_market_cap(mcap: Optional[float], currency: str) -> str:
    if not mcap or mcap <= 0:
        return "—"
    curr_char = "₹" if currency == "INR" else ("$" if currency == "USD" else currency + " ")
    if mcap >= 1e12:
        return f"{curr_char}{mcap/1e12:.2f}T"
    if mcap >= 1e9:
        return f"{curr_char}{mcap/1e9:.2f}B"
    if mcap >= 1e7 and currency == "INR":
        return f"₹{mcap/1e7:,.1f} Cr"
    return f"{curr_char}{mcap/1e6:.1f}M"


class ScreenerService:
    def __init__(self, cache: CacheProtocol, market_data: Optional[MarketDataProvider] = None):
        self._cache = cache
        self._market_data = market_data

    async def get_snapshot(self, universe: str = "us_mega_caps") -> Dict[str, Any]:
        """Get screener snapshot - uses MarketDataProvider protocol."""
        normalized_key = universe.lower().replace(" ", "_").replace("-", "_")
        if normalized_key not in SCREENER_UNIVERSES:
            normalized_key = "us_mega_caps"

        cache_key = f"screener:{normalized_key}"
        cached = await self._cache.get("computed:screener", cache_key)
        if cached:
            return cached

        if not self._market_data:
            logger.warning(f"Market data provider not available for screener {normalized_key}")
            data = {
                "universe": normalized_key,
                "items": [],
                "error": "Market data provider not configured",
                "total_matches": 0,
                "filters_applied": [],
            }
            await self._cache.set("computed:screener", cache_key, data, ttl=1800)
            return data

        universe_meta = SCREENER_UNIVERSES[normalized_key]
        symbols = universe_meta["symbols"]
        items = []

        try:
            quotes = await self._market_data.get_quotes(symbols)
            for sym, q in zip(symbols, quotes):
                if not q:
                    continue

                provider_sym = get_provider_symbol(resolve_symbol(sym))
                asset_info = await self._market_data.get_asset_info(provider_sym)

                currency = "INR" if sym.endswith(".NS") or sym.endswith(".BO") else (asset_info.currency if asset_info else "USD")
                curr_char = "₹" if currency == "INR" else ("$" if currency == "USD" else currency + " ")
                decimals = 4 if "=X" in sym else 2

                price = q.price if q.price is not None else 0.0
                prev_close = q.prev_close if q.prev_close is not None else price
                chg_pct = round(((price - prev_close) / prev_close * 100), 2) if prev_close and price else 0.0

                mcap = q.market_cap or 0

                items.append({
                    "symbol": sym,
                    "name": asset_info.name if asset_info else sym,
                    "price": round(price, decimals),
                    "price_str": f"{curr_char}{price:,.{decimals}f}",
                    "change_pct": chg_pct,
                    "market_cap": mcap,
                    "market_cap_str": _format_market_cap(mcap, currency),
                    "pe_trailing": round(float(q.pe_trailing), 1) if q.pe_trailing else None,
                    "high_52w": round(float(q.high_52w), 2) if q.high_52w else None,
                    "sector": asset_info.sector if asset_info else ("Forex" if "=X" in sym else ("Crypto" if "-USD" in sym else "Global Market")),
                })
        except Exception as e:
            logger.warning(f"Screener batch fetch failed for {normalized_key}: {e}")

        result = {
            "universe_key": normalized_key,
            "title": universe_meta["title"],
            "count": len(items),
            "items": items,
            "available_universes": list(SCREENER_UNIVERSES.keys()),
        }

        await self._cache.set("computed:screener", cache_key, result, ttl=1800)
        return result

    async def get_universes(self) -> List[str]:
        return list(SCREENER_UNIVERSES.keys())