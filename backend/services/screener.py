"""
Global Multi-Market Screener Service:
Fast batch screening across US Mega-Caps, Indian Nifty Leaders, Semiconductors & AI,
Forex Major Pairs, Cryptocurrencies, and Commodities.
Results are cached in L1/L2 cache to avoid burst requests.
"""

import logging
from typing import Optional
import yfinance as yf

from backend.config import settings
from backend.services.cache_manager import cache

logger = logging.getLogger("screener")

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


def get_screener_snapshot(universe: str = "us_mega_caps") -> dict:
    """
    Fetch live metrics for a selected screener universe.
    Cached with L1/L2 TTL to prevent upstream rate-limiting.
    """
    normalized_key = universe.lower().replace(" ", "_").replace("-", "_")
    if normalized_key not in SCREENER_UNIVERSES:
        normalized_key = "us_mega_caps"

    cached = cache.get("screener", normalized_key)
    if cached:
        return cached

    universe_meta = SCREENER_UNIVERSES[normalized_key]
    symbols = universe_meta["symbols"]
    items = []

    try:
        sym_str = " ".join(symbols)
        batch = yf.Tickers(sym_str)
        for sym in symbols:
            try:
                t = batch.tickers.get(sym)
                if not t:
                    continue

                fast = getattr(t, "fast_info", None)
                info = getattr(t, "info", {}) or {}

                price = 0.0
                if fast and hasattr(fast, "lastPrice") and fast.lastPrice:
                    price = float(fast.lastPrice)
                elif info.get("currentPrice"):
                    price = float(info["currentPrice"])
                elif info.get("regularMarketPrice"):
                    price = float(info["regularMarketPrice"])

                prev = price
                if fast and hasattr(fast, "previousClose") and fast.previousClose:
                    prev = float(fast.previousClose)
                elif info.get("previousClose"):
                    prev = float(info["previousClose"])

                chg_pct = round(((price - prev) / prev * 100), 2) if prev and price else 0.0
                curr = info.get("currency") or (fast.currency if fast and hasattr(fast, "currency") else "USD")
                curr_char = "₹" if curr == "INR" or sym.endswith(".NS") else ("$" if curr == "USD" else curr + " ")

                mcap = (fast.marketCap if fast and hasattr(fast, "marketCap") else None) or info.get("marketCap") or 0
                if mcap >= 1e12:
                    mcap_str = f"{curr_char}{mcap/1e12:.2f}T"
                elif mcap >= 1e9:
                    mcap_str = f"{curr_char}{mcap/1e9:.2f}B"
                elif mcap >= 1e7 and curr == "INR":
                    mcap_str = f"₹{mcap/1e7:,.1f} Cr"
                elif mcap > 0:
                    mcap_str = f"{curr_char}{mcap/1e6:.1f}M"
                else:
                    mcap_str = "—"

                pe = info.get("trailingPE")
                high52 = (fast.yearHigh if fast and hasattr(fast, "yearHigh") else None) or info.get("fiftyTwoWeekHigh")

                decimals = 4 if "=X" in sym else 2
                items.append({
                    "symbol": sym,
                    "name": info.get("shortName") or info.get("longName") or sym,
                    "price": round(price, decimals),
                    "price_str": f"{curr_char}{price:,.{decimals}f}",
                    "change_pct": chg_pct,
                    "market_cap": mcap,
                    "market_cap_str": mcap_str,
                    "pe_trailing": round(float(pe), 1) if pe else None,
                    "high_52w": round(float(high52), 2) if high52 else None,
                    "sector": info.get("sector") or ("Forex" if "=X" in sym else ("Crypto" if "-USD" in sym else "Global Market")),
                })
            except Exception as e:
                logger.debug(f"Screener symbol error for {sym}: {e}")
                continue
    except Exception as e:
        logger.warning(f"Screener batch fetch failed for {normalized_key}: {e}")

    result = {
        "universe_key": normalized_key,
        "title": universe_meta["title"],
        "count": len(items),
        "items": items,
        "available_universes": list(SCREENER_UNIVERSES.keys()),
    }

    cache.set("screener", normalized_key, result, ttl=settings.L1_SCREENER_TTL)
    return result
