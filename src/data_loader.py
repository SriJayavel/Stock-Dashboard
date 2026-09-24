"""
Resilient data loading pipeline for the Entire World Market (TradingView-scale).
Supports:
- Indian Equities (NSE & BSE)
- US & International Equities (NYSE, NASDAQ, LSE, Tokyo, Frankfurt, etc.)
- Global Market Indices (S&P 500, Nifty 50, Nasdaq, Dow Jones, DAX, Nikkei)
- Cryptocurrencies (Bitcoin, Ethereum, Solana, etc.)
- Commodities (Gold, Silver, Crude Oil) & Currencies / Forex (USD/INR, EUR/USD)
"""

import streamlit as st
import yfinance as yf
import pandas as pd
import numpy as np
import datetime
import os


@st.cache_data(ttl=86400)
def load_companies_catalog() -> pd.DataFrame:
    """Load the NSE companies catalog from CSV for fast local matching."""
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
    Search the entire world market using Yahoo Finance global search.
    Returns matched equities, ETFs, indices, crypto, and commodities.
    """
    if not query or len(query.strip()) < 2:
        return []

    results = []
    cleaned_query = query.strip()

    # 1. First check local NSE catalog for immediate Indian stock match
    catalog = load_companies_catalog()
    if not catalog.empty and "NAME OF COMPANY" in catalog.columns:
        local_matches = catalog[
            catalog["SYMBOL"].str.contains(cleaned_query, case=False, na=False)
            | catalog["NAME OF COMPANY"].str.contains(cleaned_query, case=False, na=False)
        ].head(4)
        for _, row in local_matches.iterrows():
            results.append({
                "symbol": f"{row['SYMBOL']}.NS",
                "name": row["NAME OF COMPANY"],
                "type": "Stock (NSE India)",
                "exchange": "NSE",
            })

    # 2. Search Yahoo Finance Global Asset Directory
    try:
        search_obj = yf.Search(cleaned_query, max_results=8)
        for q in getattr(search_obj, "quotes", []):
            sym = q.get("symbol")
            if not sym:
                continue

            # Prevent duplicate symbols
            if any(r["symbol"] == sym for r in results):
                continue

            raw_type = q.get("quoteType", "EQUITY")
            type_label = {
                "EQUITY": "Stock",
                "ETF": "ETF",
                "INDEX": "Index",
                "CRYPTOCURRENCY": "Crypto",
                "FUTURE": "Commodity / Futures",
                "CURRENCY": "Forex / Currency",
            }.get(raw_type, raw_type.title())

            name = q.get("shortname") or q.get("longname") or sym
            exch = q.get("exchDisp") or q.get("exchange") or "Global"

            results.append({
                "symbol": sym,
                "name": name,
                "type": f"{type_label} ({exch})",
                "exchange": exch,
            })
    except Exception:
        pass

    return results


def resolve_symbol(query: str) -> str:
    """
    Resolve user query to an exact ticker symbol across the world.
    """
    if not query:
        return "TCS.NS"

    cleaned = str(query).strip().upper()

    # Common exact indices or symbols
    if cleaned in {"NIFTY", "NIFTY 50", "^NSEI"}:
        return "^NSEI"
    if cleaned in {"SENSEX", "^BSESN"}:
        return "^BSESN"
    if cleaned in {"S&P 500", "SP500", "^GSPC"}:
        return "^GSPC"
    if cleaned in {"NASDAQ", "^IXIC"}:
        return "^IXIC"
    if cleaned in {"BITCOIN", "BTC"}:
        return "BTC-USD"
    if cleaned in {"ETHEREUM", "ETH"}:
        return "ETH-USD"
    if cleaned in {"GOLD"}:
        return "GC=F"
    if cleaned in {"CRUDE OIL", "OIL"}:
        return "CL=F"

    # If it already has exchange suffix or special chars (^, =, -)
    if any(ch in cleaned for ch in [".", "^", "=", "-"]):
        return cleaned

    # Check if symbol exists in local NSE catalog
    catalog = load_companies_catalog()
    if not catalog.empty and "SYMBOL" in catalog.columns:
        if cleaned in catalog["SYMBOL"].values:
            return f"{cleaned}.NS"

    # Default: raw global symbol (e.g. AAPL, NVDA, MSFT, TSLA)
    return cleaned


@st.cache_data(ttl=120, show_spinner=False)
def get_global_market_indices() -> list[dict]:
    """
    Get live snapshot of major world indices & benchmark assets for the top ticker tape.
    """
    indices = [
        {"symbol": "^NSEI", "name": "NIFTY 50", "region": "🇮🇳 India"},
        {"symbol": "^BSESN", "name": "SENSEX", "region": "🇮🇳 India"},
        {"symbol": "^GSPC", "name": "S&P 500", "region": "🇺🇸 US"},
        {"symbol": "^IXIC", "name": "NASDAQ", "region": "🇺🇸 US"},
        {"symbol": "^FTSE", "name": "FTSE 100", "region": "🇬🇧 UK"},
        {"symbol": "^N225", "name": "NIKKEI 225", "region": "🇯🇵 Japan"},
        {"symbol": "BTC-USD", "name": "BITCOIN", "region": "🪙 Crypto"},
        {"symbol": "GC=F", "name": "GOLD", "region": "🥇 Commodity"},
        {"symbol": "CL=F", "name": "CRUDE OIL", "region": "🛢️ Commodity"},
    ]

    results = []
    for item in indices:
        try:
            t = yf.Ticker(item["symbol"])
            fast = getattr(t, "fast_info", None)
            if fast:
                last = fast.get("lastPrice") or 0.0
                prev = fast.get("previousClose") or last
                chg = last - prev if last and prev else 0.0
                chg_pct = (chg / prev * 100) if prev else 0.0
                results.append({
                    "symbol": item["symbol"],
                    "name": item["name"],
                    "region": item["region"],
                    "price": last,
                    "change": chg,
                    "change_pct": chg_pct,
                })
        except Exception:
            continue

    return results


@st.cache_data(ttl=1800, show_spinner=False)
def get_company_overview(symbol: str) -> dict:
    """
    Fetch comprehensive company overview, valuation multiples, and financial health ratios
    for ANY stock, ETF, index, crypto, or commodity worldwide.
    """
    ticker = yf.Ticker(symbol)
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    # Extract price info safely
    fast = getattr(ticker, "fast_info", {})
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
    mcap_display = "N/A"
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

    overview = {
        "symbol": symbol,
        "name": info.get("longName") or info.get("shortName") or symbol,
        "quote_type": quote_type,
        "current_price": regular_price,
        "prev_close": prev_close,
        "change": price_change,
        "change_pct": price_change_pct,
        "currency": currency,
        "currency_symbol": currency_symbol,
        "market_cap": raw_mcap,
        "market_cap_str": mcap_display,
        "sector": info.get("sector", "Global Market / Index / Asset"),
        "industry": info.get("industry", quote_type.title()),
        "summary": info.get("longBusinessSummary") or info.get("description", "Global market security."),
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
    """Fetch historical Open, High, Low, Close, Volume for any global ticker."""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval, auto_adjust=True)
        if df.empty and not symbol.endswith(".NS") and not any(c in symbol for c in ["^", "=", "-"]):
            alt_ticker = yf.Ticker(f"{symbol}.NS")
            df = alt_ticker.history(period=period, interval=interval, auto_adjust=True)

        if not df.empty:
            df = df.reset_index()
            if "Date" in df.columns:
                df["Date"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
            elif "Datetime" in df.columns:
                df["Date"] = pd.to_datetime(df["Datetime"]).dt.tz_localize(None)
            return df
    except Exception as e:
        st.warning(f"Note: Could not retrieve history for {symbol}: {str(e)}")

    return pd.DataFrame()


@st.cache_data(ttl=3600, show_spinner=False)
def get_financial_statements(symbol: str) -> dict:
    """Extract Income Statement, Balance Sheet, and Cash Flow statements."""
    ticker = yf.Ticker(symbol)
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
    ticker = yf.Ticker(symbol)
    articles = []
    try:
        raw_news = ticker.news or []
        for item in raw_news:
            title = item.get("title") or item.get("headline")
            if not title:
                continue

            link = item.get("link") or item.get("url") or "#"
            publisher = item.get("publisher") or item.get("source") or "Global Market News"
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
        # Indian Peers
        "TCS.NS": ["INFY.NS", "WIPRO.NS", "HCLTECH.NS"],
        "INFY.NS": ["TCS.NS", "WIPRO.NS", "HCLTECH.NS"],
        "HDFCBANK.NS": ["ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "RELIANCE.NS": ["ONGC.NS", "IOC.NS", "BPCL.NS"],
        "TATAMOTORS.NS": ["MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS"],

        # US / Global Peers
        "AAPL": ["MSFT", "GOOGL", "AMZN", "META"],
        "MSFT": ["AAPL", "GOOGL", "AMZN", "META"],
        "NVDA": ["AMD", "INTC", "TSM", "AVGO", "QCOM"],
        "TSLA": ["BYDDY", "F", "GM", "RIVN"],
        "AMZN": ["BABA", "WMT", "TGT", "SHOP"],
        "GOOGL": ["META", "MSFT", "AAPL", "AMZN"],
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
            "Market Cap": overview.get("market_cap_str", "N/A"),
            "P/E (TTM)": f"{overview.get('pe_trailing'):.1f}" if overview.get("pe_trailing") else "N/A",
            "P/B": f"{overview.get('pb_ratio'):.2f}" if overview.get("pb_ratio") else "N/A",
            "ROE (%)": f"{overview.get('roe'):.1f}%" if overview.get("roe") else "N/A",
            "Op Margin (%)": f"{overview.get('operating_margin'):.1f}%" if overview.get("operating_margin") else "N/A",
            "Debt/Equity": f"{overview.get('debt_to_equity'):.2f}" if overview.get("debt_to_equity") else "N/A",
            "Div Yield (%)": f"{overview.get('dividend_yield'):.2f}%" if overview.get("dividend_yield") else "N/A",
        })

    return pd.DataFrame(records)
