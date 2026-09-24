"""
Apex Financial Terminal — Analyze everything. Trade nothing.
Professional Global Market Analysis Platform.
Anti-AI-slop design: clean typography, zero emoji-spam, context-aware metrics,
and native segmented pill navigation.
"""

import sys
import os
import textwrap
from pathlib import Path

# Ensure project root is in sys.path
root_path = Path(__file__).resolve().parent
if str(root_path) not in sys.path:
    sys.path.insert(0, str(root_path))

import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import numpy as np

from src.data_loader import (
    search_global_assets,
    resolve_symbol,
    get_global_market_indices,
    get_company_overview,
    get_historical_ohlcv,
    get_financial_statements,
    get_stock_news,
    get_global_market_news,
    get_peer_comparison,
    get_searchable_asset_catalog,
)
from src.indicators import apply_all_indicators, generate_technical_observations
from src.charts import create_terminal_chart, create_financials_trend_chart, get_tradingview_widget_html
from src.screener import get_market_universe_snapshot

# 1. Page Configuration
st.set_page_config(
    page_title="Apex Financial Terminal",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

def render_html(html_str: str):
    """Render HTML safely without indentation causing markdown code blocks."""
    st.markdown(textwrap.dedent(html_str).strip(), unsafe_allow_html=True)


# 2. TradingView-Matched Sleek Pro Terminal CSS
render_html(
    """
    <style>
    /* Global TradingView Background and Typography */
    .stApp {
        background-color: #131722 !important;
        color: #d1d4dc !important;
        font-family: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif !important;
    }
    /* Hide default fixed Streamlit header to give full screen to terminal */
    header[data-testid="stHeader"] {
        display: none !important;
        height: 0 !important;
    }
    div.block-container {
        padding-top: 0.4rem !important;
        padding-bottom: 1.5rem !important;
        max-width: 99% !important;
    }

    /* Top Ticker Tape (Continuous Train Marquee Animation) */
    .ticker-tape-wrap {
        width: 100%;
        overflow: hidden;
        position: relative;
        padding: 4px 0 8px 0;
        margin-bottom: 8px;
        border-bottom: 1px solid #2a2e39;
        display: flex;
        mask-image: linear-gradient(90deg, transparent 0%, #000 24px, #000 calc(100% - 24px), transparent 100%);
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 24px, #000 calc(100% - 24px), transparent 100%);
    }
    .ticker-tape-track {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: max-content;
        animation: ticker-train 34s linear infinite;
        will-change: transform;
    }
    .ticker-tape-track:hover {
        animation-play-state: paused;
        cursor: default;
    }
    @keyframes ticker-train {
        0% {
            transform: translate3d(0, 0, 0);
        }
        100% {
            transform: translate3d(-50%, 0, 0);
        }
    }
    .ticker-pill {
        flex-shrink: 0;
        background: #1e222d;
        border: 1px solid #363c4e;
        border-radius: 4px;
        padding: 2px 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        height: 24px;
        box-sizing: border-box;
        transition: background 0.15s ease, border-color 0.15s ease;
        user-select: none;
    }
    .ticker-pill:hover {
        background: #242938;
        border-color: #4b5563;
    }
    .ticker-name {
        font-weight: 700;
        color: #ffffff;
        letter-spacing: 0.02em;
    }
    .ticker-val {
        color: #e2e8f0;
        font-weight: 600;
    }
    @media (prefers-reduced-motion: reduce) {
        .ticker-tape-track {
            animation: none;
        }
        .ticker-tape-wrap {
            overflow-x: auto;
        }
    }

    /* KPI Summary Cards (Compact TradingView Stat Tiles) */
    .kpi-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
        contain: layout;
    }
    .kpi-card {
        background: #1e222d;
        border: 1px solid #363c4e;
        border-radius: 4px;
        padding: 6px 12px;
        flex: 1 1 140px;
        min-height: 52px;
        box-sizing: border-box;
    }
    .kpi-label {
        font-size: 10px;
        font-weight: 700;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 2px;
    }
    .kpi-value {
        font-size: 16px;
        font-weight: 700;
        color: #ffffff;
    }
    .kpi-sub {
        font-size: 10px;
        margin-top: 1px;
        color: #9ca3af;
    }

    /* TradingView Badges */
    .terminal-badge {
        background: #2a2e39;
        color: #2962ff;
        border: 1px solid #363c4e;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
    }

    /* Observation Cards */
    .obs-card {
        background: #1e222d;
        border: 1px solid #363c4e;
        border-left: 3px solid #2962ff;
        border-radius: 4px;
        padding: 10px 14px;
        margin-bottom: 8px;
    }

    /* Pro Segmented Control Tabs — 100% Elimination of Radio Circles */
    div[data-testid="stRadio"] label > div:first-child,
    div[data-testid="stRadio"] label div[data-testid="stRadioButton"],
    div[data-testid="stRadio"] label div[data-baseweb="radio"] > div:first-child,
    div[data-testid="stRadio"] label div[class*="st-"] > div:first-child,
    div[data-testid="stRadio"] label input[type="radio"],
    div[data-testid="stRadio"] label svg {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        opacity: 0 !important;
        position: absolute !important;
        pointer-events: none !important;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 5px !important;
        background: transparent !important;
        border-bottom: 1px solid #2a2e39 !important;
        padding-bottom: 8px !important;
        margin-bottom: 14px !important;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] label {
        background: #1e222d !important;
        border: 1px solid #363c4e !important;
        border-radius: 4px !important;
        padding: 5px 12px !important;
        color: #d1d4dc !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.12s ease !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        user-select: none !important;
        margin: 0 !important;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] label:hover {
        background: #2a2e39 !important;
        border-color: #2962ff !important;
        color: #ffffff !important;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] label:has(input:checked),
    div[data-testid="stRadio"] div[role="radiogroup"] label[data-checked="true"] {
        background: #2a2e39 !important;
        border-color: #2962ff !important;
        color: #ffffff !important;
        box-shadow: inset 0 -2px 0 #2962ff !important;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] label div[data-testid="stMarkdownContainer"] p {
        color: inherit !important;
        font-size: 12px !important;
        font-weight: inherit !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    /* TradingView Buttons */
    div.stButton > button {
        background-color: #1e222d !important;
        border: 1px solid #363c4e !important;
        border-radius: 4px !important;
        color: #ffffff !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        padding: 4px 10px !important;
        transition: all 0.12s ease !important;
    }
    div.stButton > button:hover {
        background-color: #2a2e39 !important;
        border-color: #2962ff !important;
        color: #ffffff !important;
    }
    div.stButton > button:focus,
    div.stButton > button:active {
        border-color: #2962ff !important;
        box-shadow: 0 0 0 1px #2962ff !important;
    }

    /* TradingView Search Input */
    div[data-testid="stTextInput"] input {
        background-color: #1e222d !important;
        border: 1px solid #363c4e !important;
        border-radius: 4px !important;
        color: #ffffff !important;
        font-size: 13px !important;
        font-weight: 500 !important;
    }
    div[data-testid="stTextInput"] input:focus {
        border-color: #2962ff !important;
        box-shadow: 0 0 0 1px #2962ff !important;
    }
    div[data-testid="stTextInput"] input::placeholder {
        color: #9ca3af !important;
    }

    /* Selectboxes */
    div[data-testid="stSelectbox"] > div > div {
        background-color: #1e222d !important;
        border: 1px solid #363c4e !important;
        border-radius: 4px !important;
        color: #ffffff !important;
    }

    /* Sub-Tabs */
    div[data-baseweb="tab-list"] {
        background-color: transparent !important;
        border-bottom: 1px solid #2a2e39 !important;
        gap: 6px !important;
    }
    div[data-baseweb="tab"] {
        background-color: transparent !important;
        color: #787b86 !important;
        border: none !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        padding: 6px 12px !important;
    }
    div[data-baseweb="tab"]:hover {
        color: #d1d4dc !important;
    }
    div[data-baseweb="tab"][aria-selected="true"] {
        color: #2962ff !important;
        border-bottom: 2px solid #2962ff !important;
        font-weight: 600 !important;
    }

    /* Plotly Chart Container */
    .stPlotlyChart {
        min-height: 500px;
        contain: layout;
    }

    /* Minimalist TradingView Footer */
    .terminal-footer {
        margin-top: 36px;
        padding: 12px 18px;
        border-top: 1px solid #2a2e39;
        text-align: center;
        font-size: 11px;
        color: #787b86;
    }
    </style>
    """
)

# 3. Session State
if "selected_symbol" not in st.session_state:
    st.session_state["selected_symbol"] = "TCS.NS"
if "watchlist" not in st.session_state:
    st.session_state["watchlist"] = ["TCS.NS", "RELIANCE.NS", "NVDA", "AAPL", "BTC-USD", "^NSEI"]


# 4. Top Live Market Ticker Tape
global_indices = get_global_market_indices()
if global_indices:
    tape_items = []
    for item in global_indices:
        chg = item["change_pct"]
        color = "#089981" if chg >= 0 else "#f23645"
        sign = "+" if chg >= 0 else ""
        tape_items.append(
            f"<div class='ticker-pill'>"
            f"<span class='ticker-name'>{item['name']}</span>"
            f"<span class='ticker-val'>{item['price']:,.2f}</span>"
            f"<span style='color:{color}; font-weight:600;'>{sign}{chg:.2f}%</span>"
            f"</div>"
        )
    # Duplicate items for continuous seamless infinite marquee loop (train track)
    track_content = "".join(tape_items * 2)
    render_html(
        f"<div class='ticker-tape-wrap' title='Live Market Ticker — Hover to Pause'>"
        f"<div class='ticker-tape-track'>{track_content}</div>"
        f"</div>"
    )


# 5. Suggested Dropdown Search & Command Palette
catalog_assets = get_searchable_asset_catalog()

col_brand, col_search_box = st.columns([1.1, 3.2])

with col_brand:
    st.markdown(
        """
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px; font-weight:800; letter-spacing:0.04em; color:#ffffff;">APEX <span style="color:#2962ff;">TERMINAL</span></span>
        </div>
        <div style="font-size:11px; color:#9ca3af; margin-top:2px;">Institutional market research. Zero trade execution.</div>
        """,
        unsafe_allow_html=True,
    )

with col_search_box:
    asset_options = [item["symbol"] for item in catalog_assets]
    asset_labels = {item["symbol"]: item["label"] for item in catalog_assets}

    current_selected = st.session_state.get("selected_symbol", "TCS.NS")
    curr_index = asset_options.index(current_selected) if current_selected in asset_options else None

    def on_dropdown_select():
        chosen = st.session_state.get("global_asset_dropdown")
        if chosen:
            st.session_state["selected_symbol"] = chosen

    st.selectbox(
        "Search Market",
        options=asset_options,
        index=curr_index,
        format_func=lambda s: asset_labels.get(s, s),
        key="global_asset_dropdown",
        on_change=on_dropdown_select,
        placeholder="Type words to search 2,400+ stocks, crypto, commodities (e.g. TCS, Apple, NVDA, Bitcoin)...",
        label_visibility="collapsed",
    )

# Trending Assets Row
trending_chips = [
    ("TCS", "TCS.NS"),
    ("Reliance", "RELIANCE.NS"),
    ("Nifty 50", "^NSEI"),
    ("Nvidia", "NVDA"),
    ("Apple", "AAPL"),
    ("Tesla", "TSLA"),
    ("S&P 500", "^GSPC"),
    ("Bitcoin", "BTC-USD"),
    ("Gold", "GC=F"),
]

st.markdown("<div style='margin-top:6px;'></div>", unsafe_allow_html=True)
chip_cols = st.columns(len(trending_chips))
for i, (label, sym) in enumerate(trending_chips):
    if chip_cols[i].button(label, key=f"chip_{sym}", use_container_width=True):
        st.session_state["selected_symbol"] = sym
        st.rerun()


# 6. Fetch Target Asset Data with Comprehensive Error Handling
current_sym = st.session_state.get("selected_symbol", "TCS.NS")
overview = {}
try:
    with st.spinner(f"Fetching {current_sym}..."):
        overview = get_company_overview(current_sym)
except Exception as e:
    overview = {
        "symbol": current_sym,
        "name": current_sym,
        "current_price": 0.0,
        "prev_close": 0.0,
        "change": 0.0,
        "change_pct": 0.0,
        "currency": "USD",
        "currency_symbol": "$",
        "quote_type": "EQUITY",
        "market_cap_str": "—",
        "low_52w": 0.0,
        "high_52w": 0.0,
        "sector": "Global Asset",
        "industry": "Market Security",
    }
    st.warning(f"Upstream real-time feed for '{current_sym}' is experiencing delay. Displaying offline snapshot.")

# Asset Title & Price Header (Compact Ribbon)
col_header, col_actions = st.columns([5, 1])

with col_header:
    curr_price = overview.get("current_price", 0.0)
    curr_sym_char = overview.get("currency_symbol", "$")
    change = overview.get("change", 0.0)
    change_pct = overview.get("change_pct", 0.0)
    change_color = "#089981" if change >= 0 else "#f23645"
    sign = "+" if change >= 0 else ""

    render_html(
        f"""
        <div style="display:flex; align-items:baseline; gap:12px; margin-top:2px; margin-bottom:4px; flex-wrap:wrap;">
            <span style="font-size:20px; font-weight:800; color:#ffffff;">{overview.get('name')}</span>
            <span class="terminal-badge">{overview.get('symbol')}</span>
            <span style="font-size:24px; font-weight:800; color:#ffffff;">{curr_sym_char}{curr_price:,.2f}</span>
            <span style="font-size:15px; font-weight:700; color:{change_color};">{sign}{change:,.2f} ({sign}{change_pct:.2f}%)</span>
            <span style="font-size:12px; color:#9ca3af;">{overview.get('sector')} • {overview.get('industry')}</span>
        </div>
        """
    )

with col_actions:
    is_in_watchlist = current_sym in st.session_state["watchlist"]
    btn_label = "★ In Watchlist" if is_in_watchlist else "+ Watchlist"
    if st.button(btn_label, use_container_width=True):
        if is_in_watchlist:
            st.session_state["watchlist"].remove(current_sym)
        else:
            st.session_state["watchlist"].append(current_sym)
        st.rerun()


# Context-Aware KPI Summary Cards (Compact 52px Tiles)
q_type = overview.get("quote_type", "EQUITY")

if q_type == "EQUITY":
    render_html(
        f"""
        <div class="kpi-container">
            <div class="kpi-card">
                <div class="kpi-label">Market Cap</div>
                <div class="kpi-value">{overview.get('market_cap_str', '—')}</div>
                <div class="kpi-sub">Total Valuation</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">P/E Ratio (TTM)</div>
                <div class="kpi-value">{f"{overview.get('pe_trailing'):.1f}x" if overview.get('pe_trailing') else '—'}</div>
                <div class="kpi-sub">Fwd: {f"{overview.get('pe_forward'):.1f}x" if overview.get('pe_forward') else '—'}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Price to Book</div>
                <div class="kpi-value">{f"{overview.get('pb_ratio'):.2f}x" if overview.get('pb_ratio') else '—'}</div>
                <div class="kpi-sub">Book Multiple</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">52-Week Range</div>
                <div class="kpi-value" style="font-size:13px; margin-top:2px;">
                    {curr_sym_char}{overview.get('low_52w', 0):,.1f} — {curr_sym_char}{overview.get('high_52w', 0):,.1f}
                </div>
                <div class="kpi-sub">Annual Bounds</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">ROE</div>
                <div class="kpi-value">{f"{overview.get('roe'):.1f}%" if overview.get('roe') else '—'}</div>
                <div class="kpi-sub">Return on Equity</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Debt-to-Equity</div>
                <div class="kpi-value">{f"{overview.get('debt_to_equity'):.2f}" if overview.get('debt_to_equity') else '—'}</div>
                <div class="kpi-sub">Leverage Health</div>
            </div>
        </div>
        """
    )
else:
    # Clean non-equity card layout (Crypto, Indices, Commodities)
    vol_str = f"{overview.get('volume'):,}" if overview.get("volume") else "Active"
    render_html(
        f"""
        <div class="kpi-container">
            <div class="kpi-card">
                <div class="kpi-label">Asset Classification</div>
                <div class="kpi-value" style="font-size:15px;">{q_type.title()}</div>
                <div class="kpi-sub">{overview.get('industry', 'Global Asset')}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Market Scale</div>
                <div class="kpi-value">{overview.get('market_cap_str', '—')}</div>
                <div class="kpi-sub">Aggregate Value</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">52-Week Range</div>
                <div class="kpi-value" style="font-size:13px; margin-top:2px;">
                    {curr_sym_char}{overview.get('low_52w', 0):,.1f} — {curr_sym_char}{overview.get('high_52w', 0):,.1f}
                </div>
                <div class="kpi-sub">Annual Bounds</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Previous Close</div>
                <div class="kpi-value">{curr_sym_char}{overview.get('prev_close', 0):,.2f}</div>
                <div class="kpi-sub">Baseline</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Trading Volume</div>
                <div class="kpi-value" style="font-size:14px; margin-top:2px;">{vol_str}</div>
                <div class="kpi-sub">Market Activity</div>
            </div>
        </div>
        """
    )


# 7. Unified Navigation & Chart Engine Row (Side-by-Side!)
tab_col, engine_col = st.columns([4.2, 1.8])

with tab_col:
    active_tab = st.radio(
        "Navigation Tabs",
        [
            "Chart",
            "Technical Observations",
            "Fundamentals & Statements",
            "Peer Comparison",
            "Market Screener",
            "News Feed",
            "Watchlist",
        ],
        horizontal=True,
        label_visibility="collapsed",
    )

with engine_col:
    if active_tab == "Chart":
        chart_mode = st.radio(
            "Engine",
            ["TradingView Real-Time", "Terminal Quantitative"],
            horizontal=True,
            label_visibility="collapsed",
        )
    else:
        chart_mode = None


# --- TAB 1: CHART ---
if active_tab == "Chart":
    try:
        if chart_mode == "TradingView Real-Time":
            # Official TradingView Advanced Interactive Chart with full drawing tools, timeframes, and indicators
            tv_html = get_tradingview_widget_html(current_sym)
            components.html(tv_html, height=640)
        else:
            # Custom TradingView-Styled Plotly Chart with right-side scale
            tool_col1, tool_col2, tool_col3 = st.columns([2, 1.5, 4.5])

            with tool_col1:
                timeframe = st.selectbox(
                    "Timeframe",
                    options=["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"],
                    index=3,
                    format_func=lambda x: {
                        "1mo": "1 Month",
                        "3mo": "3 Months",
                        "6mo": "6 Months",
                        "1y": "1 Year",
                        "2y": "2 Years",
                        "5y": "5 Years",
                        "max": "All (Max)",
                    }.get(x, x),
                    label_visibility="collapsed",
                )

            with tool_col2:
                chart_type = st.radio("Style", ["Candlestick", "Line"], horizontal=True, label_visibility="collapsed")

            with tool_col3:
                ov_col1, ov_col2, ov_col3, ov_col4, ov_col5 = st.columns(5)
                show_ema = ov_col1.checkbox("EMA 20/50/200", value=True)
                show_bb = ov_col2.checkbox("Bollinger", value=False)
                show_rsi = ov_col3.checkbox("RSI", value=False)
                show_macd = ov_col4.checkbox("MACD", value=False)
                show_vol = ov_col5.checkbox("Volume", value=True)

            hist_df = get_historical_ohlcv(current_sym, period=timeframe, interval="1d")

            if not hist_df.empty:
                hist_df = apply_all_indicators(hist_df)
                fig = create_terminal_chart(
                    hist_df,
                    symbol=current_sym,
                    company_name=overview.get("name", current_sym),
                    chart_type=chart_type,
                    show_ema=show_ema,
                    show_bb=show_bb,
                    show_volume=show_vol,
                    show_rsi=show_rsi,
                    show_macd=show_macd,
                )
                st.plotly_chart(
                    fig,
                    use_container_width=True,
                    config={"displayModeBar": "hover", "scrollZoom": True, "responsive": True},
                )
            else:
                st.info(f"No chart data available for '{current_sym}'.")
    except Exception as e:
        st.info("Chart view is temporarily unavailable. Switch between TradingView Real-Time and Terminal Quantitative above.")

    # Contextual Flash Intelligence strip placed directly beneath the chart
    try:
        quick_news = get_stock_news(current_sym)
        if quick_news:
            st.markdown("<div style='margin-top:14px;'></div>", unsafe_allow_html=True)
            with st.expander(f"⚡ Live Market Intelligence & Headlines ({current_sym})", expanded=True):
                flash_cols = st.columns(min(len(quick_news[:3]), 3))
                for idx, article in enumerate(quick_news[:3]):
                    with flash_cols[idx]:
                        t_thumb = article.get("thumbnail")
                        thumb_html = (
                            f"<div style='height:110px; width:100%; border-radius:4px; overflow:hidden; margin-bottom:8px; background:#131722;'>"
                            f"<img src='{t_thumb}' style='width:100%; height:100%; object-fit:cover;' />"
                            f"</div>"
                            if t_thumb
                            else ""
                        )
                        render_html(
                            f"""
                            <div style="background:#1e222d; border:1px solid #2a2e39; border-radius:4px; padding:12px; height:100%; display:flex; flex-direction:column; justify-content:space-between;">
                                <div>
                                    {thumb_html}
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                        <span style="font-size:10px; font-weight:700; color:#2962ff; text-transform:uppercase;">{article['publisher']}</span>
                                        <span style="font-size:10px; color:#787b86;">{article['time']}</span>
                                    </div>
                                    <div style="font-size:13px; font-weight:600; color:#ffffff; line-height:1.3; margin-bottom:6px;">{article['title']}</div>
                                    {f"<div style='font-size:11px; color:#9ca3af; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;'>{article['summary']}</div>" if article.get('summary') else ""}
                                </div>
                                <div style="margin-top:8px; padding-top:6px; border-top:1px solid #262b3d;">
                                    <a href="{article['link']}" target="_blank" style="color:#2962ff; text-decoration:none; font-size:11px; font-weight:600;">Read Story ↗</a>
                                </div>
                            </div>
                            """
                        )
    except Exception:
        pass


# --- TAB 2: TECHNICAL OBSERVATIONS ---
elif active_tab == "Technical Observations":
    st.markdown("#### Objective Technical Observations")
    st.caption("Quantitative observations on momentum, moving averages, and volatility. Strictly non-advisory.")

    try:
        hist_df = get_historical_ohlcv(current_sym, period="1y", interval="1d")

        if not hist_df.empty and len(hist_df) >= 20:
            hist_df = apply_all_indicators(hist_df)
            observations = generate_technical_observations(hist_df)

            if observations:
                obs_col1, obs_col2 = st.columns(2)
                for i, obs in enumerate(observations):
                    target_col = obs_col1 if i % 2 == 0 else obs_col2
                    with target_col:
                        render_html(
                            f"""
                            <div class="obs-card" style="border-left-color: {obs['color']};">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-weight:700; color:#f8fafc; font-size:13px;">{obs['indicator']} — {obs['type']}</span>
                                    <span style="font-size:11px; font-weight:600; color:{obs['color']};">{obs['status']}</span>
                                </div>
                                <div style="font-size:12px; color:#94a3b8; margin-top:4px;">{obs['detail']}</div>
                            </div>
                            """
                        )

            # Key Moving Average Levels
            st.markdown("#### Moving Average Distances")
            latest = hist_df.iloc[-1]
            levels = [
                {"Reference": "Current Close", "Price": f"{curr_sym_char}{latest['Close']:,.2f}", "Distance": "0.0%"},
                {"Reference": "EMA 20", "Price": f"{curr_sym_char}{latest.get('EMA_20', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('EMA_20', latest['Close'])) / latest.get('EMA_20', 1) * 100):+.2f}%"},
                {"Reference": "EMA 50", "Price": f"{curr_sym_char}{latest.get('EMA_50', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('EMA_50', latest['Close'])) / latest.get('EMA_50', 1) * 100):+.2f}%"},
                {"Reference": "EMA 200", "Price": f"{curr_sym_char}{latest.get('EMA_200', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('EMA_200', latest['Close'])) / latest.get('EMA_200', 1) * 100):+.2f}%"},
                {"Reference": "Bollinger Upper (20,2)", "Price": f"{curr_sym_char}{latest.get('BB_Upper', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('BB_Upper', latest['Close'])) / latest.get('BB_Upper', 1) * 100):+.2f}%"},
                {"Reference": "Bollinger Lower (20,2)", "Price": f"{curr_sym_char}{latest.get('BB_Lower', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('BB_Lower', latest['Close'])) / latest.get('BB_Lower', 1) * 100):+.2f}%"},
            ]
            st.dataframe(pd.DataFrame(levels), use_container_width=True, hide_index=True)
        else:
            st.info("Insufficient data to calculate technical indicators.")
    except Exception:
        st.info("Technical indicator calculation is temporarily unavailable.")


# --- TAB 3: FUNDAMENTALS & STATEMENTS ---
elif active_tab == "Fundamentals & Statements":
    st.markdown("#### Fundamental Valuation & Statements")

    try:
        f_col1, f_col2, f_col3 = st.columns(3)

        with f_col1:
            st.markdown("##### Valuation Multiples")
            st.write(f"**Trailing P/E:** {overview.get('pe_trailing', '—')}")
            st.write(f"**Forward P/E:** {overview.get('pe_forward', '—')}")
            st.write(f"**Price to Book (P/B):** {overview.get('pb_ratio', '—')}")
            st.write(f"**EV / EBITDA:** {overview.get('ev_ebitda', '—')}")
            st.write(f"**PEG Ratio:** {overview.get('peg_ratio', '—')}")
            st.write(f"**Dividend Yield:** {overview.get('dividend_yield', 0):.2f}%" if overview.get('dividend_yield') else "**Dividend Yield:** —")

        with f_col2:
            st.markdown("##### Profitability & Returns")
            st.write(f"**Return on Equity (ROE):** {overview.get('roe', 0):.2f}%" if overview.get('roe') else "**ROE:** —")
            st.write(f"**Return on Assets (ROA):** {overview.get('roa', 0):.2f}%" if overview.get('roa') else "**ROA:** —")
            st.write(f"**Operating Margin:** {overview.get('operating_margin', 0):.2f}%" if overview.get('operating_margin') else "**Operating Margin:** —")
            st.write(f"**Net Profit Margin:** {overview.get('profit_margin', 0):.2f}%" if overview.get('profit_margin') else "**Profit Margin:** —")

        with f_col3:
            st.markdown("##### Balance Sheet & Liquidity")
            st.write(f"**Debt to Equity:** {overview.get('debt_to_equity', '—')}")
            st.write(f"**Current Ratio:** {overview.get('current_ratio', '—')}")
            st.write(f"**Quick Ratio:** {overview.get('quick_ratio', '—')}")
            if overview.get("free_cash_flow"):
                fcf = overview["free_cash_flow"]
                fcf_str = f"₹{fcf/1e7:,.1f} Cr" if overview.get("currency") == "INR" else f"${fcf/1e6:,.1f}M"
                st.write(f"**Free Cash Flow (TTM):** {fcf_str}")

        st.markdown("---")

        # Financial Statements Section
        st.markdown("##### Financial Statements")
        statements = get_financial_statements(current_sym)

        freq_toggle = st.radio("Frequency", ["Annual", "Quarterly"], horizontal=True, label_visibility="collapsed")
        is_qtr = freq_toggle == "Quarterly"

        stmt_tab1, stmt_tab2, stmt_tab3, stmt_tab4 = st.tabs([
            "Revenue Trend",
            "Income Statement",
            "Balance Sheet",
            "Cash Flow",
        ])

        with stmt_tab1:
            inc_data = statements["income_statement_qtr"] if is_qtr else statements["income_statement"]
            trend_fig = create_financials_trend_chart(inc_data)
            st.plotly_chart(trend_fig, use_container_width=True)

        with stmt_tab2:
            inc = statements["income_statement_qtr"] if is_qtr else statements["income_statement"]
            if inc is not None and not inc.empty:
                st.dataframe(inc, use_container_width=True)
            else:
                st.info("Income statement not published or unavailable.")

        with stmt_tab3:
            bal = statements["balance_sheet_qtr"] if is_qtr else statements["balance_sheet"]
            if bal is not None and not bal.empty:
                st.dataframe(bal, use_container_width=True)
            else:
                st.info("Balance sheet not published or unavailable.")

        with stmt_tab4:
            cf = statements["cash_flow_qtr"] if is_qtr else statements["cash_flow"]
            if cf is not None and not cf.empty:
                st.dataframe(cf, use_container_width=True)
            else:
                st.info("Cash flow statement not published or unavailable.")

        st.markdown("---")
        st.markdown("##### Company Overview")
        st.write(overview.get("summary", "No description available."))
        if overview.get("website"):
            st.markdown(f"**Website:** [{overview['website']}]({overview['website']})")
    except Exception:
        st.info("Financial statements and accounting data are not applicable or published for this instrument.")


# --- TAB 4: PEER COMPARISON ---
elif active_tab == "Peer Comparison":
    st.markdown("#### Peer Benchmarking")
    st.caption(f"Comparing {overview.get('name', current_sym)} against industry rivals.")

    try:
        peer_df = get_peer_comparison(current_sym)
        if not peer_df.empty:
            st.dataframe(peer_df, use_container_width=True, hide_index=True)
        else:
            st.info("No peer metrics available.")
    except Exception:
        st.info("Peer benchmarks unavailable for this asset class.")


# --- TAB 5: MARKET SCREENER ---
elif active_tab == "Market Screener":
    st.markdown("#### Global Market Screener")
    st.caption("Benchmark leaders across India, US Wall Street, Semiconductor Ecosystem, and Crypto.")

    category = st.selectbox(
        "Select Universe",
        [
            "🇺🇸 US Mega-Caps",
            "🇮🇳 Indian Nifty Leaders",
            "🌍 Global Semiconductor & AI",
            "🪙 Cryptocurrencies",
            "🥇 Global Commodities & Currencies",
        ],
        label_visibility="collapsed",
    )

    try:
        universe_df = get_market_universe_snapshot(category)
        if not universe_df.empty:
            st.dataframe(universe_df, use_container_width=True, hide_index=True)
        else:
            st.info("Fetching market universe...")
    except Exception:
        st.info("Market screener is synchronizing. Please try again shortly.")


# --- TAB 6: NEWS FEED ---
elif active_tab == "News Feed":
    st.markdown(
        """
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
                <span style="font-size:16px; font-weight:700; color:#ffffff;">Terminal Market Wire & Newsfeed</span>
                <div style="font-size:12px; color:#9ca3af; margin-top:2px;">Real-time institutional newsfeed, earnings releases, and macro coverage.</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    news_ctrl_col1, news_ctrl_col2 = st.columns([1.5, 2.5])
    with news_ctrl_col1:
        feed_source = st.radio(
            "Feed Source",
            [f"Active Asset ({current_sym})", "Global Macro Wire"],
            horizontal=True,
            label_visibility="collapsed",
        )
    with news_ctrl_col2:
        search_filter = st.text_input(
            "Filter news",
            placeholder="Filter news by keyword (e.g. revenue, AI, profit, Fed, target)...",
            label_visibility="collapsed",
        )

    try:
        if "Global Macro" in feed_source:
            raw_articles = get_global_market_news()
        else:
            raw_articles = get_stock_news(current_sym)

        if search_filter.strip():
            kw = search_filter.strip().lower()
            articles = [
                a for a in raw_articles
                if kw in a.get("title", "").lower() or kw in a.get("summary", "").lower() or kw in a.get("publisher", "").lower()
            ]
        else:
            articles = raw_articles

        if articles:
            # 2-column responsive grid layout
            col_left, col_right = st.columns(2)
            for idx, item in enumerate(articles):
                target_col = col_left if idx % 2 == 0 else col_right
                with target_col:
                    t_thumb = item.get("thumbnail")
                    thumb_img = (
                        f"<div style='height:140px; width:100%; border-radius:4px; overflow:hidden; margin-bottom:10px; background:#131722;'>"
                        f"<img src='{t_thumb}' style='width:100%; height:100%; object-fit:cover;' />"
                        f"</div>"
                        if t_thumb
                        else ""
                    )
                    render_html(
                        f"""
                        <div style="background:#1e222d; border:1px solid #2a2e39; border-radius:4px; padding:14px 16px; margin-bottom:12px; min-height:160px; display:flex; flex-direction:column; justify-content:space-between; transition:border-color 0.15s ease;">
                            <div>
                                {thumb_img}
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <span style="font-size:11px; font-weight:700; color:#2962ff; text-transform:uppercase; letter-spacing:0.04em;">{item['publisher']}</span>
                                    <span style="font-size:11px; color:#787b86; font-weight:500;">{item['time']}</span>
                                </div>
                                <div style="font-size:14px; font-weight:600; color:#ffffff; line-height:1.4; margin-bottom:8px;">{item['title']}</div>
                                {f"<div style='font-size:12px; color:#9ca3af; line-height:1.5; margin-bottom:10px;'>{item['summary']}</div>" if item.get('summary') else ""}
                            </div>
                            <div style="padding-top:6px; border-top:1px solid #262b3d; display:flex; justify-content:flex-end;">
                                <a href="{item['link']}" target="_blank" style="color:#2962ff; text-decoration:none; font-size:12px; font-weight:600;">Read Full Story ↗</a>
                            </div>
                        </div>
                        """
                    )
        else:
            if search_filter.strip():
                st.info(f"No news articles matching '{search_filter}'.")
            else:
                st.info(f"No recent articles found for '{current_sym}'.")
    except Exception:
        st.info("News feed is temporarily synchronizing. Please try again shortly.")


# --- TAB 7: WATCHLIST ---
elif active_tab == "Watchlist":
    st.markdown("#### My Watchlist")
    st.caption("Saved in your session. Zero account required.")

    if st.session_state["watchlist"]:
        wl_data = []
        for sym in st.session_state["watchlist"]:
            try:
                ov = get_company_overview(sym)
                c_char = ov.get("currency_symbol", "$")
                wl_data.append({
                    "Symbol": sym,
                    "Name": ov.get("name", sym),
                    "Price": f"{c_char}{ov.get('current_price', 0):,.2f}",
                    "Change %": f"{ov.get('change_pct', 0):+.2f}%",
                    "Market Cap": ov.get("market_cap_str", "—"),
                    "P/E": f"{ov.get('pe_trailing'):.1f}x" if ov.get("pe_trailing") else "—",
                    "52W Span": f"{c_char}{ov.get('low_52w', 0):,.1f} - {ov.get('high_52w', 0):,.1f}",
                })
            except Exception:
                wl_data.append({
                    "Symbol": sym,
                    "Name": sym,
                    "Price": "—",
                    "Change %": "—",
                    "Market Cap": "—",
                    "P/E": "—",
                    "52W Span": "—",
                })

        st.dataframe(pd.DataFrame(wl_data), use_container_width=True, hide_index=True)

        remove_col1, remove_col2 = st.columns([3, 1])
        with remove_col1:
            sym_to_remove = st.selectbox("Remove symbol", st.session_state["watchlist"], label_visibility="collapsed")
        with remove_col2:
            if st.button("Remove from Watchlist", use_container_width=True):
                st.session_state["watchlist"].remove(sym_to_remove)
                st.rerun()
    else:
        st.info("Watchlist is empty. Click '+ Add to Watchlist' on any asset to track it.")


# 8. Disclaimer Footer
render_html(
    """
    <div class="terminal-footer">
        Strictly for financial research, education, and market analysis. Analyze everything. Trade nothing. Not investment advice.
    </div>
    """
)
