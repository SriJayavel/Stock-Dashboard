"""
Global market screener and preset universes (India, US, Crypto, Commodities).
"""

import pandas as pd
import streamlit as st
from src.data_loader import get_company_overview


@st.cache_data(ttl=1800, show_spinner=False)
def get_market_universe_snapshot(category: str = "US Mega-Caps") -> pd.DataFrame:
    """
    Fetch live metrics for a selected global market sector/universe.
    """
    universes = {
        "🇺🇸 US Mega-Caps": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK-B"],
        "🇮🇳 Indian Nifty Leaders": ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "BHARTIARTL.NS", "SBIN.NS", "TATAMOTORS.NS"],
        "🌍 Global Semiconductor & AI": ["NVDA", "TSM", "ASML", "AMD", "AVGO", "QCOM", "INTC", "ARM"],
        "🪙 Cryptocurrencies": ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "DOGE-USD"],
        "🥇 Global Commodities & Currencies": ["GC=F", "SI=F", "CL=F", "NG=F", "INR=X", "EURUSD=X", "GBPUSD=X"],
    }

    symbols = universes.get(category, universes["🇺🇸 US Mega-Caps"])

    data = []
    for sym in symbols:
        overview = get_company_overview(sym)
        curr_char = overview.get("currency_symbol", "$")
        data.append({
            "Symbol": sym.replace(".NS", ""),
            "Name": overview.get("name", sym),
            "Price": f"{curr_char}{overview.get('current_price', 0):,.2f}",
            "Change %": f"{overview.get('change_pct', 0):+.2f}%",
            "Market Cap": overview.get("market_cap_str", "N/A"),
            "P/E": f"{overview.get('pe_trailing'):.1f}" if overview.get("pe_trailing") else "N/A",
            "ROE %": f"{overview.get('roe'):.1f}%" if overview.get("roe") else "N/A",
            "52W High": f"{curr_char}{overview.get('high_52w', 0):,.1f}" if overview.get('high_52w') else "N/A",
            "Sector": overview.get("sector", "N/A"),
        })

    return pd.DataFrame(data)
