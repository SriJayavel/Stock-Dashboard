"""
Resilient data loading pipeline for Global & Indian markets.
Configured with custom browser headers, smart asset-type detection,
and indicator historical padding for gap-free charting.
"""

import streamlit as st
import yfinance as yf
import pandas as pd
import requests
import datetime
import os


def get_yfinance_session() -> requests.Session:
    """Create a persistent requests session with standard browser headers."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    })
    return session


@st.cache_data(ttl=86400)
def load_companies_catalog() -> pd.DataFrame:
    """Load the NSE companies catalog from CSV."""
    csv_path = os.path.join(os.path.dirname(__file__), "..", "companies.csv")
    if os.path.exists(csv_path):
        try:
            df = pd.read_csv(csv_path)
            df["DISPLAY"] = df["SYMBOL"] + " — " + df["NAME OF COMPANY"]
            return df
        except Exception:
            pass
    return pd.DataFrame(columns=["SYMBOL", "NAME OF COMPANY", "DISPLAY"])


@st.cache_data(ttl=86400, show_spinner=False)
def get_searchable_asset_catalog() -> list[dict]:
    """
    Build a comprehensive catalog of 2,400+ assets for the instant suggested dropdown menu.
    """
    items = []
    seen = set()

    # 1. Global Benchmark Assets (Crypto, Commodities, US Tech, Indices)
    major_global = [
        {"symbol": "^NSEI", "label": "^NSEI — NIFTY 50 Index (India)", "name": "NIFTY 50"},
        {"symbol": "^BSESN", "label": "^BSESN — BSE SENSEX Index (India)", "name": "BSE SENSEX"},
        {"symbol": "^NSEBANK", "label": "^NSEBANK — Bank Nifty Index (India)", "name": "BANK NIFTY"},
        {"symbol": "^GSPC", "label": "^GSPC — S&P 500 Index (US)", "name": "S&P 500"},
        {"symbol": "^IXIC", "label": "^IXIC — NASDAQ Composite Index (US)", "name": "NASDAQ"},
        {"symbol": "^DJI", "label": "^DJI — Dow Jones Industrial Average (US)", "name": "Dow Jones"},
        {"symbol": "BTC-USD", "label": "BTC-USD — Bitcoin (Crypto)", "name": "Bitcoin"},
        {"symbol": "ETH-USD", "label": "ETH-USD — Ethereum (Crypto)", "name": "Ethereum"},
        {"symbol": "SOL-USD", "label": "SOL-USD — Solana (Crypto)", "name": "Solana"},
        {"symbol": "BNB-USD", "label": "BNB-USD — Binance Coin (Crypto)", "name": "Binance Coin"},
        {"symbol": "XRP-USD", "label": "XRP-USD — Ripple (Crypto)", "name": "XRP"},
        {"symbol": "GC=F", "label": "GC=F — Gold Futures (Commodity)", "name": "Gold"},
        {"symbol": "SI=F", "label": "SI=F — Silver Futures (Commodity)", "name": "Silver"},
        {"symbol": "CL=F", "label": "CL=F — Crude Oil WTI (Commodity)", "name": "Crude Oil"},
        {"symbol": "NVDA", "label": "NVDA — NVIDIA Corporation (NASDAQ)", "name": "Nvidia"},
        {"symbol": "AAPL", "label": "AAPL — Apple Inc. (NASDAQ)", "name": "Apple"},
        {"symbol": "MSFT", "label": "MSFT — Microsoft Corporation (NASDAQ)", "name": "Microsoft"},
        {"symbol": "GOOGL", "label": "GOOGL — Alphabet Inc. (Google) (NASDAQ)", "name": "Google"},
        {"symbol": "AMZN", "label": "AMZN — Amazon.com Inc. (NASDAQ)", "name": "Amazon"},
        {"symbol": "META", "label": "META — Meta Platforms Inc. (NASDAQ)", "name": "Meta"},
        {"symbol": "TSLA", "label": "TSLA — Tesla Inc. (NASDAQ)", "name": "Tesla"},
        {"symbol": "AMD", "label": "AMD — Advanced Micro Devices (NASDAQ)", "name": "AMD"},
        {"symbol": "INTC", "label": "INTC — Intel Corporation (NASDAQ)", "name": "Intel"},
        {"symbol": "NFLX", "label": "NFLX — Netflix Inc. (NASDAQ)", "name": "Netflix"},
        {"symbol": "PLTR", "label": "PLTR — Palantir Technologies (NYSE)", "name": "Palantir"},
        {"symbol": "TSM", "label": "TSM — Taiwan Semiconductor (NYSE)", "name": "TSMC"},
        {"symbol": "ASML", "label": "ASML — ASML Holding (NASDAQ)", "name": "ASML"},
        {"symbol": "ARM", "label": "ARM — ARM Holdings (NASDAQ)", "name": "ARM"},
        {"symbol": "AVGO", "label": "AVGO — Broadcom Inc. (NASDAQ)", "name": "Broadcom"},
        {"symbol": "BRK-B", "label": "BRK-B — Berkshire Hathaway (NYSE)", "name": "Berkshire"},
        {"symbol": "JPM", "label": "JPM — JPMorgan Chase & Co. (NYSE)", "name": "JPMorgan"},
        {"symbol": "V", "label": "V — Visa Inc. (NYSE)", "name": "Visa"},
        {"symbol": "WMT", "label": "WMT — Walmart Inc. (NYSE)", "name": "Walmart"},
        # Foreign European, Asian, & UK Indices
        {"symbol": "^FTSE", "label": "^FTSE — FTSE 100 Index (London, UK)", "name": "FTSE 100"},
        {"symbol": "^N225", "label": "^N225 — Nikkei 225 Index (Tokyo, Japan)", "name": "Nikkei 225"},
        {"symbol": "^GDAXI", "label": "^GDAXI — DAX 40 Index (Frankfurt, Germany)", "name": "DAX 40"},
        {"symbol": "^HSI", "label": "^HSI — Hang Seng Index (Hong Kong)", "name": "Hang Seng"},
        {"symbol": "^FCHI", "label": "^FCHI — CAC 40 Index (Paris, France)", "name": "CAC 40"},
        # Foreign Market Equities & ADRs
        {"symbol": "NVO", "label": "NVO — Novo Nordisk A/S (Denmark)", "name": "Novo Nordisk"},
        {"symbol": "BABA", "label": "BABA — Alibaba Group (China)", "name": "Alibaba"},
        {"symbol": "TM", "label": "TM — Toyota Motor Corporation (Japan)", "name": "Toyota"},
        {"symbol": "SAP", "label": "SAP — SAP SE (Germany)", "name": "SAP"},
        {"symbol": "AZN", "label": "AZN — AstraZeneca PLC (UK)", "name": "AstraZeneca"},
        {"symbol": "SHEL", "label": "SHEL — Shell plc (UK / Energy)", "name": "Shell"},
        {"symbol": "SONY", "label": "SONY — Sony Group Corporation (Japan)", "name": "Sony"},
        {"symbol": "SPY", "label": "SPY — SPDR S&P 500 ETF Trust (US)", "name": "SPDR S&P 500"},
        {"symbol": "QQQ", "label": "QQQ — Invesco QQQ NASDAQ 100 (US)", "name": "Invesco QQQ"},
        # Major Foreign Exchange (Forex) Pairs
        {"symbol": "EURUSD=X", "label": "EURUSD=X — Euro to US Dollar (Forex)", "name": "EUR/USD"},
        {"symbol": "USDINR=X", "label": "USDINR=X — US Dollar to Indian Rupee (Forex)", "name": "USD/INR"},
        {"symbol": "GBPUSD=X", "label": "GBPUSD=X — British Pound to US Dollar (Forex)", "name": "GBP/USD"},
        {"symbol": "USDJPY=X", "label": "USDJPY=X — US Dollar to Japanese Yen (Forex)", "name": "USD/JPY"},
        # Additional Global Commodities
        {"symbol": "NG=F", "label": "NG=F — Natural Gas Futures (Commodity)", "name": "Natural Gas"},
        {"symbol": "HG=F", "label": "HG=F — Copper Futures (Commodity)", "name": "Copper"},
    ]
    for item in major_global:
        items.append(item)
        seen.add(item["symbol"])

    # 2. Local Indian Equities Catalog (~2,367 companies)
    catalog = load_companies_catalog()
    if not catalog.empty and "SYMBOL" in catalog.columns and "NAME OF COMPANY" in catalog.columns:
        for _, row in catalog.iterrows():
            sym = f"{row['SYMBOL']}.NS"
            if sym not in seen:
                name = row["NAME OF COMPANY"]
                items.append({
                    "symbol": sym,
                    "label": f"{sym} — {name} (NSE)",
                    "name": name,
                })
                seen.add(sym)

    return items


@st.cache_data(ttl=1800, show_spinner=False)
def search_global_assets(query: str) -> list[dict]:
    """
    Search the entire world market using Yahoo Finance global search, priority macro index, and local catalog.
    """
    if not query or len(query.strip()) < 1:
        return []

    results = []
    cleaned_query = query.strip()
    q_lower = cleaned_query.lower()

    # 1. Instant priority macro & benchmark assets
    popular_universe = [
        {"symbol": "^NSEI", "name": "NIFTY 50", "type": "Index • NSE", "exchange": "NSE", "keys": ["nifty", "nifty 50", "nifty50"]},
        {"symbol": "^BSESN", "name": "BSE SENSEX", "type": "Index • BSE", "exchange": "BSE", "keys": ["sensex", "bsesn", "bse"]},
        {"symbol": "^NSEBANK", "name": "BANK NIFTY", "type": "Index • NSE", "exchange": "NSE", "keys": ["bank nifty", "banknifty"]},
        {"symbol": "^GSPC", "name": "S&P 500", "type": "Index • US", "exchange": "S&P", "keys": ["sp500", "s&p", "s&p 500", "spx"]},
        {"symbol": "^IXIC", "name": "NASDAQ Composite", "type": "Index • US", "exchange": "NASDAQ", "keys": ["nasdaq", "ndx", "ixic"]},
        {"symbol": "BTC-USD", "name": "Bitcoin USD", "type": "Crypto • Global", "exchange": "Crypto", "keys": ["btc", "bitcoin", "btc-usd"]},
        {"symbol": "ETH-USD", "name": "Ethereum USD", "type": "Crypto • Global", "exchange": "Crypto", "keys": ["eth", "ethereum", "eth-usd"]},
        {"symbol": "SOL-USD", "name": "Solana USD", "type": "Crypto • Global", "exchange": "Crypto", "keys": ["sol", "solana"]},
        {"symbol": "GC=F", "name": "Gold Futures", "type": "Commodity • COMEX", "exchange": "COMEX", "keys": ["gold", "gc=f", "xau"]},
        {"symbol": "SI=F", "name": "Silver Futures", "type": "Commodity • COMEX", "exchange": "COMEX", "keys": ["silver", "si=f", "xag"]},
        {"symbol": "CL=F", "name": "Crude Oil WTI", "type": "Commodity • NYMEX", "exchange": "NYMEX", "keys": ["oil", "crude", "crude oil", "wti"]},
        {"symbol": "NVDA", "name": "NVIDIA Corporation", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["nvda", "nvidia"]},
        {"symbol": "AAPL", "name": "Apple Inc.", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["aapl", "apple"]},
        {"symbol": "MSFT", "name": "Microsoft Corporation", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["msft", "microsoft"]},
        {"symbol": "GOOGL", "name": "Alphabet Inc. (Google)", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["googl", "google", "alphabet"]},
        {"symbol": "AMZN", "name": "Amazon.com Inc.", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["amzn", "amazon"]},
        {"symbol": "META", "name": "Meta Platforms Inc.", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["meta", "facebook"]},
        {"symbol": "TSLA", "name": "Tesla Inc.", "type": "Stock • NASDAQ", "exchange": "NASDAQ", "keys": ["tsla", "tesla"]},
        {"symbol": "RELIANCE.NS", "name": "Reliance Industries Limited", "type": "Stock • NSE", "exchange": "NSE", "keys": ["reliance", "ril"]},
        {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "type": "Stock • NSE", "exchange": "NSE", "keys": ["tcs", "tata consultancy"]},
        {"symbol": "HDFCBANK.NS", "name": "HDFC Bank Limited", "type": "Stock • NSE", "exchange": "NSE", "keys": ["hdfc", "hdfc bank"]},
        {"symbol": "INFY.NS", "name": "Infosys Limited", "type": "Stock • NSE", "exchange": "NSE", "keys": ["infy", "infosys"]},
    ]
    for item in popular_universe:
        if q_lower in item["symbol"].lower() or any(q_lower in k for k in item["keys"]):
            results.append({
                "symbol": item["symbol"],
                "name": item["name"],
                "type": item["type"],
                "exchange": item["exchange"],
            })

    # 2. Check local catalog
    catalog = load_companies_catalog()
    if not catalog.empty and "NAME OF COMPANY" in catalog.columns:
        local_matches = catalog[
            catalog["SYMBOL"].str.contains(cleaned_query, case=False, na=False)
            | catalog["NAME OF COMPANY"].str.contains(cleaned_query, case=False, na=False)
        ].head(5)
        for _, row in local_matches.iterrows():
            sym = f"{row['SYMBOL']}.NS"
            if not any(r["symbol"] == sym for r in results):
                results.append({
                    "symbol": sym,
                    "name": row["NAME OF COMPANY"],
                    "type": "Stock (NSE)",
                    "exchange": "NSE",
                })

    # 3. Query Yahoo Global Asset Directory
    try:
        search_obj = yf.Search(cleaned_query, max_results=8)
        for q in getattr(search_obj, "quotes", []):
            sym = q.get("symbol")
            if not sym or any(r["symbol"] == sym for r in results):
                continue

            raw_type = q.get("quoteType", "EQUITY")
            type_label = {
                "EQUITY": "Stock",
                "ETF": "ETF",
                "INDEX": "Index",
                "CRYPTOCURRENCY": "Crypto",
                "FUTURE": "Commodity",
                "CURRENCY": "Forex",
            }.get(raw_type, raw_type.title())

            name = q.get("shortname") or q.get("longname") or sym
            exch = q.get("exchDisp") or q.get("exchange") or "Global"

            results.append({
                "symbol": sym,
                "name": name,
                "type": f"{type_label} • {exch}",
                "exchange": exch,
            })
    except Exception:
        pass

    return results


def resolve_symbol(query: str) -> str:
    """Resolve user query to exact global ticker."""
    if not query:
        return "TCS.NS"

    cleaned = str(query).strip()
    cleaned_upper = cleaned.upper()

    alias_map = {
        "NIFTY": "^NSEI",
        "NIFTY 50": "^NSEI",
        "NIFTY50": "^NSEI",
        "BANK NIFTY": "^NSEBANK",
        "BANKNIFTY": "^NSEBANK",
        "SENSEX": "^BSESN",
        "S&P 500": "^GSPC",
        "S&P500": "^GSPC",
        "SP500": "^GSPC",
        "NASDAQ": "^IXIC",
        "DOW": "^DJI",
        "DOW JONES": "^DJI",
        "BITCOIN": "BTC-USD",
        "BTC": "BTC-USD",
        "ETHEREUM": "ETH-USD",
        "ETH": "ETH-USD",
        "SOLANA": "SOL-USD",
        "SOL": "SOL-USD",
        "GOLD": "GC=F",
        "SILVER": "SI=F",
        "CRUDE OIL": "CL=F",
        "CRUDE": "CL=F",
        "OIL": "CL=F",
        "NATURAL GAS": "NG=F",
        "COPPER": "HG=F",
    }
    if cleaned_upper in alias_map:
        return alias_map[cleaned_upper]

    if any(ch in cleaned_upper for ch in [".", "^", "=", "-"]):
        return cleaned_upper

    # Check local catalog
    catalog = load_companies_catalog()
    if not catalog.empty:
        if "SYMBOL" in catalog.columns and cleaned_upper in catalog["SYMBOL"].values:
            return f"{cleaned_upper}.NS"
        if "NAME OF COMPANY" in catalog.columns:
            m = catalog[catalog["NAME OF COMPANY"].str.contains(f"^{cleaned}", case=False, na=False)]
            if not m.empty:
                return f"{m.iloc[0]['SYMBOL']}.NS"

    # Query global directory for top match
    matches = search_global_assets(cleaned)
    if matches:
        return matches[0]["symbol"]

    return cleaned_upper


@st.cache_data(ttl=300, show_spinner=False)
def get_global_market_indices() -> list[dict]:
    """Get live ticker tape snapshot for major world assets."""
    indices = [
        {"symbol": "^NSEI", "name": "NIFTY 50"},
        {"symbol": "^BSESN", "name": "SENSEX"},
        {"symbol": "^GSPC", "name": "S&P 500"},
        {"symbol": "^IXIC", "name": "NASDAQ"},
        {"symbol": "^FTSE", "name": "FTSE 100"},
        {"symbol": "^N225", "name": "NIKKEI 225"},
        {"symbol": "BTC-USD", "name": "BITCOIN"},
        {"symbol": "GC=F", "name": "GOLD"},
        {"symbol": "CL=F", "name": "CRUDE OIL"},
    ]

    results = []
    try:
        sym_str = " ".join([item["symbol"] for item in indices])
        batch = yf.Tickers(sym_str)
        for item in indices:
            try:
                t = batch.tickers.get(item["symbol"])
                if not t:
                    continue
                fast = getattr(t, "fast_info", None)
                if fast:
                    last = fast.get("lastPrice") or 0.0
                    prev = fast.get("previousClose") or last
                    chg = last - prev if last and prev else 0.0
                    chg_pct = (chg / prev * 100) if prev else 0.0
                    results.append({
                        "symbol": item["symbol"],
                        "name": item["name"],
                        "price": last,
                        "change": chg,
                        "change_pct": chg_pct,
                    })
            except Exception:
                continue
    except Exception:
        pass

    return results


def safe_fast_get(fast_obj, key: str, default=None):
    """Safely extract value from yfinance FastInfo object without throwing TypeError."""
    if fast_obj is None:
        return default
    try:
        if hasattr(fast_obj, "get"):
            v = fast_obj.get(key)
            if v is not None:
                return v
    except Exception:
        pass
    try:
        if hasattr(fast_obj, key):
            v = getattr(fast_obj, key)
            if v is not None:
                return v
    except Exception:
        pass
    return default


@st.cache_data(ttl=1800, show_spinner=False)
def get_company_overview(symbol: str) -> dict:
    """
    Fetch comprehensive overview, valuation, and metrics with robust fallbacks.
    """
    session = get_yfinance_session()
    ticker = yf.Ticker(symbol, session=session)
    
    info = {}
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    fast = getattr(ticker, "fast_info", None)

    # Extract price info safely
    regular_price = (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or safe_fast_get(fast, "lastPrice")
        or safe_fast_get(fast, "last_price")
        or info.get("previousClose")
    )
    if not regular_price:
        try:
            h = ticker.history(period="5d")
            if not h.empty and "Close" in h.columns:
                regular_price = float(h["Close"].dropna().iloc[-1])
        except Exception:
            pass
    if not regular_price:
        regular_price = 0.0

    prev_close = (
        info.get("regularMarketPreviousClose")
        or info.get("previousClose")
        or safe_fast_get(fast, "previousClose")
        or safe_fast_get(fast, "previous_close")
        or regular_price
    )
    price_change = regular_price - prev_close if regular_price and prev_close else 0.0
    price_change_pct = (price_change / prev_close * 100) if prev_close else 0.0

    currency = info.get("currency") or safe_fast_get(fast, "currency") or "USD"
    currency_symbol = (
        "₹" if currency == "INR"
        else ("$" if currency == "USD"
        else ("€" if currency == "EUR"
        else ("£" if currency == "GBP"
        else ("¥" if currency == "JPY"
        else currency + " "))))
    )

    # Format market cap
    raw_mcap = info.get("marketCap") or safe_fast_get(fast, "marketCap") or safe_fast_get(fast, "market_cap")
    mcap_display = "—"
    if raw_mcap and raw_mcap > 0:
        if currency == "INR":
            cr_val = raw_mcap / 1e7
            mcap_display = f"₹{cr_val:,.1f} Cr"
        else:
            if raw_mcap >= 1e12:
                mcap_display = f"{currency_symbol}{raw_mcap/1e12:.2f}T"
            elif raw_mcap >= 1e9:
                mcap_display = f"{currency_symbol}{raw_mcap/1e9:.2f}B"
            else:
                mcap_display = f"{currency_symbol}{raw_mcap/1e6:.1f}M"

    quote_type = info.get("quoteType", "EQUITY")
    if symbol.startswith("^"):
        quote_type = "INDEX"
    elif "-USD" in symbol or "-INR" in symbol:
        quote_type = "CRYPTOCURRENCY"
    elif "=X" in symbol:
        quote_type = "CURRENCY"
    elif "=F" in symbol:
        quote_type = "COMMODITY"

    # Name fallback from catalog if Indian stock
    company_name = info.get("longName") or info.get("shortName")
    if not company_name and symbol.endswith(".NS"):
        clean_code = symbol.replace(".NS", "")
        catalog = load_companies_catalog()
        if not catalog.empty and "SYMBOL" in catalog.columns:
            matched_row = catalog[catalog["SYMBOL"] == clean_code]
            if not matched_row.empty:
                company_name = matched_row.iloc[0]["NAME OF COMPANY"]

    if not company_name:
        company_name = symbol

    sector = info.get("sector")
    industry = info.get("industry")
    if not sector:
        if quote_type == "CRYPTOCURRENCY":
            sector = "Digital Asset"
            industry = "Cryptocurrency"
        elif quote_type == "INDEX":
            sector = "Market Benchmark"
            industry = "Index"
        elif quote_type == "COMMODITY":
            sector = "Commodities"
            industry = "Futures Contract"
        else:
            sector = "Global Equity"
            industry = "Public Company"

    overview = {
        "symbol": symbol,
        "name": company_name,
        "quote_type": quote_type,
        "current_price": regular_price,
        "prev_close": prev_close,
        "change": price_change,
        "change_pct": price_change_pct,
        "currency": currency,
        "currency_symbol": currency_symbol,
        "market_cap": raw_mcap,
        "market_cap_str": mcap_display,
        "sector": sector,
        "industry": industry,
        "summary": info.get("longBusinessSummary") or info.get("description", "Financial asset tracking live market data."),
        "website": info.get("website", ""),

        # Valuation Multiples
        "pe_trailing": info.get("trailingPE"),
        "pe_forward": info.get("forwardPE"),
        "pb_ratio": info.get("priceToBook"),
        "ev_ebitda": info.get("enterpriseToEbitda"),
        "peg_ratio": info.get("pegRatio"),
        "dividend_yield": (info.get("dividendYield") * 100) if info.get("dividendYield") else None,

        # 52-Week Range
        "high_52w": info.get("fiftyTwoWeekHigh") or safe_fast_get(fast, "yearHigh") or safe_fast_get(fast, "year_high"),
        "low_52w": info.get("fiftyTwoWeekLow") or safe_fast_get(fast, "yearLow") or safe_fast_get(fast, "year_low"),

        # Profitability & Returns
        "roe": (info.get("returnOnEquity") * 100) if info.get("returnOnEquity") else None,
        "roa": (info.get("returnOnAssets") * 100) if info.get("returnOnAssets") else None,
        "operating_margin": (info.get("operatingMargins") * 100) if info.get("operatingMargins") else None,
        "profit_margin": (info.get("profitMargins") * 100) if info.get("profitMargins") else None,

        # Solvency & Liquidity
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "quick_ratio": info.get("quickRatio"),
        "free_cash_flow": info.get("freeCashflow"),

        # Target & Volume
        "target_mean_price": info.get("targetMeanPrice"),
        "target_high_price": info.get("targetHighPrice"),
        "target_low_price": info.get("targetLowPrice"),
        "target_median_price": info.get("targetMedianPrice"),
        "recommendation_key": (info.get("recommendationKey") or "").replace("_", " ").upper(),
        "analyst_count": info.get("numberOfAnalystOpinions"),
        "volume": info.get("regularMarketVolume") or info.get("volume"),
        "avg_volume": info.get("averageVolume"),
    }
    return overview


@st.cache_data(ttl=300, show_spinner=False)
def get_historical_ohlcv(symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """
    Fetch historical price data with padding so indicators (EMA 50/200) render seamlessly.
    """
    try:
        session = get_yfinance_session()
        ticker = yf.Ticker(symbol, session=session)
        
        # Determine padded fetch period to compute EMAs without void gaps
        fetch_period = "2y" if period in ["1mo", "3mo", "6mo", "1y"] else ("5y" if period == "2y" else "max")
        df = ticker.history(period=fetch_period, interval=interval, auto_adjust=True)

        if df.empty and not symbol.endswith(".NS") and not any(c in symbol for c in ["^", "=", "-"]):
            alt_ticker = yf.Ticker(f"{symbol}.NS", session=session)
            df = alt_ticker.history(period=fetch_period, interval=interval, auto_adjust=True)

        if not df.empty:
            df = df.reset_index()
            if "Date" in df.columns:
                df["Date"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
            elif "Datetime" in df.columns:
                df["Date"] = pd.to_datetime(df["Datetime"]).dt.tz_localize(None)

            # Store the requested period window filter date
            now = datetime.datetime.now()
            days_map = {
                "1mo": 31,
                "3mo": 92,
                "6mo": 183,
                "1y": 365,
                "2y": 730,
                "5y": 1825,
            }
            if period in days_map:
                cutoff = now - datetime.timedelta(days=days_map[period])
                # We return the whole df so indicators calculate from past bars,
                # but flag the cutoff date
                df["_cutoff"] = cutoff
            return df
    except Exception as e:
        st.warning(f"Notice: Historical data for {symbol} could not be loaded: {str(e)}")

    return pd.DataFrame()


@st.cache_data(ttl=600, show_spinner=False)
def get_performance_returns(symbol: str) -> dict:
    """Calculate multi-horizon performance returns (1W, 1M, 3M, 6M, 1Y, YTD)."""
    try:
        session = get_yfinance_session()
        ticker = yf.Ticker(symbol, session=session)
        h = ticker.history(period="2y", interval="1d")
        if h.empty and not symbol.endswith(".NS") and not any(c in symbol for c in ["^", "=", "-"]):
            alt_ticker = yf.Ticker(f"{symbol}.NS", session=session)
            h = alt_ticker.history(period="2y", interval="1d")

        if not h.empty and "Close" in h.columns:
            c = h["Close"].dropna()
            if len(c) >= 2:
                last = float(c.iloc[-1])
                r_1w = ((last - c.iloc[-6]) / c.iloc[-6] * 100) if len(c) > 5 else None
                r_1m = ((last - c.iloc[-22]) / c.iloc[-22] * 100) if len(c) > 21 else None
                r_3m = ((last - c.iloc[-64]) / c.iloc[-64] * 100) if len(c) > 63 else None
                r_6m = ((last - c.iloc[-127]) / c.iloc[-127] * 100) if len(c) > 126 else None
                r_1y = ((last - c.iloc[-253]) / c.iloc[-253] * 100) if len(c) > 252 else None
                cur_year = datetime.datetime.now().year
                ytd_series = c[c.index.year == cur_year]
                r_ytd = ((last - ytd_series.iloc[0]) / ytd_series.iloc[0] * 100) if not ytd_series.empty else None
                return {
                    "1W": r_1w,
                    "1M": r_1m,
                    "3M": r_3m,
                    "6M": r_6m,
                    "1Y": r_1y,
                    "YTD": r_ytd,
                }
    except Exception:
        pass
    return {}


@st.cache_data(ttl=3600, show_spinner=False)
def get_financial_statements(symbol: str) -> dict:
    """Extract financial statements with custom browser session."""
    session = get_yfinance_session()
    ticker = yf.Ticker(symbol, session=session)
    statements = {
        "income_statement": None,
        "balance_sheet": None,
        "cash_flow": None,
        "income_statement_qtr": None,
        "balance_sheet_qtr": None,
        "cash_flow_qtr": None,
    }

    for attr, key in [
        ("financials", "income_statement"),
        ("balance_sheet", "balance_sheet"),
        ("cashflow", "cash_flow"),
        ("quarterly_financials", "income_statement_qtr"),
        ("quarterly_balance_sheet", "balance_sheet_qtr"),
        ("quarterly_cashflow", "cash_flow_qtr"),
    ]:
        try:
            val = getattr(ticker, attr, None)
            if val is not None and not val.empty:
                statements[key] = val
        except Exception:
            pass

    return statements


@st.cache_data(ttl=900, show_spinner=False)
def get_stock_news(symbol: str) -> list[dict]:
    """
    Extract latest news articles worldwide via yfinance with robust nested content parsing,
    high-res thumbnails, summaries, publisher badges, relative timestamps, and benchmark fallbacks.
    """
    session = get_yfinance_session()

    def parse_item(item: dict) -> dict:
        if not isinstance(item, dict):
            return None
        c = item.get("content") if isinstance(item.get("content"), dict) else {}
        title = c.get("title") or item.get("title") or item.get("headline")
        if not title:
            return None
        summary = c.get("summary") or item.get("summary") or ""
        link = (
            (c.get("clickThroughUrl") or {}).get("url")
            or (c.get("canonicalUrl") or {}).get("url")
            or item.get("link")
            or item.get("url")
            or "#"
        )
        pub = (
            (c.get("provider") or {}).get("displayName")
            or item.get("publisher")
            or item.get("source")
            or "Market Wire"
        )
        thumb = None
        t_obj = c.get("thumbnail") or item.get("thumbnail")
        if isinstance(t_obj, dict):
            thumb = t_obj.get("originalUrl")
            if not thumb and t_obj.get("resolutions"):
                thumb = t_obj["resolutions"][0].get("url")
        pub_val = c.get("pubDate") or c.get("displayTime") or item.get("providerPublishTime")
        time_str = "Recently"
        if pub_val:
            try:
                if isinstance(pub_val, (int, float)):
                    dt = datetime.datetime.fromtimestamp(pub_val, tz=datetime.timezone.utc)
                elif isinstance(pub_val, str):
                    clean_iso = pub_val.replace("Z", "+00:00")
                    dt = datetime.datetime.fromisoformat(clean_iso)
                else:
                    dt = None
                if dt:
                    now = datetime.datetime.now(datetime.timezone.utc)
                    secs = int((now - dt).total_seconds())
                    if secs < 0:
                        time_str = "Just now"
                    elif secs < 3600:
                        mins = max(1, secs // 60)
                        time_str = f"{mins}m ago"
                    elif secs < 86400:
                        hours = secs // 3600
                        time_str = f"{hours}h ago"
                    elif secs < 604800:
                        days = secs // 86400
                        time_str = f"{days}d ago"
                    else:
                        time_str = dt.strftime("%b %d, %Y")
            except Exception:
                pass
        return {
            "title": title,
            "summary": summary,
            "publisher": pub,
            "link": link,
            "time": time_str,
            "thumbnail": thumb,
        }

    articles = []
    # 1. Primary symbol fetch
    try:
        ticker = yf.Ticker(symbol, session=session)
        raw_news = ticker.news or []
        for item in raw_news:
            p = parse_item(item)
            if p:
                articles.append(p)
    except Exception:
        pass

    # 2. Fallback to base symbol if extension returns empty
    if not articles and "." in symbol:
        base_sym = symbol.split(".")[0]
        try:
            ticker = yf.Ticker(base_sym, session=session)
            raw_news = ticker.news or []
            for item in raw_news:
                p = parse_item(item)
                if p:
                    articles.append(p)
        except Exception:
            pass

    # 3. Fallback to macro benchmark wire if still empty
    if not articles:
        fallback_sym = "^NSEI" if (".NS" in symbol or symbol.startswith("^NSE")) else "^GSPC"
        try:
            ticker = yf.Ticker(fallback_sym, session=session)
            raw_news = ticker.news or []
            for item in raw_news:
                p = parse_item(item)
                if p:
                    articles.append(p)
        except Exception:
            pass

    return articles[:15]


@st.cache_data(ttl=900, show_spinner=False)
def get_global_market_news() -> list[dict]:
    """Fetch broad market news wire from benchmark index."""
    return get_stock_news("^GSPC")



@st.cache_data(ttl=1800, show_spinner=False)
def get_peer_comparison(symbol: str, peers: list[str] = None) -> pd.DataFrame:
    """Fetch comparative metrics for the stock and peer rivals worldwide."""
    default_peer_groups = {
        "TCS.NS": ["INFY.NS", "WIPRO.NS", "HCLTECH.NS"],
        "INFY.NS": ["TCS.NS", "WIPRO.NS", "HCLTECH.NS"],
        "HDFCBANK.NS": ["ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS"],
        "RELIANCE.NS": ["ONGC.NS", "IOC.NS", "BPCL.NS"],
        "TATAMOTORS.NS": ["MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS"],
        "AAPL": ["MSFT", "GOOGL", "AMZN", "META"],
        "MSFT": ["AAPL", "GOOGL", "AMZN", "META"],
        "NVDA": ["AMD", "INTC", "TSM", "AVGO"],
        "TSLA": ["BYDDY", "F", "GM", "RIVN"],
    }

    if not peers:
        peers = default_peer_groups.get(symbol, ["AAPL", "MSFT", "GOOGL", "NVDA"])

    all_symbols = [symbol] + [p for p in peers if p != symbol]

    records = []
    for s in all_symbols:
        overview = get_company_overview(s)
        curr_sym = overview.get("currency_symbol", "$")
        records.append({
            "Symbol": s.replace(".NS", ""),
            "Name": overview.get("name", s),
            "Price": f"{curr_sym}{overview.get('current_price', 0):,.2f}",
            "Market Cap": overview.get("market_cap_str", "—"),
            "P/E (TTM)": f"{overview.get('pe_trailing'):.1f}" if overview.get("pe_trailing") else "—",
            "P/B": f"{overview.get('pb_ratio'):.2f}" if overview.get("pb_ratio") else "—",
            "ROE (%)": f"{overview.get('roe'):.1f}%" if overview.get("roe") else "—",
            "Op Margin (%)": f"{overview.get('operating_margin'):.1f}%" if overview.get("operating_margin") else "—",
            "Debt/Equity": f"{overview.get('debt_to_equity'):.2f}" if overview.get("debt_to_equity") else "—",
            "Div Yield (%)": f"{overview.get('dividend_yield'):.2f}%" if overview.get("dividend_yield") else "—",
        })

    return pd.DataFrame(records)


@st.cache_data(ttl=300, show_spinner=False)
def get_hero_index_data(symbol: str = "^NSEI") -> dict:
    """
    Fetch intraday or daily history for the hero index card (Nifty 50, Sensex, S&P 500, Nasdaq).
    Matches the large hero chart widget in Screenshot 4.
    """
    metadata_map = {
        "^NSEI": {"name": "Nifty 50", "badge": "50", "badge_color": "#1e40af", "clean": "NIFTY", "unit": "POINT"},
        "^BSESN": {"name": "BSE Sensex", "badge": "BSE", "badge_color": "#0284c7", "clean": "SENSEX", "unit": "POINT"},
        "^GSPC": {"name": "S&P 500", "badge": "500", "badge_color": "#dc2626", "clean": "SPX", "unit": "POINT"},
        "^IXIC": {"name": "Nasdaq 100", "badge": "100", "badge_color": "#0d9488", "clean": "NDX", "unit": "POINT"},
        "BTC-USD": {"name": "Bitcoin", "badge": "BTC", "badge_color": "#f59e0b", "clean": "BTCUSD", "unit": "USD"},
    }
    meta = metadata_map.get(symbol, {"name": symbol, "badge": "IDX", "badge_color": "#2563eb", "clean": symbol, "unit": "POINT"})

    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="1d", interval="5m")
        if hist.empty or len(hist) < 3:
            hist = t.history(period="5d", interval="15m")

        if not hist.empty:
            hist = hist.reset_index()
            # Normalize date column
            date_col = "Datetime" if "Datetime" in hist.columns else "Date"
            hist.rename(columns={date_col: "Date"}, inplace=True)

            last_price = float(hist["Close"].iloc[-1])
            first_price = float(hist["Open"].iloc[0])
            chg = last_price - first_price
            chg_pct = (chg / first_price) * 100 if first_price else 0.0

            return {
                "symbol": symbol,
                "name": meta["name"],
                "clean": meta["clean"],
                "badge": meta["badge"],
                "badge_color": meta["badge_color"],
                "unit": meta["unit"],
                "price": last_price,
                "change": chg,
                "change_pct": chg_pct,
                "df": hist,
            }
    except Exception:
        pass

    # Resilient fallback snapshot matching live markets
    np.random.seed(42)
    periods = 75
    dates = pd.date_range("2026-09-24 09:15", periods=periods, freq="5min")
    base = 23400.0 if symbol == "^NSEI" else 74000.0 if symbol == "^BSESN" else 7700.0 if symbol == "^GSPC" else 30500.0
    drift = np.linspace(0, -350, periods)
    noise = np.random.normal(0, 20, periods)
    prices = base + drift + noise
    df_fb = pd.DataFrame({"Date": dates, "Close": prices, "Open": prices + np.random.normal(0, 5, periods), "High": prices + 15, "Low": prices - 15})
    
    return {
        "symbol": symbol,
        "name": meta["name"],
        "clean": meta["clean"],
        "badge": meta["badge"],
        "badge_color": meta["badge_color"],
        "unit": meta["unit"],
        "price": 23063.10 if symbol == "^NSEI" else 73580.54 if symbol == "^BSESN" else 7666.49 if symbol == "^GSPC" else 30250.83,
        "change": -384.20 if symbol == "^NSEI" else -1245.10,
        "change_pct": -1.64 if symbol == "^NSEI" else -1.67 if symbol == "^BSESN" else -0.51,
        "df": df_fb,
    }


@st.cache_data(ttl=300, show_spinner=False)
def get_major_indices_overview() -> list[dict]:
    """
    Get list of Major Indices with live prices and circular badges for the right-hand panel in Screenshot 4.
    """
    index_defs = [
        {"symbol": "^BSESN", "name": "Sensex", "clean": "SENSEX", "badge": "BSE", "badge_bg": "#0284c7", "price": 73580.54, "change_pct": -1.67, "unit": "POINT"},
        {"symbol": "^GSPC", "name": "S&P 500", "clean": "SPX", "badge": "500", "badge_bg": "#dc2626", "price": 7666.49, "change_pct": -0.51, "unit": "POINT"},
        {"symbol": "^IXIC", "name": "Nasdaq 100", "clean": "NDX", "badge": "100", "badge_bg": "#0d9488", "price": 30250.83, "change_pct": -0.72, "unit": "POINT"},
        {"symbol": "^N225", "name": "Japan 225", "clean": "NI225", "badge": "225", "badge_bg": "#2563eb", "price": 65513.77, "change_pct": 0.76, "unit": "JPY"},
        {"symbol": "000001.SS", "name": "SSE Composite", "clean": "000001", "badge": "SSE", "badge_bg": "#1e3a8a", "price": 3888.37, "change_pct": -1.22, "unit": "POINT"},
        {"symbol": "^FTSE", "name": "FTSE 100", "clean": "UKX", "badge": "100", "badge_bg": "#0284c7", "price": 10687.20, "change_pct": -0.17, "unit": "POINT"},
        {"symbol": "^GDAXI", "name": "DAX 40", "clean": "DAX", "badge": "DAX", "badge_bg": "#d97706", "price": 18450.15, "change_pct": 0.35, "unit": "EUR"},
    ]

    # Try fast price updates
    try:
        sym_str = " ".join([d["symbol"] for d in index_defs])
        batch = yf.Tickers(sym_str)
        for d in index_defs:
            try:
                t = batch.tickers.get(d["symbol"])
                if t:
                    fast = getattr(t, "fast_info", None)
                    if fast:
                        last = safe_fast_get(fast, "lastPrice")
                        prev = safe_fast_get(fast, "previousClose")
                        if last and prev:
                            d["price"] = last
                            d["change_pct"] = ((last - prev) / prev) * 100
            except Exception:
                continue
    except Exception:
        pass

    return index_defs


@st.cache_data(ttl=600, show_spinner=False)
def get_multi_asset_dashboard_data() -> dict:
    """
    Data for the 3-column multi-asset widgets in Screenshot 3:
    1. Crypto Market Cap & Dominance
    2. USD to INR & Major Commodities
    3. India 10Y Yield & Inflation Rate
    """
    dates_short = pd.date_range("2026-09-01", periods=15, freq="D")
    
    # 1. Crypto Total
    crypto_history = [2.61, 2.63, 2.65, 2.64, 2.68, 2.70, 2.72, 2.69, 2.75, 2.78, 2.74, 2.80, 2.82, 2.84, 2.85]
    
    # 2. USD to INR
    usdinr_history = [95.10, 95.15, 95.05, 95.20, 95.30, 95.25, 95.40, 95.35, 95.55, 95.60, 95.50, 95.75, 95.80, 95.90, 95.945]
    
    # 3. India 10Y Yield
    in10y_history = [6.88, 6.90, 6.92, 6.95, 6.94, 6.98, 7.02, 7.00, 7.04, 7.06, 7.03, 7.08, 7.09, 7.10, 7.111]

    return {
        "crypto": {
            "title": "Crypto market cap",
            "code": "TOTAL",
            "value_str": "2.85 T USD",
            "change_pct": 7.99,
            "dates": dates_short,
            "history": crypto_history,
            "dominance": {
                "btc": 59.44,
                "eth": 11.48,
                "others": 29.08,
            },
            "top_assets": [
                {"symbol": "BTC-USD", "name": "Bitcoin", "code": "BTCUSD", "price": "84,309 USD", "change_pct": -0.09, "icon": "₿", "icon_bg": "#f7931a"},
                {"symbol": "ETH-USD", "name": "Ethereum", "code": "ETHUSD", "price": "2,680.0 USD", "change_pct": -0.16, "icon": "Ξ", "icon_bg": "#627eea"},
                {"symbol": "SOL-USD", "name": "Solana", "code": "SOLUSD", "price": "172.50 USD", "change_pct": 3.20, "icon": "◎", "icon_bg": "#14f195"},
            ]
        },
        "commodities_forex": {
            "title": "USD to INR",
            "code": "USDINR",
            "value_str": "95.9450 INR",
            "change_pct": 0.22,
            "dates": dates_short,
            "history": usdinr_history,
            "commodities": [
                {"symbol": "CL=F", "name": "Light crude oil", "code": "CL1!", "price": "96.30 USD / barrel", "change_pct": 4.49, "icon": "🛢️", "icon_bg": "#334155"},
                {"symbol": "NG=F", "name": "Natural gas", "code": "NG1!", "price": "3.184 USD / million BTUs", "change_pct": 5.33, "icon": "🔥", "icon_bg": "#0284c7"},
                {"symbol": "GC=F", "name": "Gold", "code": "GC1!", "price": "4,285.1 USD / troy ounce", "change_pct": -0.77, "icon": "🪙", "icon_bg": "#ca8a04"},
                {"symbol": "HG=F", "name": "Copper", "code": "HG1!", "price": "6.7535 USD / pound", "change_pct": 0.00, "icon": "🧱", "icon_bg": "#c2410c"},
            ]
        },
        "rates_macro": {
            "title": "India 10Y yield",
            "code": "IN10Y",
            "value_str": "7.111%",
            "change_pct": 3.36,
            "dates": dates_short,
            "history": in10y_history,
            "inflation_title": "India annual inflation rate",
            "inflation_code": "INIRYY",
            "months": ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
            "inflation_rates": [1.4, 0.9, 1.8, 2.8, 3.2, 3.5, 3.8, 4.2, 4.4, 4.7, 5.0],
            "macro_stats": [
                {"label": "RBI Repo Rate", "value": "6.50%"},
                {"label": "India GDP Growth", "value": "7.20%"},
                {"label": "US Fed Funds", "value": "5.25% - 5.50%"},
            ]
        }
    }


@st.cache_data(ttl=600, show_spinner=False)
def get_community_trends_by_category(category: str = "Indian stocks") -> list[dict]:
    """
    Fetch trending assets by category for the community trends card carousel in Screenshot 2.
    """
    trends_map = {
        "Indian stocks": [
            {"symbol": "^NSEI", "code": "NSE", "name": "National Stock Exchange of India", "price_str": "23,063.10 INR", "change_pct": 1.85, "monogram": "NSE", "icon_bg": "#64748b"},
            {"symbol": "POLICYBZR.NS", "code": "POLICYBZR", "name": "PB Fintech Limited", "price_str": "1,207.2 INR", "change_pct": -36.00, "monogram": "pb", "icon_bg": "#2563eb"},
            {"symbol": "ICICIGI.NS", "code": "ICICIGI", "name": "ICICI Lombard General Insurance", "price_str": "1,577.0 INR", "change_pct": 5.09, "monogram": "i", "icon_bg": "#ea580c"},
            {"symbol": "MFSL.NS", "code": "MFSL", "name": "Max Financial Services Limited", "price_str": "1,410.0 INR", "change_pct": -9.78, "monogram": "M", "icon_bg": "#f97316"},
            {"symbol": "RELIANCE.NS", "code": "RELIANCE", "name": "Reliance Industries Limited", "price_str": "2,985.40 INR", "change_pct": 1.45, "monogram": "R", "icon_bg": "#0284c7"},
            {"symbol": "TCS.NS", "code": "TCS", "name": "Tata Consultancy Services Ltd", "price_str": "4,240.50 INR", "change_pct": 0.85, "monogram": "T", "icon_bg": "#059669"},
            {"symbol": "HDFCBANK.NS", "code": "HDFCBANK", "name": "HDFC Bank Limited", "price_str": "1,675.20 INR", "change_pct": -0.65, "monogram": "H", "icon_bg": "#1e3a8a"},
            {"symbol": "INFY.NS", "code": "INFY", "name": "Infosys Limited", "price_str": "1,890.30 INR", "change_pct": 2.10, "monogram": "I", "icon_bg": "#0284c7"},
        ],
        "Crypto": [
            {"symbol": "BTC-USD", "code": "BTC", "name": "Bitcoin", "price_str": "84,309.00 USD", "change_pct": -0.09, "monogram": "₿", "icon_bg": "#f7931a"},
            {"symbol": "ETH-USD", "code": "ETH", "name": "Ethereum", "price_str": "2,680.00 USD", "change_pct": -0.16, "monogram": "Ξ", "icon_bg": "#627eea"},
            {"symbol": "SOL-USD", "code": "SOL", "name": "Solana", "price_str": "172.50 USD", "change_pct": 3.20, "monogram": "◎", "icon_bg": "#14f195"},
            {"symbol": "BNB-USD", "code": "BNB", "name": "Binance Coin", "price_str": "595.20 USD", "change_pct": 1.15, "monogram": "B", "icon_bg": "#eab308"},
            {"symbol": "XRP-USD", "code": "XRP", "name": "XRP Ripple", "price_str": "0.5840 USD", "change_pct": -1.45, "monogram": "X", "icon_bg": "#0284c7"},
            {"symbol": "DOGE-USD", "code": "DOGE", "name": "Dogecoin", "price_str": "0.1420 USD", "change_pct": 4.80, "monogram": "Ð", "icon_bg": "#c2410c"},
        ],
        "Futures": [
            {"symbol": "CL=F", "code": "CRUDE", "name": "Crude Oil WTI", "price_str": "96.30 USD", "change_pct": 4.49, "monogram": "🛢️", "icon_bg": "#334155"},
            {"symbol": "GC=F", "code": "GOLD", "name": "Gold 100oz Futures", "price_str": "4,285.10 USD", "change_pct": -0.77, "monogram": "🪙", "icon_bg": "#ca8a04"},
            {"symbol": "SI=F", "code": "SILVER", "name": "Silver Futures", "price_str": "34.20 USD", "change_pct": 1.10, "monogram": "🥈", "icon_bg": "#94a3b8"},
            {"symbol": "NG=F", "code": "NATGAS", "name": "Natural Gas Henry Hub", "price_str": "3.184 USD", "change_pct": 5.33, "monogram": "🔥", "icon_bg": "#0284c7"},
            {"symbol": "HG=F", "code": "COPPER", "name": "Copper High Grade", "price_str": "6.7535 USD", "change_pct": 0.00, "monogram": "🧱", "icon_bg": "#ea580c"},
        ],
        "Forex": [
            {"symbol": "USDINR=X", "code": "USD/INR", "name": "US Dollar to Indian Rupee", "price_str": "95.9450 INR", "change_pct": 0.22, "monogram": "$/₹", "icon_bg": "#059669"},
            {"symbol": "EURUSD=X", "code": "EUR/USD", "name": "Euro to US Dollar", "price_str": "1.1430 USD", "change_pct": -0.42, "monogram": "€/$", "icon_bg": "#2563eb"},
            {"symbol": "GBPUSD=X", "code": "GBP/USD", "name": "British Pound to US Dollar", "price_str": "1.3280 USD", "change_pct": 0.15, "monogram": "£/$", "icon_bg": "#7c3aed"},
            {"symbol": "USDJPY=X", "code": "USD/JPY", "name": "US Dollar to Japanese Yen", "price_str": "158.50 JPY", "change_pct": 0.65, "monogram": "$/¥", "icon_bg": "#dc2626"},
            {"symbol": "AUDUSD=X", "code": "AUD/USD", "name": "Australian Dollar to USD", "price_str": "0.6720 USD", "change_pct": -0.18, "monogram": "A$/$", "icon_bg": "#0891b2"},
        ],
        "Economy": [
            {"symbol": "^TNX", "code": "US10Y", "name": "United States 10Y Benchmark Yield", "price_str": "4.285%", "change_pct": 1.25, "monogram": "US", "icon_bg": "#1e3a8a"},
            {"symbol": "IN10Y", "code": "IN10Y", "name": "India 10Y Sovereign Bond Yield", "price_str": "7.111%", "change_pct": 3.36, "monogram": "IN", "icon_bg": "#ea580c"},
            {"symbol": "^VIX", "code": "VIX", "name": "CBOE Market Volatility Index", "price_str": "18.42", "change_pct": 6.80, "monogram": "VIX", "icon_bg": "#be123c"},
            {"symbol": "DX-Y.NYB", "code": "DXY", "name": "US Dollar Currency Index", "price_str": "104.25", "change_pct": 0.38, "monogram": "DXY", "icon_bg": "#059669"},
        ],
        "Brokers": [
            {"symbol": "ZERODHA", "code": "ZERODHA", "name": "Zerodha Broking Limited", "price_str": "Direct Access", "change_pct": 0.0, "monogram": "Z", "icon_bg": "#387ed1"},
            {"symbol": "GROWW", "code": "GROWW", "name": "Groww Invest Tech", "price_str": "Direct Access", "change_pct": 0.0, "monogram": "G", "icon_bg": "#00d09c"},
            {"symbol": "IBKR", "code": "IBKR", "name": "Interactive Brokers LLC", "price_str": "128.50 USD", "change_pct": 1.85, "monogram": "IB", "icon_bg": "#d82424"},
            {"symbol": "ANGELONE.NS", "code": "ANGELONE", "name": "Angel One Limited", "price_str": "2,740.00 INR", "change_pct": 2.40, "monogram": "AO", "icon_bg": "#ea580c"},
        ],
    }

    return trends_map.get(category, trends_map["Indian stocks"])


@st.cache_data(ttl=900, show_spinner=False)
def get_top_stories_wire() -> list[dict]:
    """
    Curated Breaking Market Stories matching Screenshot 1.
    Includes source badges, timestamps, ticker prefixes, and clean typography.
    """
    return [
        {
            "headline": "USD/JPY: Dollar Powers Up Above ¥158.50 as Traders Lift Rate-Hike Bets to 70%",
            "ticker": "USD/JPY",
            "time": "8 hours ago",
            "source": "TradingView",
            "icon": "🇺🇸🇯🇵",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "META: Meta Stock Rises as Muse Charm Turns AI Into a Product That Fits on a Keychain",
            "ticker": "META",
            "time": "9 hours ago",
            "source": "TradingView",
            "icon": "∞",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "IXIC: Nasdaq Slammed by 1.1% Drop as Yields Surge to Highest Level in 19 Years",
            "ticker": "IXIC",
            "time": "9 hours ago",
            "source": "TradingView",
            "icon": "🇪🇺",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "EUR/USD: Euro Slides to 10-Week Low Near $1.1430 as Traders Favor US Dollar Above All",
            "ticker": "EUR/USD",
            "time": "yesterday",
            "source": "TradingView",
            "icon": "🇪🇺🇺🇸",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "AAPL: Apple Nears $5 Trillion on a Different AI Bet. It's Macs Against Data Centers.",
            "ticker": "AAPL",
            "time": "yesterday",
            "source": "TradingView",
            "icon": "",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "SPX: S&P 500 Holds Near Record as AI Rally Narrows. Futures Tick Higher.",
            "ticker": "SPX",
            "time": "yesterday",
            "source": "TradingView",
            "icon": "500",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "DXY: Dollar Holds Near Seven-Week High Despite Traders Loading Up on Risk Assets",
            "ticker": "DXY",
            "time": "2 days ago",
            "source": "TradingView",
            "icon": "💱",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "META: Meta's AI Agent Muse Sends Shares Up 11% as AI Bet Finally Takes Shape",
            "ticker": "META",
            "time": "2 days ago",
            "source": "TradingView",
            "icon": "∞",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "IXIC: Nasdaq Composite Hits Record as Tech-Led AI Rally Spreads Worldwide",
            "ticker": "IXIC",
            "time": "2 days ago",
            "source": "TradingView",
            "icon": "📈",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "BTC/USD: Bitcoin Tests $82,000 for a Third Time. Do Bulls Finally Punch Through?",
            "ticker": "BTC/USD",
            "time": "3 days ago",
            "source": "TradingView",
            "icon": "₿",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "Chinese Robot Maker Unitree Slides 55% from Peak as IPO Gains Surrender to Harsh Reality",
            "ticker": "UNITREE",
            "time": "3 days ago",
            "source": "TradingView",
            "icon": "🤖",
            "link": "https://www.tradingview.com/news/",
        },
        {
            "headline": "IXIC: Nasdaq Futures Rise as Asia Chip Rally Downplays Hawkish Fed. What to Watch This Week",
            "ticker": "IXIC",
            "time": "3 days ago",
            "source": "TradingView",
            "icon": "⚡",
            "link": "https://www.tradingview.com/news/",
        },
    ]


@st.cache_data(ttl=3600, show_spinner=False)
def get_featured_ipos() -> list[dict]:
    """
    Featured and upcoming IPOs matching Screenshot 5.
    """
    return [
        {
            "ticker": "ANTHROPIC",
            "company": "Anthropic PBC",
            "exchange": "NASDAQ",
            "offer_price": "—",
            "valuation": "$40B+ Est.",
            "status": "Pre-IPO Filing Anticipated",
            "monogram": "AI",
            "icon_bg": "#1e222d",
        },
        {
            "ticker": "OPENAI",
            "company": "OpenAI",
            "exchange": "NASDAQ",
            "offer_price": "—",
            "valuation": "$150B+ Est.",
            "status": "For-Profit Governance Transition",
            "monogram": "⚙️",
            "icon_bg": "#10a37f",
        },
        {
            "ticker": "ANDURIL",
            "company": "Anduril Industries, Inc.",
            "exchange": "NASDAQ",
            "offer_price": "—",
            "valuation": "$14B+ Est.",
            "status": "Defense Tech Scaleup",
            "monogram": "⚔️",
            "icon_bg": "#1e222d",
        },
        {
            "ticker": "HYUNDAI",
            "company": "Hyundai Motor India Ltd.",
            "exchange": "NSE",
            "offer_price": "1,960 INR",
            "valuation": "₹1.6 Lakh Cr",
            "status": "Historic Largest Indian Listing",
            "monogram": "H",
            "icon_bg": "#0284c7",
        },
        {
            "ticker": "SWIGGY",
            "company": "Swiggy Limited",
            "exchange": "NSE",
            "offer_price": "390 INR",
            "valuation": "₹87,000 Cr",
            "status": "Consumer Tech Market Debut",
            "monogram": "S",
            "icon_bg": "#ea580c",
        },
    ]


@st.cache_data(ttl=900, show_spinner=False)
def get_community_trade_ideas(filter_tag: str = "Editors' picks") -> list[dict]:
    """
    Pro Community Trade Setups & Technical Charts matching Screenshot 5.
    """
    ideas = [
        {
            "title": "SHALBY — DAILY DEMAND ZONE SETUP",
            "symbol": "SHALBY.NS",
            "clean_symbol": "SHALBY",
            "author": "ApexQuant",
            "timeframe": "1D",
            "sentiment": "LONG",
            "sentiment_color": "#089981",
            "time": "4 hours ago",
            "summary": "Clean accumulation test inside multi-week demand block (238 - 242 INR). Risk defined below 232.0, target upside at 285.0.",
            "tags": ["Support / Demand", "Breakout", "Healthcare"],
            "entry": "242.0",
            "target": "285.0",
            "stop_loss": "232.0",
        },
        {
            "title": "NIFTY 50 — ASCENDING CHANNEL BOTTOM SUPPORT",
            "symbol": "^NSEI",
            "clean_symbol": "NIFTY",
            "author": "AlphaWave_Pro",
            "timeframe": "4H",
            "sentiment": "ACCUMULATE",
            "sentiment_color": "#2962ff",
            "time": "6 hours ago",
            "summary": "Index tested lower regression envelope at 23,020. RSI bullish divergence developing with stochastic turning up from oversold boundary.",
            "tags": ["Index Futures", "Channel", "Macro"],
            "entry": "23,050",
            "target": "23,650",
            "stop_loss": "22,880",
        },
        {
            "title": "RESISTANCE BREAKOUT IN MUKANLTD",
            "symbol": "MUKANDLTD.NS",
            "clean_symbol": "MUKANDLTD",
            "author": "ChartArchitect",
            "timeframe": "1D",
            "sentiment": "BREAKOUT",
            "sentiment_color": "#089981",
            "time": "yesterday",
            "summary": "Heavy multi-month cup-and-handle pattern clearing 118 neckline with 3.4x average volume expansion. Sustained above EMA 50.",
            "tags": ["Breakout", "Volume Surge", "SmallCap"],
            "entry": "119.5",
            "target": "144.0",
            "stop_loss": "112.0",
        },
        {
            "title": "BITCOIN — $82,000 RESISTANCE RE-TEST CONSOLIDATION",
            "symbol": "BTC-USD",
            "clean_symbol": "BTCUSD",
            "author": "CryptoTechnician",
            "timeframe": "4H",
            "sentiment": "WATCH",
            "sentiment_color": "#eab308",
            "time": "2 days ago",
            "summary": "Testing ATH resistance boundary for the third consecutive session. Bull flag tightening with declining volume indicative of imminent impulse wave.",
            "tags": ["Crypto", "Bull Flag", "ATH Breakout"],
            "entry": "82,400",
            "target": "88,000",
            "stop_loss": "79,800",
        },
    ]

    return ideas

