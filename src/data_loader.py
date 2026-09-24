"""
Resilient data loading pipeline for Indian (NSE/BSE) and Global stocks.
Implements aggressive caching via @st.cache_data to guarantee fast load times
and eliminate rate-limit errors.
"""

import streamlit as st
import yfinance as yf
import pandas as pd
import numpy as np
import datetime
import os


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


def resolve_symbol(query: str) -> str:
    """
    Intelligently resolve user input into a valid Yahoo Finance ticker.
    Examples:
      - 'TCS' -> 'TCS.NS'
      - 'RELIANCE.NS' -> 'RELIANCE.NS'
      - 'AAPL' -> 'AAPL'
      - 'BOM:500325' -> '500325.BO'
    """
    if not query:
        return "TCS.NS"

    cleaned = str(query).strip().upper()

    # If it already contains an exchange suffix, return directly
    if cleaned.endswith(".NS") or cleaned.endswith(".BO"):
        return cleaned

    # Check if it matches an NSE symbol from companies.csv
    catalog = load_companies_catalog()
    if not catalog.empty and "SYMBOL" in catalog.columns:
        if cleaned in catalog["SYMBOL"].values:
            return f"{cleaned}.NS"

    # Common US mega caps
    us_tickers = {"AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "SPY", "QQQ"}
    if cleaned in us_tickers:
        return cleaned

    # Default for alphanumeric Indian symbols: append .NS
    if cleaned.isalnum():
        return f"{cleaned}.NS"

    return cleaned


@st.cache_data(ttl=1800, show_spinner=False)
def get_company_overview(symbol: str) -> dict:
    """
    Fetch comprehensive company overview, valuation multiples, and financial health ratios.
    Never crashes on missing fields; uses safe defaults.
    """
    ticker = yf.Ticker(symbol)
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    # Extract price info safely
    regular_price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or 0.0
    prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose") or regular_price
    price_change = regular_price - prev_close if regular_price and prev_close else 0.0
    price_change_pct = (price_change / prev_close * 100) if prev_close else 0.0

    currency = info.get("currency", "INR")
    currency_symbol = "₹" if currency == "INR" else ("$" if currency == "USD" else currency + " ")

    # Format market cap
    raw_mcap = info.get("marketCap")
    mcap_display = "N/A"
    if raw_mcap and raw_mcap > 0:
        if currency == "INR":
            # Convert to Indian Crores (1 Cr = 10,000,000)
            cr_val = raw_mcap / 1e7
            mcap_display = f"₹{cr_val:,.1f} Cr"
        else:
            if raw_mcap >= 1e12:
                mcap_display = f"${raw_mcap/1e12:.2f}T"
            elif raw_mcap >= 1e9:
                mcap_display = f"${raw_mcap/1e9:.2f}B"
            else:
                mcap_display = f"${raw_mcap/1e6:.1f}M"

    overview = {
        "symbol": symbol,
        "name": info.get("longName") or info.get("shortName") or symbol,
        "current_price": regular_price,
        "prev_close": prev_close,
        "change": price_change,
        "change_pct": price_change_pct,
        "currency": currency,
        "currency_symbol": currency_symbol,
        "market_cap": raw_mcap,
        "market_cap_str": mcap_display,
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "summary": info.get("longBusinessSummary", "No company description available."),
        "website": info.get("website", ""),

        # Valuation Multiples
        "pe_trailing": info.get("trailingPE"),
        "pe_forward": info.get("forwardPE"),
        "pb_ratio": info.get("priceToBook"),
        "ev_ebitda": info.get("enterpriseToEbitda"),
        "peg_ratio": info.get("pegRatio"),
        "dividend_yield": (info.get("dividendYield") * 100) if info.get("dividendYield") else None,

        # 52-Week Range
        "high_52w": info.get("fiftyTwoWeekHigh"),
        "low_52w": info.get("fiftyTwoWeekLow"),

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
    Fetch historical Open, High, Low, Close, Volume.
    Period options: 1d, 5d, 1mo, 6mo, 1y, 2y, 5y, max.
    """
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            # Fallback try without suffix or with .NS
            alt_sym = symbol + ".NS" if not symbol.endswith(".NS") else symbol.replace(".NS", "")
            alt_ticker = yf.Ticker(alt_sym)
            df = alt_ticker.history(period=period, interval=interval, auto_adjust=True)

        if not df.empty:
            df = df.reset_index()
            # Standardize date column
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
    """
    Extract Income Statement, Balance Sheet, and Cash Flow statements.
    """
    ticker = yf.Ticker(symbol)
    statements = {
        "income_statement": None,
        "balance_sheet": None,
        "cash_flow": None,
        "income_statement_qtr": None,
        "balance_sheet_qtr": None,
        "cash_flow_qtr": None,
    }

    try:
        inc = ticker.financials
        if inc is not None and not inc.empty:
            statements["income_statement"] = inc
    except Exception:
        pass

    try:
        bal = ticker.balance_sheet
        if bal is not None and not bal.empty:
            statements["balance_sheet"] = bal
    except Exception:
        pass

    try:
        cf = ticker.cashflow
        if cf is not None and not cf.empty:
            statements["cash_flow"] = cf
    except Exception:
        pass

    try:
        q_inc = ticker.quarterly_financials
        if q_inc is not None and not q_inc.empty:
            statements["income_statement_qtr"] = q_inc
    except Exception:
        pass

    try:
        q_bal = ticker.quarterly_balance_sheet
        if q_bal is not None and not q_bal.empty:
            statements["balance_sheet_qtr"] = q_bal
    except Exception:
        pass

    try:
        q_cf = ticker.quarterly_cashflow
        if q_cf is not None and not q_cf.empty:
            statements["cash_flow_qtr"] = q_cf
    except Exception:
        pass

    return statements


@st.cache_data(ttl=900, show_spinner=False)
def get_stock_news(symbol: str) -> list[dict]:
    """
    Extract latest company news articles via yfinance.
    """
    ticker = yf.Ticker(symbol)
    articles = []
    try:
        raw_news = ticker.news or []
        for item in raw_news:
            # Handle new and legacy yfinance news structures
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
    """
    Fetch comparative valuation and profitability metrics for the stock and its peers.
    """
    # Default peer suggestions for popular Indian sectors
    default_peer_groups = {
        "TCS.NS": ["INFY.NS", "WIPRO.NS", "HCLTECH.NS"],
        "INFY.NS": ["TCS.NS", "WIPRO.NS", "HCLTECH.NS"],
        "HDFCBANK.NS": ["ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "ICICIBANK.NS": ["HDFCBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "RELIANCE.NS": ["ONGC.NS", "IOC.NS", "BPCL.NS"],
        "TATAMOTORS.NS": ["MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS"],
    }

    if not peers:
        peers = default_peer_groups.get(symbol, ["INFY.NS", "TCS.NS", "RELIANCE.NS", "HDFCBANK.NS"])

    # Ensure current symbol is included first
    all_symbols = [symbol] + [p for p in peers if p != symbol]

    records = []
    for s in all_symbols:
        overview = get_company_overview(s)
        records.append({
            "Symbol": s.replace(".NS", ""),
            "Company": overview.get("name", s),
            "Price": f"{overview.get('currency_symbol', '₹')}{overview.get('current_price', 0):,.2f}",
            "Market Cap": overview.get("market_cap_str", "N/A"),
            "P/E (TTM)": f"{overview.get('pe_trailing'):.1f}" if overview.get("pe_trailing") else "N/A",
            "P/B": f"{overview.get('pb_ratio'):.2f}" if overview.get("pb_ratio") else "N/A",
            "ROE (%)": f"{overview.get('roe'):.1f}%" if overview.get("roe") else "N/A",
            "Operating Margin (%)": f"{overview.get('operating_margin'):.1f}%" if overview.get("operating_margin") else "N/A",
            "Debt/Equity": f"{overview.get('debt_to_equity'):.2f}" if overview.get("debt_to_equity") else "N/A",
            "Div Yield (%)": f"{overview.get('dividend_yield'):.2f}%" if overview.get("dividend_yield") else "N/A",
        })

    return pd.DataFrame(records)
