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
