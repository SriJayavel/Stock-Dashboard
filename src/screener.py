"""
Global market screener with fast multi-threaded batch fetching.
"""

import pandas as pd
import streamlit as st
import yfinance as yf


@st.cache_data(ttl=1800, show_spinner=False)
def get_market_universe_snapshot(category: str = "🇺🇸 US Mega-Caps") -> pd.DataFrame:
    """
    Fetch live metrics for a selected global market sector/universe using fast batch loading.
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

    try:
        batch = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                t = batch.tickers.get(sym)
                if not t:
                    continue

                fast = getattr(t, "fast_info", None)
                info = getattr(t, "info", {}) or {}

                price = (
                    (fast.get("lastPrice") if hasattr(fast, "get") else None)
                    or info.get("currentPrice")
                    or info.get("regularMarketPrice")
                    or 0.0
                )
                prev = (
                    (fast.get("previousClose") if hasattr(fast, "get") else None)
                    or info.get("previousClose")
                    or price
                )
                chg_pct = ((price - prev) / prev * 100) if prev and price else 0.0

                mcap = (
                    (fast.get("marketCap") if hasattr(fast, "get") else None)
                    or info.get("marketCap")
                    or 0
                )
                curr = info.get("currency") or (fast.get("currency") if hasattr(fast, "get") else None) or "USD"
                curr_char = "₹" if curr == "INR" else ("$" if curr == "USD" else curr + " ")

                if mcap >= 1e12:
                    mcap_str = f"{curr_char}{mcap/1e12:.2f}T"
                elif mcap >= 1e9:
                    mcap_str = f"{curr_char}{mcap/1e9:.2f}B"
                elif mcap >= 1e7 and curr == "INR":
                    mcap_str = f"₹{mcap/1e7:,.1f} Cr"
                elif mcap > 0:
                    mcap_str = f"{curr_char}{mcap/1e6:.1f}M"
                else:
                    mcap_str = "N/A"

                pe = info.get("trailingPE")
                high52 = (fast.get("yearHigh") if hasattr(fast, "get") else None) or info.get("fiftyTwoWeekHigh")

                data.append({
                    "Symbol": sym.replace(".NS", ""),
                    "Name": info.get("shortName") or info.get("longName") or sym,
                    "Price": f"{curr_char}{price:,.2f}",
                    "Change %": f"{chg_pct:+.2f}%",
                    "Market Cap": mcap_str,
                    "P/E": f"{pe:.1f}" if pe else "N/A",
                    "52W High": f"{curr_char}{high52:,.1f}" if high52 else "N/A",
                    "Sector": info.get("sector", "Global Market"),
                })
            except Exception:
                continue
    except Exception:
        pass

    return pd.DataFrame(data)
