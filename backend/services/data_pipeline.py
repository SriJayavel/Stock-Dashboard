"""
Production Data Pipeline for Apex Financial Terminal:
- Resilient multi-tier caching (L1 TTLCache + L2 Redis).
- Direct NSE API handshake for Indian equities/indices with graceful fallback to yfinance.
- yfinance session with custom browser headers for global assets.
- External-trigger cache warming for Render / Cloud Run free tiers.
- Formats OHLCV data directly into TradingView Lightweight Charts format.
"""

import os
import time
import logging
import datetime
import random
import requests
import pandas as pd
import numpy as np
import yfinance as yf

from backend.config import settings
from backend.services.cache_manager import cache
from backend.services.nse_fetcher import nse_client
from backend.services.indicators import apply_all_indicators, generate_technical_observations

logger = logging.getLogger("data_pipeline")

# Persistent yfinance session
_yf_session = requests.Session()
_yf_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
})

# Load local NSE companies catalog once
_COMPANIES_DF = None
def get_companies_catalog() -> pd.DataFrame:
    global _COMPANIES_DF
    if _COMPANIES_DF is None:
        csv_path = settings.COMPANIES_CSV_PATH
        if os.path.exists(csv_path):
            try:
                _COMPANIES_DF = pd.read_csv(csv_path)
            except Exception as e:
                logger.error(f"Failed to load companies.csv from {csv_path}: {e}")
                _COMPANIES_DF = pd.DataFrame(columns=["SYMBOL", "NAME OF COMPANY"])
        else:
            logger.warning(f"Companies catalog not found at {csv_path}")
            _COMPANIES_DF = pd.DataFrame(columns=["SYMBOL", "NAME OF COMPANY"])
    return _COMPANIES_DF


# Comprehensive Pre-defined Asset Universe for Instant Discovery
POPULAR_UNIVERSE = [
    # Benchmark Indices
    {"symbol": "^NSEI", "name": "NIFTY 50", "category": "Indices", "exchange": "NSE", "country": "IN"},
    {"symbol": "^BSESN", "name": "BSE SENSEX", "category": "Indices", "exchange": "BSE", "country": "IN"},
    {"symbol": "^NSEBANK", "name": "BANK NIFTY", "category": "Indices", "exchange": "NSE", "country": "IN"},
    {"symbol": "^GSPC", "name": "S&P 500", "category": "Indices", "exchange": "US", "country": "US"},
    {"symbol": "^IXIC", "name": "NASDAQ", "category": "Indices", "exchange": "US", "country": "US"},
    {"symbol": "^DJI", "name": "Dow Jones", "category": "Indices", "exchange": "US", "country": "US"},
    {"symbol": "^FTSE", "name": "FTSE 100", "category": "Indices", "exchange": "LSE", "country": "UK"},
    {"symbol": "^N225", "name": "Nikkei 225", "category": "Indices", "exchange": "TSE", "country": "JP"},

    # Major Forex Pairs
    {"symbol": "EURUSD=X", "name": "EUR / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDJPY=X", "name": "USD / JPY", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "GBPUSD=X", "name": "GBP / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDCHF=X", "name": "USD / CHF", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "AUDUSD=X", "name": "AUD / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDCAD=X", "name": "USD / CAD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "NZDUSD=X", "name": "NZD / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDINR=X", "name": "USD / INR", "category": "Forex", "exchange": "Forex", "country": "Global"},

    # Commodities
    {"symbol": "GC=F", "name": "Gold", "category": "Commodities", "exchange": "COMEX", "country": "Global"},
    {"symbol": "SI=F", "name": "Silver", "category": "Commodities", "exchange": "COMEX", "country": "Global"},
    {"symbol": "CL=F", "name": "Crude Oil", "category": "Commodities", "exchange": "NYMEX", "country": "Global"},

    # Cryptocurrencies
    {"symbol": "BTC-USD", "name": "Bitcoin", "category": "Crypto", "exchange": "Crypto", "country": "Global"},
    {"symbol": "ETH-USD", "name": "Ethereum", "category": "Crypto", "exchange": "Crypto", "country": "Global"},
    {"symbol": "SOL-USD", "name": "Solana", "category": "Crypto", "exchange": "Crypto", "country": "Global"},

    # Major Indian Equities
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "INFY.NS", "name": "Infosys", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "SBIN.NS", "name": "State Bank of India", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "ITC.NS", "name": "ITC Limited", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "LT.NS", "name": "Larsen & Toubro", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors", "category": "Equities", "exchange": "NSE", "country": "IN"},

    # Major US Tech Equities
    {"symbol": "NVDA", "name": "NVIDIA", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "AAPL", "name": "Apple", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "MSFT", "name": "Microsoft", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "GOOGL", "name": "Alphabet (Google)", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "AMZN", "name": "Amazon", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "META", "name": "Meta Platforms", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "TSLA", "name": "Tesla", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
]


def resolve_symbol(query: str) -> str:
    """Resolve aliases and standard query formats into clean tickers."""
    if not query:
        return "TCS.NS"
    cleaned = query.strip()
    upper = cleaned.upper()

    aliases = {
        "NIFTY": "^NSEI",
        "NIFTY50": "^NSEI",
        "NIFTY 50": "^NSEI",
        "SENSEX": "^BSESN",
        "BANKNIFTY": "^NSEBANK",
        "BANK NIFTY": "^NSEBANK",
        "SP500": "^GSPC",
        "S&P 500": "^GSPC",
        "NASDAQ": "^IXIC",
        "DOW": "^DJI",
        "BTC": "BTC-USD",
        "BITCOIN": "BTC-USD",
        "ETH": "ETH-USD",
        "ETHEREUM": "ETH-USD",
        "SOL": "SOL-USD",
        "GOLD": "GC=F",
        "SILVER": "SI=F",
        "CRUDE": "CL=F",
        "OIL": "CL=F",
    }
    if upper in aliases:
        return aliases[upper]

    # Forex pair standard checks (supports EUR/USD, EUR-USD, EUR USD, EURUSD, etc.)
    compact = upper.replace("/", "").replace("-", "").replace(" ", "").replace("_", "")
    forex_pairs = {
        "EURUSD", "USDJPY", "GBPUSD", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "USDINR",
        "EURGBP", "EURJPY", "GBPJPY", "EURCHF", "AUDJPY", "CADJPY",
    }
    if compact in forex_pairs or (compact.endswith("=X") and compact[:-2] in forex_pairs):
        return f"{compact.replace('=X', '')}=X"

    if any(ch in upper for ch in [".", "^", "=", "-"]):
        return upper

    # Check local Indian catalog
    cat = get_companies_catalog()
    if not cat.empty and "SYMBOL" in cat.columns:
        if upper in cat["SYMBOL"].values:
            return f"{upper}.NS"

    return upper


def search_assets(query: str) -> list[dict]:
    """Instant asset directory lookup across Popular, Catalog, and Yahoo."""
    if not query or len(query.strip()) < 1:
        return POPULAR_UNIVERSE[:12]

    q_clean = query.strip()
    q_low = q_clean.lower()
    matches = []
    seen = set()

    # 1. Match from Popular Universe
    for item in POPULAR_UNIVERSE:
        if q_low in item["symbol"].lower() or q_low in item["name"].lower():
            matches.append(item)
            seen.add(item["symbol"])

    # 2. Match from Indian Catalog
    cat = get_companies_catalog()
    if not cat.empty and "SYMBOL" in cat.columns:
        hits = cat[
            cat["SYMBOL"].str.contains(q_clean, case=False, na=False)
            | cat["NAME OF COMPANY"].str.contains(q_clean, case=False, na=False)
        ].head(8)
        for _, row in hits.iterrows():
            sym = f"{row['SYMBOL']}.NS"
            if sym not in seen:
                matches.append({
                    "symbol": sym,
                    "name": row["NAME OF COMPANY"],
                    "category": "Equities",
                    "exchange": "NSE",
                    "country": "IN",
                })
                seen.add(sym)

    # 3. Quick Yahoo Fallback if few results
    if len(matches) < 5:
        try:
            search_obj = yf.Search(q_clean, max_results=6)
            for q in getattr(search_obj, "quotes", []):
                sym = q.get("symbol")
                if not sym or sym in seen:
                    continue
                name = q.get("shortname") or q.get("longname") or sym
                exch = q.get("exchange") or "Global"
                matches.append({
                    "symbol": sym,
                    "name": name,
                    "category": "Equities",
                    "exchange": exch,
                    "country": "Global",
                })
                seen.add(sym)
        except Exception:
            pass

    return matches[:15]


def _format_currency(currency: str) -> str:
    symbols = {
        "INR": "₹",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
        "CAD": "CA$",
        "AUD": "A$",
        "CHF": "CHF",
    }
    return symbols.get(currency.upper(), f"{currency} ")


def _format_market_cap(mcap: Optional[float], currency: str) -> str:
    if not mcap or mcap <= 0:
        return "—"
    curr_sym = _format_currency(currency)
    if currency == "INR":
        cr_val = mcap / 1e7
        return f"₹{cr_val:,.1f} Cr"
    if mcap >= 1e12:
        return f"{curr_sym}{mcap/1e12:.2f}T"
    if mcap >= 1e9:
        return f"{curr_sym}{mcap/1e9:.2f}B"
    return f"{curr_sym}{mcap/1e6:.1f}M"


def _get_fast_info_val(fast: Any, *keys: str) -> Optional[float]:
    """Safely extract numeric metrics from yfinance fast_info without crashing on missing camelCase attributes."""
    if not fast:
        return None
    for k in keys:
        try:
            val = getattr(fast, k, None)
            if val is not None:
                return float(val)
        except Exception:
            pass
        if hasattr(fast, "get"):
            try:
                val = fast.get(k)
                if val is not None:
                    return float(val)
            except Exception:
                pass
    return None


def _parse_dividend_yield(info: dict, price: float = None, sym: str = "") -> Optional[float]:
    """
    Robust dividend yield extraction across equities, ADRs, and ETFs.
    1. Detects confirmed non-payers from zero fields (trailingAnnualDividendYield, dividendRate, payoutRatio).
    2. Corrects accidental 100x scaling if raw is unexpectedly > 25.0%.
    3. Enforces sanity bounds (yield > 25.0% without dividendRate support is rejected as invalid schema).
    """
    raw_dy = info.get("dividendYield")
    raw_tray = info.get("trailingAnnualDividendYield")
    raw_dr = info.get("dividendRate")
    raw_trdr = info.get("trailingAnnualDividendRate")
    raw_pr = info.get("payoutRatio")

    # Explicit confirmed zero detection (e.g. TSLA, AMZN, PAYTM omit dividendYield but set rate/tray/payout to 0.0)
    zero_signals = [v for v in [raw_dy, raw_tray, raw_dr, raw_trdr, raw_pr] if v is not None and float(v) == 0.0]
    positive_signals = [v for v in [raw_dy, raw_tray, raw_dr, raw_trdr] if v is not None and float(v) > 0.0]

    if zero_signals and not positive_signals:
        return 0.0

    val = None
    if raw_dy is not None and float(raw_dy) > 0.0:
        val = float(raw_dy)
    elif raw_tray is not None and float(raw_tray) > 0.0:
        tray_f = float(raw_tray)
        val = tray_f * 100 if tray_f < 0.2 else tray_f
    elif raw_dr is not None and float(raw_dr) > 0.0 and price and price > 0:
        val = (float(raw_dr) / price) * 100

    if val is None:
        return None

    # Sanity bounds check: 25%+ is essentially never genuine for a normal operational equity
    if val > 25.0:
        if (val / 100.0) <= 25.0:
            val = val / 100.0
        else:
            logger.warning(f"Implausible dividend yield {val}% for {sym}; suppressing to None.")
            return None

    return round(val, 2)


def _parse_debt_to_equity(info: dict, sym: str = "") -> Optional[float]:
    """
    Robust debt-to-equity ratio parsing:
    1. Confirmed zero if totalDebt == 0 or raw debtToEquity == 0.
    2. Converts Yahoo's percentage format (e.g. 78.4%) to standard leverage multiple (0.78x).
    3. Sanity bound: leverage > 50x is rejected as unit/schema anomaly rather than confident display.
    """
    raw_de = info.get("debtToEquity")
    total_debt = info.get("totalDebt")

    if total_debt is not None and float(total_debt) == 0.0:
        return 0.0

    if raw_de is not None:
        de_f = float(raw_de)
        if de_f == 0.0:
            return 0.0
        ratio = de_f / 100.0
        if ratio > 50.0:
            logger.warning(f"Implausible debt_to_equity {ratio}x for {sym}; suppressing to None.")
            return None
        return round(ratio, 2)

    return None


def get_stock_overview(symbol: str) -> dict:
    """
    Fetch comprehensive asset overview, metrics, and valuation.
    Checks L1 -> L2 -> NSE fetcher (if Indian) -> yfinance.
    """
    sym = resolve_symbol(symbol)
    cache_key = f"overview:{sym}"
    cached = cache.get("overview", sym)
    if cached:
        return cached

    # Attempt direct NSE fetch if Indian equity
    nse_data = None
    if sym.endswith(".NS") and not sym.startswith("^"):
        nse_data = nse_client.get_equity_quote(sym)

    # Fetch yfinance fundamentals
    session = _yf_session
    t = yf.Ticker(sym, session=session)
    info = {}
    try:
        info = t.info or {}
    except Exception as e:
        logger.debug(f"yfinance info fetch error for {sym}: {e}")

    fast = getattr(t, "fast_info", None)

    # Determine Price
    price = 0.0
    if nse_data and nse_data.get("current_price"):
        price = nse_data["current_price"]
    elif info.get("currentPrice"):
        price = float(info["currentPrice"])
    elif info.get("regularMarketPrice"):
        price = float(info["regularMarketPrice"])
    else:
        fast_p = _get_fast_info_val(fast, "last_price", "lastPrice")
        if fast_p and fast_p > 0:
            price = fast_p
        else:
            try:
                h = t.history(period="5d")
                if not h.empty and "Close" in h.columns:
                    price = float(h["Close"].dropna().iloc[-1])
            except Exception:
                pass

    # Previous Close & Change
    prev_close = 0.0
    if nse_data and nse_data.get("prev_close"):
        prev_close = nse_data["prev_close"]
    elif info.get("regularMarketPreviousClose"):
        prev_close = float(info["regularMarketPreviousClose"])
    elif info.get("previousClose"):
        prev_close = float(info["previousClose"])
    else:
        fast_pc = _get_fast_info_val(fast, "previous_close", "previousClose")
        if fast_pc and fast_pc > 0:
            prev_close = fast_pc
        else:
            prev_close = price

    change = price - prev_close if price and prev_close else 0.0
    change_pct = (change / prev_close * 100) if prev_close else 0.0

    # Currency
    currency = "INR" if sym.endswith(".NS") or sym.endswith(".BO") or sym in ["^NSEI", "^BSESN", "^NSEBANK"] else (
        info.get("currency") or "USD"
    )
    curr_sym = _format_currency(currency)

    # Market Cap
    fast_mcap = _get_fast_info_val(fast, "market_cap", "marketCap")
    raw_mcap = info.get("marketCap") or fast_mcap
    mcap_str = _format_market_cap(raw_mcap, currency)

    # Name
    company_name = info.get("longName") or info.get("shortName")
    if not company_name and nse_data:
        company_name = nse_data.get("name")
    if not company_name:
        for p in POPULAR_UNIVERSE:
            if p["symbol"] == sym:
                company_name = p["name"]
                break
    if not company_name:
        company_name = sym

    # Asset Classification
    is_index = sym.startswith("^") or "INDEX" in sym.upper()
    is_forex = "=X" in sym
    is_commodity = "=F" in sym
    is_crypto = "-USD" in sym
    asset_type = (
        "INDEX" if is_index else (
            "FOREX" if is_forex else (
                "COMMODITY" if is_commodity else (
                    "CRYPTO" if is_crypto else "EQUITY"
                )
            )
        )
    )

    # 52-Week Range (strict actuals, no synthetic multipliers)
    high_52w = (
        info.get("fiftyTwoWeekHigh")
        or (nse_data.get("high_52w") if nse_data else None)
        or _get_fast_info_val(fast, "year_high", "yearHigh")
    )
    low_52w = (
        info.get("fiftyTwoWeekLow")
        or (nse_data.get("low_52w") if nse_data else None)
        or _get_fast_info_val(fast, "year_low", "yearLow")
    )

    overview = {
        "symbol": sym,
        "name": company_name,
        "asset_type": asset_type,
        "current_price": round(price, 4 if "=X" in sym else 2),
        "prev_close": round(prev_close, 4 if "=X" in sym else 2),
        "change": round(change, 4 if "=X" in sym else 2),
        "change_pct": round(change_pct, 2),
        "currency": currency,
        "currency_symbol": curr_sym,
        "market_cap": raw_mcap,
        "market_cap_str": mcap_str,
        "sector": info.get("sector") or ("Commodity" if "=F" in sym else ("Forex" if "=X" in sym else ("Crypto" if "-USD" in sym else ("Global Benchmark" if is_index else "General")))),
        "industry": info.get("industry") or (nse_data.get("industry") if nse_data else ("Index Tracking" if is_index else "Market Asset")),
        "summary": info.get("longBusinessSummary") or info.get("description", "Financial asset live market tracking and valuation terminal."),
        "website": info.get("website", ""),

        # Valuation Multiples (corporate only - strictly preserve None vs 0.0)
        "pe_trailing": round(float(info["trailingPE"]), 2) if info.get("trailingPE") is not None else None,
        "pe_forward": round(float(info["forwardPE"]), 2) if info.get("forwardPE") is not None else None,
        "pb_ratio": round(float(info["priceToBook"]), 2) if info.get("priceToBook") is not None else None,
        "ev_ebitda": round(float(info["enterpriseToEbitda"]), 2) if info.get("enterpriseToEbitda") is not None else None,
        "peg_ratio": round(float(info["pegRatio"]), 2) if info.get("pegRatio") is not None else None,
        "dividend_yield": _parse_dividend_yield(info, price=price, sym=sym),

        # 52-Week Range
        "high_52w": round(float(high_52w), 4 if "=X" in sym else 2) if high_52w is not None else None,
        "low_52w": round(float(low_52w), 4 if "=X" in sym else 2) if low_52w is not None else None,

        # Profitability & Returns
        "roe": round(float(info["returnOnEquity"] * 100), 2) if info.get("returnOnEquity") is not None else None,
        "roa": round(float(info["returnOnAssets"] * 100), 2) if info.get("returnOnAssets") is not None else None,
        "profit_margin": round(float(info["profitMargins"] * 100), 2) if info.get("profitMargins") is not None else None,

        # Solvency (Yahoo reports debtToEquity as a percentage e.g. 78.4% -> convert to 0.78x multiple with sanity check)
        "debt_to_equity": _parse_debt_to_equity(info, sym=sym),
        "current_ratio": round(float(info["currentRatio"]), 2) if info.get("currentRatio") is not None else None,

        # Analyst Targets & Volume
        "target_mean": round(float(info["targetMeanPrice"]), 2) if info.get("targetMeanPrice") else None,
        "recommendation": (info.get("recommendationKey") or "").replace("_", " ").upper(),
        "volume": int(info.get("regularMarketVolume") or info.get("volume") or _get_fast_info_val(fast, "last_volume", "lastVolume") or 0),
        "avg_volume": int(info.get("averageVolume") or _get_fast_info_val(fast, "ten_day_average_volume", "tenDayAverageVolume") or 0),
        "exchange": (
            "NSE" if sym.endswith(".NS") or sym in ["^NSEI", "^NSEBANK"] else
            "BSE" if sym.endswith(".BO") or sym == "^BSESN" else
            info.get("exchange") or _get_fast_info_val(fast, "exchange") or ("CCY" if "=X" in sym else "Crypto" if "-USD" in sym else "US")
        ),
        "exchange_timezone": (
            "IST (UTC+5:30)" if sym.endswith(".NS") or sym.endswith(".BO") or sym in ["^NSEI", "^BSESN", "^NSEBANK"] else
            "UTC" if "=X" in sym or "-USD" in sym else
            (info.get("timeZoneShortName") or "EDT") + " (" + (info.get("exchangeTimezoneName") or "America/New_York") + ")"
        ),
        "data_source": "NSE Direct" if nse_data else "Yahoo Finance",
        "last_updated": datetime.datetime.utcnow().isoformat() + "Z",
    }

    cache.set("overview", sym, overview, ttl=settings.L1_STOCK_OVERVIEW_TTL)
    return overview


def get_stock_history(symbol: str, timeframe: str = "max", interval: str = "1d") -> dict:
    """
    Fetch historical OHLCV, compute technical indicators, and return Lightweight Charts payload.
    """
    sym = resolve_symbol(symbol)
    cache_key = f"{sym}_{timeframe}_{interval}"
    cached = cache.get("history", cache_key)
    if cached:
        return cached

    # Map timeframe to yfinance period
    # To compute 200 EMA without gaps, we fetch extra historical padding
    fetch_period_map = {
        "1mo": "6mo",
        "3mo": "1y",
        "6mo": "2y",
        "1y": "2y",
        "2y": "5y",
        "5y": "max",
        "max": "max",
    }
    fetch_period = fetch_period_map.get(timeframe, "max")

    t = yf.Ticker(sym, session=_yf_session)
    df = t.history(period=fetch_period, interval=interval, auto_adjust=True)

    if df.empty and not sym.endswith(".NS") and not any(c in sym for c in ["^", "=", "-"]):
        alt_t = yf.Ticker(f"{sym}.NS", session=_yf_session)
        df = alt_t.history(period=fetch_period, interval=interval, auto_adjust=True)

    if df.empty:
        return {
            "symbol": sym,
            "candles": [],
            "indicators": {},
            "observations": [],
        }

    # Reset index and sanitize datetime
    df = df.reset_index()
    date_col = "Date" if "Date" in df.columns else ("Datetime" if "Datetime" in df.columns else df.columns[0])
    df["Date"] = pd.to_datetime(df[date_col]).dt.tz_localize(None)

    # Apply all pure math indicators
    df = apply_all_indicators(df)
    observations = generate_technical_observations(df)

    # Filter to requested timeframe window for client display
    now = datetime.datetime.now()
    days_map = {
        "1mo": 31,
        "3mo": 92,
        "6mo": 183,
        "1y": 365,
        "2y": 730,
        "5y": 1825,
    }
    if timeframe in days_map:
        cutoff = now - datetime.timedelta(days=days_map[timeframe])
        df_display = df[df["Date"] >= cutoff].copy()
        if len(df_display) < 10:
            df_display = df.tail(30).copy()
    else:
        df_display = df.copy()

    candles = []
    volume_series = []
    sma_20 = []
    sma_50 = []
    sma_200 = []
    ema_50 = []
    ema_200 = []
    bb_upper = []
    bb_middle = []
    bb_lower = []
    rsi_series = []
    macd_series = []

    for _, row in df_display.iterrows():
        # Lightweight Charts format: date string "YYYY-MM-DD"
        time_str = row["Date"].strftime("%Y-%m-%d")
        c_open = round(float(row["Open"]), 4 if "=X" in sym else 2)
        c_high = round(float(row["High"]), 4 if "=X" in sym else 2)
        c_low = round(float(row["Low"]), 4 if "=X" in sym else 2)
        c_close = round(float(row["Close"]), 4 if "=X" in sym else 2)
        c_vol = int(row.get("Volume", 0))

        candles.append({
            "time": time_str,
            "open": c_open,
            "high": c_high,
            "low": c_low,
            "close": c_close,
            "volume": c_vol,
        })

        is_up = c_close >= c_open
        volume_series.append({
            "time": time_str,
            "value": c_vol,
            "color": "rgba(16, 185, 129, 0.45)" if is_up else "rgba(239, 68, 68, 0.45)",
        })

        # Indicator series
        if not np.isnan(row.get("SMA_20", np.nan)):
            sma_20.append({"time": time_str, "value": round(float(row["SMA_20"]), 2)})
        if not np.isnan(row.get("SMA_50", np.nan)):
            sma_50.append({"time": time_str, "value": round(float(row["SMA_50"]), 2)})
        if not np.isnan(row.get("SMA_200", np.nan)):
            sma_200.append({"time": time_str, "value": round(float(row["SMA_200"]), 2)})

        if not np.isnan(row.get("EMA_50", np.nan)):
            ema_50.append({"time": time_str, "value": round(float(row["EMA_50"]), 2)})
        if not np.isnan(row.get("EMA_200", np.nan)):
            ema_200.append({"time": time_str, "value": round(float(row["EMA_200"]), 2)})

        if not np.isnan(row.get("BB_Upper", np.nan)):
            bb_upper.append({"time": time_str, "value": round(float(row["BB_Upper"]), 2)})
            bb_middle.append({"time": time_str, "value": round(float(row["BB_Middle"]), 2)})
            bb_lower.append({"time": time_str, "value": round(float(row["BB_Lower"]), 2)})

        if not np.isnan(row.get("RSI", np.nan)):
            rsi_series.append({"time": time_str, "value": round(float(row["RSI"]), 2)})

        if not np.isnan(row.get("MACD", np.nan)) and not np.isnan(row.get("MACD_Signal", np.nan)):
            macd_series.append({
                "time": time_str,
                "macd": round(float(row["MACD"]), 2),
                "signal": round(float(row["MACD_Signal"]), 2),
                "hist": round(float(row["MACD_Hist"]), 2),
            })

    result = {
        "symbol": sym,
        "timeframe": timeframe,
        "candles": candles,
        "volume": volume_series,
        "indicators": {
            "sma_20": sma_20,
            "sma_50": sma_50,
            "sma_200": sma_200,
            "ema_50": ema_50,
            "ema_200": ema_200,
            "bb_upper": bb_upper,
            "bb_middle": bb_middle,
            "bb_lower": bb_lower,
            "rsi": rsi_series,
            "macd": macd_series,
        },
        "observations": observations,
        "exchange": (
            "NSE" if sym.endswith(".NS") or sym in ["^NSEI", "^NSEBANK"] else
            "BSE" if sym.endswith(".BO") or sym == "^BSESN" else
            ("CCY" if "=X" in sym else "Crypto" if "-USD" in sym else "US")
        ),
        "exchange_timezone": (
            "IST (UTC+5:30)" if sym.endswith(".NS") or sym.endswith(".BO") or sym in ["^NSEI", "^BSESN", "^NSEBANK"] else
            "UTC" if "=X" in sym or "-USD" in sym else
            "EDT (America/New_York)"
        ),
        "data_source": "Yahoo Finance",
        "last_updated": datetime.datetime.utcnow().isoformat() + "Z",
    }

    cache.set("history", cache_key, result, ttl=settings.L1_STOCK_HISTORY_TTL)
    return result


def get_market_overview() -> dict:
    """
    Fetch hero index (NIFTY 50), multi-asset macro dashboard (Crypto, Forex, Indices, Commodities),
    and community trends.
    """
    cached = cache.get("market", "overview")
    if cached:
        return cached

    # 1. Hero Index: Try NSE Direct for Nifty 50, fallback to yfinance
    hero_nifty = None
    try:
        nse_hero = nse_client.get_index_quote("NIFTY 50")
        if nse_hero and nse_hero.get("price"):
            hero_nifty = {
                "symbol": "^NSEI",
                "name": "NIFTY 50",
                "price": nse_hero["price"],
                "change": nse_hero["change"],
                "change_pct": nse_hero["change_pct"],
                "high": nse_hero.get("high"),
                "low": nse_hero.get("low"),
                "source": "NSE Direct",
                "is_stale": False,
            }
    except Exception as e:
        logger.warning(f"Direct NSE hero fetch error: {e}")

    # Fallback hero to yfinance
    if not hero_nifty:
        try:
            t = yf.Ticker("^NSEI", session=_yf_session)
            fast = getattr(t, "fast_info", None)
            p = _get_fast_info_val(fast, "last_price", "lastPrice")
            pc = _get_fast_info_val(fast, "previous_close", "previousClose")
            dh = _get_fast_info_val(fast, "day_high", "dayHigh")
            dl = _get_fast_info_val(fast, "day_low", "dayLow")

            if p is None or p <= 0:
                h = t.history(period="5d")
                if not h.empty and "Close" in h.columns:
                    p = float(h["Close"].dropna().iloc[-1])
                    pc = float(h["Close"].dropna().iloc[-2]) if len(h) > 1 else p
                    if "High" in h.columns:
                        dh = float(h["High"].dropna().iloc[-1])
                    if "Low" in h.columns:
                        dl = float(h["Low"].dropna().iloc[-1])

            if p and p > 0:
                pc = pc or p
                c = p - pc
                cp = (c / pc * 100) if pc else 0.0
                hero_nifty = {
                    "symbol": "^NSEI",
                    "name": "NIFTY 50",
                    "price": round(p, 2),
                    "change": round(c, 2),
                    "change_pct": round(cp, 2),
                    "high": round(dh, 2) if dh is not None else None,
                    "low": round(dl, 2) if dl is not None else None,
                    "source": "yfinance",
                    "is_stale": False,
                }
        except Exception as e:
            logger.warning(f"yfinance hero fetch error: {e}")

    # If live hero fetch failed, fallback to previously cached real data marked as stale, or honest offline state
    if not hero_nifty:
        stale_market = cache.get("market", "overview_stale")
        if stale_market and stale_market.get("hero") and stale_market["hero"].get("price") is not None:
            hero_nifty = dict(stale_market["hero"])
            hero_nifty["is_stale"] = True
            hero_nifty["source"] = f"{hero_nifty.get('source', 'yfinance')} (Stale Cache)"
        else:
            hero_nifty = {
                "symbol": "^NSEI",
                "name": "NIFTY 50",
                "price": None,
                "change": None,
                "change_pct": None,
                "high": None,
                "low": None,
                "is_stale": False,
                "source": "Feed Offline",
                "status": "unavailable",
            }

    # 2. Multi-Asset Macro Snapshot
    macro_symbols = [
        # Indices
        {"symbol": "^NSEI", "name": "NIFTY 50", "category": "Indices"},
        {"symbol": "^BSESN", "name": "SENSEX", "category": "Indices"},
        {"symbol": "^NSEBANK", "name": "BANK NIFTY", "category": "Indices"},
        {"symbol": "^GSPC", "name": "S&P 500", "category": "Indices"},
        {"symbol": "^IXIC", "name": "NASDAQ", "category": "Indices"},
        {"symbol": "^FTSE", "name": "FTSE 100", "category": "Indices"},
        {"symbol": "^N225", "name": "NIKKEI 225", "category": "Indices"},

        # Forex Major Pairs
        {"symbol": "EURUSD=X", "name": "EUR/USD", "category": "Forex"},
        {"symbol": "USDJPY=X", "name": "USD/JPY", "category": "Forex"},
        {"symbol": "GBPUSD=X", "name": "GBP/USD", "category": "Forex"},
        {"symbol": "USDCHF=X", "name": "USD/CHF", "category": "Forex"},
        {"symbol": "AUDUSD=X", "name": "AUD/USD", "category": "Forex"},
        {"symbol": "USDCAD=X", "name": "USD/CAD", "category": "Forex"},
        {"symbol": "NZDUSD=X", "name": "NZD/USD", "category": "Forex"},
        {"symbol": "USDINR=X", "name": "USD/INR", "category": "Forex"},

        # Commodities
        {"symbol": "GC=F", "name": "Gold", "category": "Commodities"},
        {"symbol": "SI=F", "name": "Silver", "category": "Commodities"},
        {"symbol": "CL=F", "name": "Crude Oil", "category": "Commodities"},

        # Crypto
        {"symbol": "BTC-USD", "name": "Bitcoin", "category": "Crypto"},
        {"symbol": "ETH-USD", "name": "Ethereum", "category": "Crypto"},
        {"symbol": "SOL-USD", "name": "Solana", "category": "Crypto"},
    ]

    macro_results = {
        "Indices": [],
        "Forex": [],
        "Commodities": [],
        "Crypto": [],
    }

    try:
        sym_str = " ".join([m["symbol"] for m in macro_symbols])
        batch = yf.Tickers(sym_str)
        for m in macro_symbols:
            sym = m["symbol"]
            cat = m["category"]
            try:
                t = batch.tickers.get(sym)
                fast = getattr(t, "fast_info", None) if t else None
                last = _get_fast_info_val(fast, "last_price", "lastPrice")
                prev = _get_fast_info_val(fast, "previous_close", "previousClose")
                if last is None and t:
                    h = t.history(period="5d")
                    if not h.empty and "Close" in h.columns:
                        last = float(h["Close"].dropna().iloc[-1])
                        prev = float(h["Close"].dropna().iloc[-2]) if len(h) > 1 else last

                if last is not None and last > 0:
                    prev = prev or last
                    chg = last - prev
                    chg_pct = (chg / prev * 100) if prev else 0.0
                    decimals = 4 if cat == "Forex" else 2
                    macro_results[cat].append({
                        "symbol": sym,
                        "name": m["name"],
                        "price": round(last, decimals),
                        "change": round(chg, decimals),
                        "change_pct": round(chg_pct, 2),
                    })
            except Exception as e:
                logger.debug(f"Failed extracting macro asset {sym}: {e}")
                continue
    except Exception as e:
        logger.warning(f"Batch macro ticker fetch failed: {e}")

    # If any macro category failed completely, check for stale real cache rather than inventing fictional numbers
    stale_market = cache.get("market", "overview_stale")
    if stale_market and stale_market.get("macro"):
        for cat in macro_results:
            if not macro_results[cat] and stale_market["macro"].get(cat):
                macro_results[cat] = [
                    {**item, "is_stale": True}
                    for item in stale_market["macro"][cat]
                ]

    # Top Trending & Community Leaders
    trending = [
        {"symbol": "RELIANCE.NS", "name": "Reliance", "change_pct": 1.45, "volume_str": "8.4M", "sentiment": "Bullish (78%)"},
        {"symbol": "TCS.NS", "name": "TCS", "change_pct": 0.82, "volume_str": "3.1M", "sentiment": "Neutral (54%)"},
        {"symbol": "NVDA", "name": "NVIDIA", "change_pct": 3.12, "volume_str": "45.2M", "sentiment": "Strong Bullish (88%)"},
        {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "change_pct": -0.65, "volume_str": "12.8M", "sentiment": "Consolidating (48%)"},
        {"symbol": "BTC-USD", "name": "Bitcoin", "change_pct": 2.80, "volume_str": "$28.4B", "sentiment": "Bullish (82%)"},
    ]

    overview_data = {
        "hero": hero_nifty,
        "macro": macro_results,
        "trending": trending,
        "market_status": "Open" if 9 <= datetime.datetime.now().hour <= 16 else "Closed",
        "last_updated": datetime.datetime.utcnow().isoformat() + "Z",
    }

    cache.set("market", "overview", overview_data, ttl=settings.L1_MARKET_OVERVIEW_TTL)

    # Persist genuine live snapshot as stale fallback backup if valid
    if hero_nifty and hero_nifty.get("price") is not None and not hero_nifty.get("is_stale"):
        cache.set("market", "overview_stale", overview_data, ttl=604800)  # 7 days

    return overview_data


_pending_watchlist_symbols = set()


def get_batch_stock_overview(symbols: list[str]) -> list[dict]:
    """
    CACHE-ONLY BATCH CONTRACT:
    Returns immediately whatever is available in L1/L2 cache.
    Never blocks on live upstream yfinance/NSE fetches to prevent burst-induced rate limiting.
    Uncached symbols are marked with status='pending' and enqueued for the scheduled background warmer.
    """
    results = []
    # Cap input to max 50 symbols for security and performance
    sanitized_symbols = [str(s).strip() for s in symbols if s][:50]

    for raw_sym in sanitized_symbols:
        sym = resolve_symbol(raw_sym)
        cached = cache.get("overview", sym)

        if cached:
            item = dict(cached)
            item["status"] = "cached"
            results.append(item)
        else:
            # Enqueue for gentle scheduled background warming
            _pending_watchlist_symbols.add(sym)
            results.append({
                "symbol": sym,
                "name": sym,
                "status": "pending",
                "current_price": None,
                "change": None,
                "change_pct": None,
                "currency_symbol": "₹" if sym.endswith(".NS") or sym.endswith(".BO") else "$",
                "market_cap_str": "—",
                "message": "Asset quote is queued for scheduled cache warmup.",
            })

    return results


def warm_all_caches() -> dict:
    """
    CRITICAL WORKER: Triggered by POST /internal/refresh-cache.
    Executes in background with distributed locking (Redis SETNX with TTL)
    so multiple Uvicorn workers (--workers 2) or scaled container instances
    never execute overlapping warmup cycles.
    Applies randomized jittered pacing to prevent burst detection.
    """
    # Acquire distributed lock (180s safety TTL)
    acquired = cache.acquire_lock("warming", ttl=180)
    if not acquired:
        logger.info("Distributed lock 'lock:warming' is already held. Skipping overlapping run.")
        return {"status": "skipped", "message": "Warmup already executing on another worker or instance."}

    start_time = time.time()
    warmed_count = 0
    errors = []

    try:
        # 1. Warm Market Overview
        try:
            get_market_overview()
            warmed_count += 1
        except Exception as e:
            errors.append(f"Market overview: {str(e)}")

        # 2. Warm Core Universe Assets (both overview and 1y history)
        core_universe = [
            "^NSEI", "^BSESN", "^NSEBANK",
            "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "SBIN.NS",
            "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA",
            "BTC-USD", "ETH-USD",
            "EURUSD=X", "USDJPY=X", "GBPUSD=X", "USDINR=X",
            "GC=F", "CL=F",
        ]

        for sym in core_universe:
            try:
                get_stock_overview(sym)
                get_stock_history(sym, timeframe="max")
                warmed_count += 1
                # Randomized jittered pause between fetches to look human and avoid rate limits
                time.sleep(random.uniform(0.15, 0.35))
            except Exception as e:
                errors.append(f"{sym}: {str(e)}")

        # 3. Warm any user-requested Watchlist symbols queued from batch queries (up to 10 per run)
        global _pending_watchlist_symbols
        to_warm_watchlist = list(_pending_watchlist_symbols)[:10]
        for sym in to_warm_watchlist:
            try:
                get_stock_overview(sym)
                warmed_count += 1
                _pending_watchlist_symbols.discard(sym)
                time.sleep(random.uniform(0.15, 0.35))
            except Exception as e:
                errors.append(f"Watchlist item {sym}: {str(e)}")

        elapsed = round(time.time() - start_time, 2)
        logger.info(f"Cache warm completed in {elapsed}s. Warmed {warmed_count} assets.")

        return {
            "status": "success",
            "warmed_assets_count": warmed_count,
            "duration_seconds": elapsed,
            "errors": errors,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }
    finally:
        cache.release_lock("warming")
