"""
Stock screener module for filtering stocks by fundamental and technical criteria.
Operates on the pre-loaded company catalog.
"""

import pandas as pd
import streamlit as st
from src.data_loader import load_companies_catalog, get_company_overview


@st.cache_data(ttl=3600)
def get_popular_stocks_snapshot() -> pd.DataFrame:
    """
    Get a curated list of top Indian benchmark companies with basic metrics.
    """
    benchmark_symbols = [
        "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
        "BHARTIARTL.NS", "SBIN.NS", "LICI.NS", "ITC.NS", "HINDUNILVR.NS",
        "LT.NS", "BAJFINANCE.NS", "HCLTECH.NS", "MARUTI.NS", "SUNPHARMA.NS",
        "TATAMOTORS.NS", "NTPC.NS", "ONGC.NS", "KOTAKBANK.NS", "TITAN.NS"
    ]

    data = []
    for sym in benchmark_symbols:
        overview = get_company_overview(sym)
        data.append({
            "Symbol": sym.replace(".NS", ""),
            "Company": overview.get("name", sym),
            "Price": overview.get("current_price", 0.0),
            "Change %": overview.get("change_pct", 0.0),
            "Market Cap": overview.get("market_cap_str", "N/A"),
            "P/E": overview.get("pe_trailing", None),
            "ROE %": overview.get("roe", None),
            "D/E": overview.get("debt_to_equity", None),
            "Sector": overview.get("sector", "N/A")
        })

    return pd.DataFrame(data)
