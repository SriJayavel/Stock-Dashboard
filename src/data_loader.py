"""
Resilient data loading pipeline for Global & Indian markets.
Configured with custom browser headers, smart asset-type detection,
and indicator historical padding for gap-free charting.
"""

import streamlit as st
import yfinance as yf
import pandas as pd
import numpy as np
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


@st.cache_data(ttl=1800, show_spinner=False)
def search_global_assets(query: str) -> list[dict]:
    """
    Search the entire world market using Yahoo Finance global search and local catalog.
    """
    if not query or len(query.strip()) < 1:
        return []

    results = []
    cleaned_query = query.strip()

    # 1. Check local catalog first
    catalog = load_companies_catalog()
    if not catalog.empty and "NAME OF COMPANY" in catalog.columns:
        local_matches = catalog[
            catalog["SYMBOL"].str.contains(cleaned_query, case=False, na=False)
            | catalog["NAME OF COMPANY"].str.contains(cleaned_query, case=False, na=False)
        ].head(5)
        for _, row in local_matches.iterrows():
            results.append({
                "symbol": f"{row['SYMBOL']}.NS",
                "name": row["NAME OF COMPANY"],
                "type": "Stock (NSE)",
                "exchange": "NSE",
            })

    # 2. Query Yahoo Global Asset Directory
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

    cleaned = str(query).strip().upper()

    alias_map = {
        "NIFTY": "^NSEI",
        "NIFTY 50": "^NSEI",
        "SENSEX": "^BSESN",
        "S&P 500": "^GSPC",
        "SP500": "^GSPC",
        "NASDAQ": "^IXIC",
        "BITCOIN": "BTC-USD",
        "BTC": "BTC-USD",
        "ETHEREUM": "ETH-USD",
        "ETH": "ETH-USD",
        "GOLD": "GC=F",
        "CRUDE OIL": "CL=F",
        "OIL": "CL=F",
    }
    if cleaned in alias_map:
        return alias_map[cleaned]

    if any(ch in cleaned for ch in [".", "^", "=", "-"]):
        return cleaned

    catalog = load_companies_catalog()
    if not catalog.empty and "SYMBOL" in catalog.columns:
        if cleaned in catalog["SYMBOL"].values:
            return f"{cleaned}.NS"

    return cleaned


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

    fast = getattr(ticker, "fast_info", {})

    # Extract price info safely
    regular_price = (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or (fast.get("lastPrice") if hasattr(fast, "get") else None)
        or info.get("previousClose")
        or 0.0
    )
    prev_close = (
        info.get("regularMarketPreviousClose")
        or info.get("previousClose")
        or (fast.get("previousClose") if hasattr(fast, "get") else None)
        or regular_price
    )
    price_change = regular_price - prev_close if regular_price and prev_close else 0.0
    price_change_pct = (price_change / prev_close * 100) if prev_close else 0.0

    currency = info.get("currency") or (fast.get("currency") if hasattr(fast, "get") else None) or "USD"
    currency_symbol = (
        "₹" if currency == "INR"
        else ("$" if currency == "USD"
        else ("€" if currency == "EUR"
        else ("£" if currency == "GBP"
        else ("¥" if currency == "JPY"
        else currency + " "))))
    )

    # Format market cap
    raw_mcap = info.get("marketCap") or (fast.get("marketCap") if hasattr(fast, "get") else None)
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
        "high_52w": info.get("fiftyTwoWeekHigh") or (fast.get("yearHigh") if hasattr(fast, "get") else None),
        "low_52w": info.get("fiftyTwoWeekLow") or (fast.get("yearLow") if hasattr(fast, "get") else None),

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
    """Extract latest news articles worldwide via yfinance."""
    session = get_yfinance_session()
    ticker = yf.Ticker(symbol, session=session)
    articles = []
    try:
        raw_news = ticker.news or []
        for item in raw_news:
            title = item.get("title") or item.get("headline")
            if not title:
                continue

            link = item.get("link") or item.get("url") or "#"
            publisher = item.get("publisher") or item.get("source") or "Market News"
            pub_time = item.get("providerPublishTime")

            time_str = "Recently"
            if pub_time:
                try:
                    dt = datetime.datetime.fromtimestamp(pub_time)
                    time_str = dt.strftime("%b %d, %Y - %H:%M")
                except Exception:
                    pass

            articles.append({
                "title": title,
                "publisher": publisher,
                "link": link,
                "time": time_str
            })
    except Exception:
        pass

    return articles[:10]


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
