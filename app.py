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

from src.data_loader import (
    get_global_market_indices,
    get_company_overview,
    get_historical_ohlcv,
    get_performance_returns,
    get_financial_statements,
    get_stock_news,
    get_global_market_news,
    get_peer_comparison,
    get_searchable_asset_catalog,
    get_hero_index_data,
    get_major_indices_overview,
    get_multi_asset_dashboard_data,
    get_community_trends_by_category,
    get_top_stories_wire,
    get_featured_ipos,
    get_community_trade_ideas,
)
from src.indicators import apply_all_indicators, generate_technical_observations
from src.charts import (
    create_terminal_chart,
    create_financials_trend_chart,
    get_tradingview_widget_html,
    create_hero_index_area_chart,
    create_sparkline_area_chart,
    create_macro_inflation_chart,
    create_trade_idea_preview_chart,
)
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


# 2. Session State Initialization
if "theme" not in st.session_state:
    st.session_state["theme"] = "dark"
if "active_nav_tab" not in st.session_state:
    st.session_state["active_nav_tab"] = "🌐 Markets Overview"
if "selected_symbol" not in st.session_state:
    st.session_state["selected_symbol"] = "TCS.NS"
if "watchlist" not in st.session_state:
    st.session_state["watchlist"] = ["TCS.NS", "RELIANCE.NS", "NVDA", "AAPL", "BTC-USD", "^NSEI"]

theme_mode = st.session_state.get("theme", "dark")
is_dark = theme_mode == "dark"

bg_app = "#131722" if is_dark else "#ffffff"
text_main = "#d1d4dc" if is_dark else "#131722"
text_bright = "#ffffff" if is_dark else "#131722"
card_bg = "#1e222d" if is_dark else "#ffffff"
card_border = "#2a2e39" if is_dark else "#e0e3eb"
border_subtle = "#262b3d" if is_dark else "#f0f3fa"
hover_bg = "#242938" if is_dark else "#f4f6fb"
muted = "#787b86" if is_dark else "#64748b"
badge_bg = "#2a2e39" if is_dark else "#f0f3fa"
input_bg = "#1e222d" if is_dark else "#ffffff"
input_border = "#363c4e" if is_dark else "#d1d4dc"

# 3. TradingView-Matched Sleek Pro Terminal CSS
root_theme_css = f"""
    <style>
    :root {{
        --bg-app: {bg_app};
        --text-color: {text_main};
        --text-bright: {text_bright};
        --card-bg: {card_bg};
        --border-color: {card_border};
        --border-subtle: {border_subtle};
        --hover-bg: {hover_bg};
        --muted-color: {muted};
        --badge-bg: {badge_bg};
        --input-bg: {input_bg};
        --input-border: {input_border};
    }}
    </style>
"""
render_html(root_theme_css)

base_terminal_css = """
    <style>
    /* Global TradingView Background and Typography */
    .stApp {
        background-color: var(--bg-app) !important;
        color: var(--text-color) !important;
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
        min-height: 200px;
        contain: layout;
    }

    /* Section Headers with TradingView style */
    .tv-section-header {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 20px;
        font-weight: 800;
        color: var(--text-bright);
        letter-spacing: -0.01em;
    }

    /* Community Trends Cards */
    .tv-trend-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 12px 14px;
        min-height: 104px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        margin-bottom: 4px;
    }
    .tv-trend-card:hover {
        transform: translateY(-2px);
        border-color: #2962ff;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    /* Top Story Cards */
    .tv-story-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 14px 16px;
        min-height: 110px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: transform 0.12s ease, border-color 0.12s ease;
        margin-bottom: 12px;
    }
    .tv-story-card:hover {
        border-color: #2962ff;
        transform: translateY(-1px);
    }
    .tv-story-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--muted-color);
        margin-bottom: 6px;
    }
    .tv-story-headline {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-bright);
        line-height: 1.45;
    }

    /* Multi-Asset Hub Cards */
    .tv-multi-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 10px;
    }

    /* Hero Card */
    .tv-hero-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px 18px;
        margin-bottom: 6px;
    }

    /* IPO & Idea Cards */
    .tv-ipo-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 14px 16px;
        min-height: 115px;
    }
    .tv-idea-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        border-bottom: none;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    /* Minimalist TradingView Footer */
    .terminal-footer {
        margin-top: 36px;
        padding: 12px 18px;
        border-top: 1px solid var(--border-color);
        text-align: center;
        font-size: 11px;
        color: var(--muted-color);
    }
    </style>
"""
render_html(base_terminal_css)


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

col_brand, col_search_box, col_theme = st.columns([1.1, 2.7, 0.45])

with col_brand:
    st.markdown(
        """
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px; font-weight:800; letter-spacing:0.04em; color:var(--text-bright);">APEX <span style="color:#2962ff;">TERMINAL</span></span>
        </div>
        <div style="font-size:11px; color:var(--muted-color); margin-top:2px;">Institutional market research. Zero trade execution.</div>
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
            st.session_state["active_nav_tab"] = "📈 Interactive Chart"

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

with col_theme:
    theme_btn_label = "☀️ Light" if is_dark else "🌙 Dark"
    if st.button(theme_btn_label, use_container_width=True, help="Toggle TradingView Dark / Light Mode"):
        st.session_state["theme"] = "light" if is_dark else "dark"
        st.rerun()

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

st.markdown("<div style='margin-top:4px;'></div>", unsafe_allow_html=True)
chip_cols = st.columns(len(trending_chips))
for i, (label, sym) in enumerate(trending_chips):
    if chip_cols[i].button(label, key=f"chip_{sym}", use_container_width=True):
        st.session_state["selected_symbol"] = sym
        st.session_state["active_nav_tab"] = "📈 Interactive Chart"
        st.rerun()

# Primary Navigation Bar (Segmented TradingView Control)
nav_options = [
    "🌐 Markets Overview",
    "📈 Interactive Chart",
    "🔍 Technical Observations",
    "🏢 Fundamentals & Statements",
    "⚖️ Peer Comparison",
    "📊 Market Screener",
    "📰 Top Stories & News",
    "💡 Trade Ideas & IPOs",
    "★ Watchlist",
]
curr_nav_idx = nav_options.index(st.session_state["active_nav_tab"]) if st.session_state["active_nav_tab"] in nav_options else 0

def on_nav_change():
    st.session_state["active_nav_tab"] = st.session_state["primary_nav_bar"]

nav_col, engine_col = st.columns([4.2, 1.8])

with nav_col:
    active_tab = st.radio(
        "Terminal Navigation",
        nav_options,
        index=curr_nav_idx,
        horizontal=True,
        label_visibility="collapsed",
        key="primary_nav_bar",
        on_change=on_nav_change,
    )

with engine_col:
    if "Chart" in active_tab:
        chart_mode = st.radio(
            "Engine",
            ["TradingView Real-Time", "Terminal Quantitative"],
            horizontal=True,
            label_visibility="collapsed",
        )
    else:
        chart_mode = None


def render_asset_summary_ribbon(sym: str) -> dict:
    ov = {}
    try:
        ov = get_company_overview(sym)
    except Exception:
        ov = {
            "symbol": sym,
            "name": sym,
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

    # Asset Title & Price Header (Compact Ribbon)
    col_header, col_actions = st.columns([5, 1])

    with col_header:
        curr_price = ov.get("current_price", 0.0)
        curr_sym_char = ov.get("currency_symbol", "$")
        change = ov.get("change", 0.0)
        change_pct = ov.get("change_pct", 0.0)
        change_color = "#089981" if change >= 0 else "#f23645"
        sign = "+" if change >= 0 else ""

        render_html(
            f"""
            <div style="display:flex; align-items:baseline; gap:12px; margin-top:2px; margin-bottom:4px; flex-wrap:wrap;">
                <span style="font-size:20px; font-weight:800; color:var(--text-bright);">{ov.get('name')}</span>
                <span class="terminal-badge">{ov.get('symbol')}</span>
                <span style="font-size:24px; font-weight:800; color:var(--text-bright);">{curr_sym_char}{curr_price:,.2f}</span>
                <span style="font-size:15px; font-weight:700; color:{change_color};">{sign}{change:,.2f} ({sign}{change_pct:.2f}%)</span>
                <span style="font-size:12px; color:var(--muted-color);">{ov.get('sector')} • {ov.get('industry')}</span>
            </div>
            """
        )

    with col_actions:
        is_in_watchlist = sym in st.session_state["watchlist"]
        btn_label = "★ In Watchlist" if is_in_watchlist else "+ Watchlist"
        if st.button(btn_label, key=f"wl_btn_{sym}", use_container_width=True):
            if is_in_watchlist:
                st.session_state["watchlist"].remove(sym)
            else:
                st.session_state["watchlist"].append(sym)
            st.rerun()

    # Context-Aware KPI Summary Cards (Compact 52px Tiles)
    q_type = ov.get("quote_type", "EQUITY")

    if q_type == "EQUITY":
        render_html(
            f"""
            <div class="kpi-container">
                <div class="kpi-card">
                    <div class="kpi-label">Market Cap</div>
                    <div class="kpi-value">{ov.get('market_cap_str', '—')}</div>
                    <div class="kpi-sub">Total Valuation</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">P/E Ratio (TTM)</div>
                    <div class="kpi-value">{f"{ov.get('pe_trailing'):.1f}x" if ov.get('pe_trailing') else '—'}</div>
                    <div class="kpi-sub">Fwd: {f"{ov.get('pe_forward'):.1f}x" if ov.get('pe_forward') else '—'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Price to Book</div>
                    <div class="kpi-value">{f"{ov.get('pb_ratio'):.2f}x" if ov.get('pb_ratio') else '—'}</div>
                    <div class="kpi-sub">Book Multiple</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">52-Week Range</div>
                    <div class="kpi-value" style="font-size:13px; margin-top:2px;">
                        {curr_sym_char}{ov.get('low_52w', 0):,.1f} — {curr_sym_char}{ov.get('high_52w', 0):,.1f}
                    </div>
                    <div class="kpi-sub">Annual Bounds</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">ROE</div>
                    <div class="kpi-value">{f"{ov.get('roe'):.1f}%" if ov.get('roe') else '—'}</div>
                    <div class="kpi-sub">Return on Equity</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Debt-to-Equity</div>
                    <div class="kpi-value">{f"{ov.get('debt_to_equity'):.2f}" if ov.get('debt_to_equity') else '—'}</div>
                    <div class="kpi-sub">Leverage Health</div>
                </div>
            </div>
            """
        )
    else:
        vol_str = f"{ov.get('volume'):,}" if ov.get("volume") else "Active"
        render_html(
            f"""
            <div class="kpi-container">
                <div class="kpi-card">
                    <div class="kpi-label">Asset Classification</div>
                    <div class="kpi-value" style="font-size:15px;">{q_type.title()}</div>
                    <div class="kpi-sub">{ov.get('industry', 'Global Asset')}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Market Scale</div>
                    <div class="kpi-value">{ov.get('market_cap_str', '—')}</div>
                    <div class="kpi-sub">Aggregate Value</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">52-Week Range</div>
                    <div class="kpi-value" style="font-size:13px; margin-top:2px;">
                        {curr_sym_char}{ov.get('low_52w', 0):,.1f} — {curr_sym_char}{ov.get('high_52w', 0):,.1f}
                    </div>
                    <div class="kpi-sub">Annual Bounds</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Previous Close</div>
                    <div class="kpi-value">{curr_sym_char}{ov.get('prev_close', 0):,.2f}</div>
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

    # Performance Return Velocity Matrix (1W, 1M, 3M, 6M, 1Y, YTD)
    try:
        perf_data = get_performance_returns(sym)
        if perf_data:
            perf_chips = []
            for horizon, ret in perf_data.items():
                if ret is not None:
                    color = "#089981" if ret >= 0 else "#f23645"
                    sign = "+" if ret >= 0 else ""
                    perf_chips.append(
                        f"<div style='background:var(--card-bg); border:1px solid var(--border-color); border-radius:4px; padding:3px 10px; display:inline-flex; align-items:center; gap:6px; font-size:11px;'>"
                        f"<span style='color:var(--muted-color); font-weight:600;'>{horizon}</span>"
                        f"<span style='color:{color}; font-weight:700;'>{sign}{ret:.2f}%</span>"
                        f"</div>"
                    )
            if perf_chips:
                render_html(
                    f"""
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                        <span style="font-size:10px; font-weight:700; color:var(--muted-color); text-transform:uppercase; letter-spacing:0.04em;">Returns Horizon:</span>
                        {''.join(perf_chips)}
                    </div>
                    """
                )
    except Exception:
        pass
    return ov


# 6. View Rendering (Markets Overview Hub vs Asset Deep Terminal)
if active_tab == "🌐 Markets Overview":
    # =========================================================================
    # TRADINGVIEW MARKET OVERVIEW HOMEPAGE (Screenshots 1 - 5)
    # =========================================================================

    # --- SECTION 1: CATEGORY TABS & COMMUNITY TRENDS (Screenshot 2) ---
    st.markdown("<div style='margin-top:6px;'></div>", unsafe_allow_html=True)
    cat_col, _ = st.columns([5, 1])
    with cat_col:
        selected_trend_cat = st.radio(
            "Market Category",
            ["Indian stocks", "Crypto", "Futures", "Forex", "Economy", "Brokers"],
            horizontal=True,
            key="trend_cat_radio",
            label_visibility="collapsed",
        )

    cat_icons = {
        "Indian stocks": "🇮🇳",
        "Crypto": "🪙",
        "Futures": "⚡",
        "Forex": "💱",
        "Economy": "🏛️",
        "Brokers": "🤝",
    }
    cat_flag = cat_icons.get(selected_trend_cat, "🌐")

    st.markdown(
        f"""
        <div style="display:flex; align-items:center; gap:8px; margin-top:12px; margin-bottom:8px;">
            <span style="font-size:22px;">{cat_flag}</span>
            <span style="font-size:20px; font-weight:800; color:var(--text-bright);">{selected_trend_cat}</span>
            <span style="font-size:16px; color:var(--muted-color); font-weight:600;">›</span>
        </div>
        <div style="font-size:13px; font-weight:700; color:var(--text-bright); margin-bottom:10px;">Community trends</div>
        """,
        unsafe_allow_html=True,
    )

    trends_items = get_community_trends_by_category(selected_trend_cat)
    trend_cols = st.columns(min(len(trends_items), 4))
    for idx, item in enumerate(trends_items[:4]):
        col = trend_cols[idx % 4]
        with col:
            chg = item["change_pct"]
            chg_color = "#089981" if chg >= 0 else "#f23645"
            sign = "+" if chg >= 0 else ""
            st.markdown(
                f"""
                <div class="tv-trend-card">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:34px; height:34px; border-radius:50%; background:{item['icon_bg']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; flex-shrink:0;">
                            {item['monogram']}
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <span style="font-size:13px; font-weight:700; color:var(--text-bright);">{item['code']}</span>
                                <span style="font-size:9px; background:var(--badge-bg); color:var(--muted-color); padding:1px 3px; border-radius:3px;">D</span>
                            </div>
                            <div style="font-size:11px; color:var(--muted-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">{item['name']}</div>
                        </div>
                    </div>
                    <div style="margin-top:10px;">
                        <div style="font-size:15px; font-weight:800; color:var(--text-bright);">{item['price_str']}</div>
                        <div style="font-size:12px; font-weight:700; color:{chg_color};">{sign}{chg:.2f}%</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if st.button("Inspect ↗", key=f"trend_btn_{item['symbol']}_{idx}", use_container_width=True):
                st.session_state["selected_symbol"] = item["symbol"]
                st.session_state["active_nav_tab"] = "📈 Interactive Chart"
                st.rerun()

    # --- SECTION 2: HERO MARKET INDEX & MAJOR INDICES (Screenshot 4) ---
    st.markdown("<div style='margin-top:20px;'></div>", unsafe_allow_html=True)
    col_hero, col_major = st.columns([2.6, 1.4])

    with col_hero:
        hero_index_key = st.radio(
            "Hero Index Choice",
            ["Nifty 50 (^NSEI)", "Sensex (^BSESN)", "S&P 500 (^GSPC)", "Nasdaq 100 (^IXIC)", "Bitcoin (BTC-USD)"],
            horizontal=True,
            label_visibility="collapsed",
            key="hero_index_choice",
        )
        symbol_pick = hero_index_key.split("(")[-1].replace(")", "").strip()
        hero_data = get_hero_index_data(symbol_pick)
        chg = hero_data["change"]
        chg_pct = hero_data["change_pct"]
        chg_color = "#089981" if chg >= 0 else "#f23645"
        sign = "+" if chg >= 0 else ""

        st.markdown(
            f"""
            <div class="tv-hero-card">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:38px; height:38px; border-radius:50%; background:{hero_data['badge_color']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px;">
                            {hero_data['badge']}
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:18px; font-weight:800; color:var(--text-bright);">{hero_data['name']}</span>
                                <span style="font-size:11px; background:var(--badge-bg); color:var(--muted-color); padding:1px 5px; border-radius:3px; font-weight:600;">{hero_data['clean']}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:24px; font-weight:800; color:var(--text-bright);">{hero_data['price']:,.2f}</span>
                        <span style="font-size:12px; color:var(--muted-color); font-weight:600;">{hero_data['unit']}</span>
                        <span style="font-size:15px; font-weight:700; color:{chg_color};">{sign}{chg_pct:.2f}%</span>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        hero_fig = create_hero_index_area_chart(hero_data["df"], change_pct=chg_pct, theme=theme_mode, height=320)
        st.plotly_chart(hero_fig, use_container_width=True, config={"displayModeBar": False})

    with col_major:
        st.markdown(
            """
            <div style="font-size:16px; font-weight:800; color:var(--text-bright); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <span>Major indices</span>
            </div>
            """,
            unsafe_allow_html=True,
        )

        major_list = get_major_indices_overview()
        for idx, m in enumerate(major_list):
            m_chg = m["change_pct"]
            m_color = "#089981" if m_chg >= 0 else "#f23645"
            m_sign = "+" if m_chg >= 0 else ""

            col_m1, col_m2 = st.columns([2.6, 1.4])
            with col_m1:
                st.markdown(
                    f"""
                    <div style="display:flex; align-items:center; gap:8px; padding:5px 0;">
                        <div style="width:26px; height:26px; border-radius:50%; background:{m['badge_bg']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:10px; flex-shrink:0;">
                            {m['badge']}
                        </div>
                        <div>
                            <div style="font-size:12px; font-weight:700; color:var(--text-bright); line-height:1.2;">{m['name']}</div>
                            <div style="font-size:10px; color:var(--muted-color);">{m['clean']}</div>
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
            with col_m2:
                st.markdown(
                    f"""
                    <div style="text-align:right; padding:5px 0;">
                        <div style="font-size:12px; font-weight:700; color:var(--text-bright); line-height:1.2;">{m['price']:,.2f}</div>
                        <div style="font-size:11px; font-weight:600; color:{m_color};">{m_sign}{m_chg:.2f}%</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
            st.markdown("<div style='border-bottom:1px solid var(--border-subtle); margin:1px 0;'></div>", unsafe_allow_html=True)

        if st.button("See all major indices in Screener ›", use_container_width=True):
            st.session_state["active_nav_tab"] = "📊 Market Screener"
            st.rerun()

    # --- SECTION 3: MULTI-ASSET OVERVIEW DASHBOARD (Screenshot 3) ---
    st.markdown("<div style='margin-top:24px;'></div>", unsafe_allow_html=True)
    col_dash1, col_dash2, col_dash3 = st.columns(3)
    dash_data = get_multi_asset_dashboard_data()

    with col_dash1:
        crypto_info = dash_data["crypto"]
        c_color = "#089981" if crypto_info["change_pct"] >= 0 else "#f23645"
        st.markdown(
            f"""
            <div class="tv-multi-card">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="color:#2563eb; font-size:16px;">🪙</span>
                    <span style="font-size:13px; font-weight:700; color:var(--text-bright);">{crypto_info['title']}</span>
                    <span style="font-size:9px; background:var(--badge-bg); color:var(--muted-color); padding:1px 4px; border-radius:3px;">{crypto_info['code']}</span>
                </div>
                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:6px;">
                    <span style="font-size:18px; font-weight:800; color:var(--text-bright);">{crypto_info['value_str']}</span>
                    <span style="font-size:12px; font-weight:700; color:{c_color};">+{crypto_info['change_pct']:.2f}%</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        spk_crypto = create_sparkline_area_chart(crypto_info["dates"], crypto_info["history"], change_pct=crypto_info["change_pct"], theme=theme_mode, height=85)
        st.plotly_chart(spk_crypto, use_container_width=True, config={"displayModeBar": False})

        dom = crypto_info["dominance"]
        st.markdown(
            f"""
            <div style="margin-top:10px; margin-bottom:8px;">
                <div style="font-size:12px; font-weight:700; color:var(--text-bright); margin-bottom:4px;">Bitcoin dominance</div>
                <div style="display:flex; gap:12px; font-size:11px; margin-bottom:4px;">
                    <span style="color:#2962ff;">● Bitcoin <b>{dom['btc']}%</b></span>
                    <span style="color:#089981;">● Ethereum <b>{dom['eth']}%</b></span>
                    <span style="color:#f23645;">● Others <b>{dom['others']}%</b></span>
                </div>
                <div style="height:6px; width:100%; border-radius:3px; overflow:hidden; display:flex;">
                    <div style="width:{dom['btc']}%; background:#2962ff;"></div>
                    <div style="width:{dom['eth']}%; background:#089981;"></div>
                    <div style="width:{dom['others']}%; background:#f23645;"></div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        for c_asset in crypto_info["top_assets"]:
            c_chg = c_asset["change_pct"]
            c_chg_col = "#089981" if c_chg >= 0 else "#f23645"
            st.markdown(
                f"""
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--border-subtle);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:24px; height:24px; border-radius:50%; background:{c_asset['icon_bg']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">{c_asset['icon']}</div>
                        <div>
                            <div style="font-size:12px; font-weight:700; color:var(--text-bright);">{c_asset['name']}</div>
                            <div style="font-size:10px; color:var(--muted-color);">{c_asset['code']}</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px; font-weight:700; color:var(--text-bright);">{c_asset['price']}</div>
                        <div style="font-size:11px; font-weight:600; color:{c_chg_col};">{c_chg:+.2f}%</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    with col_dash2:
        forex_info = dash_data["commodities_forex"]
        f_color = "#089981" if forex_info["change_pct"] >= 0 else "#f23645"
        st.markdown(
            f"""
            <div class="tv-multi-card">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:16px;">🇺🇸🇮🇳</span>
                    <span style="font-size:13px; font-weight:700; color:var(--text-bright);">{forex_info['title']}</span>
                    <span style="font-size:9px; background:var(--badge-bg); color:var(--muted-color); padding:1px 4px; border-radius:3px;">{forex_info['code']}</span>
                </div>
                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:6px;">
                    <span style="font-size:18px; font-weight:800; color:var(--text-bright);">{forex_info['value_str']}</span>
                    <span style="font-size:12px; font-weight:700; color:{f_color};">+{forex_info['change_pct']:.2f}%</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        spk_forex = create_sparkline_area_chart(forex_info["dates"], forex_info["history"], change_pct=forex_info["change_pct"], color="#089981", theme=theme_mode, height=85)
        st.plotly_chart(spk_forex, use_container_width=True, config={"displayModeBar": False})

        st.markdown("<div style='margin-top:6px;'></div>", unsafe_allow_html=True)
        for cmd in forex_info["commodities"]:
            cmd_chg = cmd["change_pct"]
            cmd_color = "#089981" if cmd_chg > 0 else "#f23645" if cmd_chg < 0 else "var(--muted-color)"
            st.markdown(
                f"""
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--border-subtle);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:24px; height:24px; border-radius:50%; background:{cmd['icon_bg']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px;">{cmd['icon']}</div>
                        <div>
                            <div style="font-size:12px; font-weight:700; color:var(--text-bright);">{cmd['name']}</div>
                            <div style="font-size:10px; color:var(--muted-color);">{cmd['code']}</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px; font-weight:700; color:var(--text-bright);">{cmd['price']}</div>
                        <div style="font-size:11px; font-weight:600; color:{cmd_color};">{cmd_chg:+.2f}%</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    with col_dash3:
        rates_info = dash_data["rates_macro"]
        r_color = "#089981" if rates_info["change_pct"] >= 0 else "#f23645"
        st.markdown(
            f"""
            <div class="tv-multi-card">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:16px;">🇮🇳</span>
                    <span style="font-size:13px; font-weight:700; color:var(--text-bright);">{rates_info['title']}</span>
                    <span style="font-size:9px; background:var(--badge-bg); color:var(--muted-color); padding:1px 4px; border-radius:3px;">{rates_info['code']}</span>
                </div>
                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:6px;">
                    <span style="font-size:18px; font-weight:800; color:var(--text-bright);">{rates_info['value_str']}</span>
                    <span style="font-size:12px; font-weight:700; color:{r_color};">+{rates_info['change_pct']:.2f}%</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        spk_yield = create_sparkline_area_chart(rates_info["dates"], rates_info["history"], change_pct=rates_info["change_pct"], theme=theme_mode, height=85)
        st.plotly_chart(spk_yield, use_container_width=True, config={"displayModeBar": False})

        st.markdown(
            f"""
            <div style="margin-top:6px; margin-bottom:2px;">
                <span style="font-size:12px; font-weight:700; color:var(--text-bright);">{rates_info['inflation_title']}</span>
                <span style="font-size:9px; background:var(--badge-bg); color:var(--muted-color); padding:1px 4px; border-radius:3px;">{rates_info['inflation_code']}</span>
            </div>
            """,
            unsafe_allow_html=True,
        )
        inf_fig = create_macro_inflation_chart(rates_info["months"], rates_info["inflation_rates"], theme=theme_mode, height=115)
        st.plotly_chart(inf_fig, use_container_width=True, config={"displayModeBar": False})

        st.markdown(
            f"""
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--border-subtle); font-size:11px;">
                <span style="color:var(--muted-color);">RBI Repo: <b style="color:var(--text-bright);">6.50%</b></span>
                <span style="color:var(--muted-color);">GDP: <b style="color:#089981;">+7.20%</b></span>
                <span style="color:var(--muted-color);">US Fed: <b style="color:var(--text-bright);">5.25%-5.50%</b></span>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # --- SECTION 4: TOP STORIES 3-COLUMN WIRE (Screenshot 1) ---
    st.markdown(
        """
        <div style="margin-top:24px; margin-bottom:12px;">
            <span class="tv-section-header">Top stories ›</span>
        </div>
        """,
        unsafe_allow_html=True,
    )
    stories = get_top_stories_wire()
    col_s1, col_s2, col_s3 = st.columns(3)
    for idx, s in enumerate(stories):
        target_col = col_s1 if idx % 3 == 0 else col_s2 if idx % 3 == 1 else col_s3
        with target_col:
            st.markdown(
                f"""
                <a href="{s['link']}" target="_blank" style="text-decoration:none;">
                    <div class="tv-story-card">
                        <div>
                            <div class="tv-story-meta">
                                <span>{s['icon']}</span>
                                <span>{s['time']}</span>
                                <span>•</span>
                                <span style="font-weight:600;">{s['source']}</span>
                            </div>
                            <div class="tv-story-headline">{s['headline']}</div>
                        </div>
                    </div>
                </a>
                """,
                unsafe_allow_html=True,
            )

    # --- SECTION 5: FEATURED IPOS & COMMUNITY TRADE IDEAS (Screenshot 5) ---
    st.markdown(
        """
        <div style="margin-top:24px; margin-bottom:12px;">
            <span class="tv-section-header">Featured IPOs ›</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    ipos = get_featured_ipos()
    ipo_cols = st.columns(len(ipos))
    for idx, ipo in enumerate(ipos):
        with ipo_cols[idx]:
            st.markdown(
                f"""
                <div class="tv-ipo-card">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <div style="width:30px; height:30px; border-radius:50%; background:{ipo['icon_bg']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">
                            {ipo['monogram']}
                        </div>
                        <div>
                            <div style="font-size:12px; font-weight:700; color:var(--text-bright);">{ipo['ticker']}</div>
                            <div style="font-size:10px; color:var(--muted-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:110px;">{ipo['company']}</div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:8px;">
                        <div>
                            <div style="font-size:10px; color:var(--muted-color);">Exchange</div>
                            <div style="font-size:11px; font-weight:700; color:var(--text-bright);">{ipo['exchange']}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:10px; color:var(--muted-color);">Offer price</div>
                            <div style="font-size:11px; font-weight:700; color:var(--text-bright);">{ipo['offer_price']}</div>
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown(
        """
        <div style="margin-top:28px; margin-bottom:10px;">
            <span class="tv-section-header">Community ideas ›</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    idea_filter_col, _ = st.columns([3, 3])
    with idea_filter_col:
        idea_tab = st.radio(
            "Idea Filter",
            ["Editors' picks", "For you", "Following", "Popular"],
            horizontal=True,
            label_visibility="collapsed",
            key="trade_ideas_filter_radio",
        )

    trade_ideas = get_community_trade_ideas(idea_tab)
    idea_col1, idea_col2 = st.columns(2)

    for idx, idea in enumerate(trade_ideas):
        target_c = idea_col1 if idx % 2 == 0 else idea_col2
        with target_c:
            st.markdown(
                f"""
                <div class="tv-idea-card">
                    <div style="padding:14px 16px 6px 16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:11px; font-weight:700; background:var(--badge-bg); color:#2962ff; padding:2px 6px; border-radius:4px;">{idea['clean_symbol']}</span>
                                <span style="font-size:11px; color:var(--muted-color); font-weight:600;">{idea['timeframe']}</span>
                                <span style="font-size:11px; font-weight:700; color:{idea['sentiment_color']};">{idea['sentiment']}</span>
                            </div>
                            <span style="font-size:11px; color:var(--muted-color);">{idea['time']}</span>
                        </div>
                        <div style="font-size:14px; font-weight:700; color:var(--text-bright); margin-bottom:6px;">{idea['title']}</div>
                        <div style="font-size:12px; color:var(--muted-color); line-height:1.45; margin-bottom:8px;">{idea['summary']}</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            idea_fig = create_trade_idea_preview_chart(idea["symbol"], idea["title"], theme=theme_mode, height=210)
            st.plotly_chart(idea_fig, use_container_width=True, config={"displayModeBar": False})

            if st.button(f"Analyze {idea['clean_symbol']} in Deep Terminal ↗", key=f"open_idea_{idea['symbol']}_{idx}", use_container_width=True):
                st.session_state["selected_symbol"] = idea["symbol"]
                st.session_state["active_nav_tab"] = "📈 Interactive Chart"
                st.rerun()




# --- TAB 1: CHART ---
elif "Chart" in active_tab:
    current_sym = st.session_state.get("selected_symbol", "TCS.NS")
    overview = render_asset_summary_ribbon(current_sym)
    try:
        if chart_mode == "TradingView Real-Time":
            # Official TradingView Advanced Interactive Chart with full drawing tools, timeframes, and indicators
            tv_html = get_tradingview_widget_html(current_sym)
            components.html(tv_html, height=640)
        else:
            # Custom TradingView-Styled Plotly Chart with right-side scale
            tool_col1, tool_col2, tool_col3, tool_col4 = st.columns([1.8, 1.4, 4.0, 1.4])

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

            with tool_col4:
                if not hist_df.empty:
                    csv_bytes = hist_df.to_csv(index=False).encode("utf-8")
                    st.download_button(
                        label="📥 Export CSV",
                        data=csv_bytes,
                        file_name=f"{current_sym}_ohlcv_{timeframe}.csv",
                        mime="text/csv",
                        use_container_width=True,
                    )

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
elif "Technical Observations" in active_tab:
    current_sym = st.session_state.get("selected_symbol", "TCS.NS")
    overview = render_asset_summary_ribbon(current_sym)
    curr_sym_char = overview.get("currency_symbol", "$")

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
                                    <span style="font-weight:700; color:#f8fafc; font-size:13px;">{obs['indicator']} - {obs['type']}</span>
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
elif "Fundamentals" in active_tab:
    current_sym = st.session_state.get("selected_symbol", "TCS.NS")
    overview = render_asset_summary_ribbon(current_sym)
    curr_price = overview.get("current_price", 0.0)
    curr_sym_char = overview.get("currency_symbol", "$")

    st.markdown("#### Fundamental Valuation & Statements")

    try:
        # Analyst Consensus & Target Valuation Visualizer
        mean_target = overview.get("target_mean_price")
        high_target = overview.get("target_high_price") or mean_target
        low_target = overview.get("target_low_price") or (mean_target * 0.8 if mean_target else None)
        rec = overview.get("recommendation_key", "")
        analysts = overview.get("analyst_count")

        if mean_target and curr_price:
            upside_pct = ((mean_target - curr_price) / curr_price * 100)
            up_color = "#089981" if upside_pct >= 0 else "#f23645"
            up_sign = "+" if upside_pct >= 0 else ""
            rec_display = rec if rec else "CONSENSUS"
            rec_color = "#089981" if "BUY" in rec_display else ("#f23645" if "SELL" in rec_display else "#2962ff")
            count_str = f"Based on {analysts} analyst ratings" if analysts else "Wall Street / Dalal Street consensus"

            render_html(
                f"""
                <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:4px; padding:14px 16px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                        <div>
                            <span style="font-size:14px; font-weight:700; color:var(--text-bright);">Analyst Consensus & Target Valuation</span>
                            <div style="font-size:11px; color:var(--muted-color);">{count_str}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="background:rgba(41,98,255,0.15); color:{rec_color}; font-weight:800; font-size:11px; padding:3px 9px; border-radius:4px; border:1px solid {rec_color};">{rec_display}</span>
                            <span style="font-size:15px; font-weight:800; color:var(--text-bright);">Target: {curr_sym_char}{mean_target:,.2f}</span>
                            <span style="font-size:13px; font-weight:700; color:{up_color};">({up_sign}{upside_pct:.1f}% upside)</span>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted-color); margin-bottom:4px;">
                        <span>Target Low: {curr_sym_char}{low_target:,.2f}</span>
                        <span style="color:var(--text-bright); font-weight:600;">Current: {curr_sym_char}{curr_price:,.2f}</span>
                        <span>Target High: {curr_sym_char}{high_target:,.2f}</span>
                    </div>
                    <div style="background:var(--input-bg); height:6px; border-radius:3px; position:relative; overflow:hidden;">
                        <div style="background:linear-gradient(90deg, #2962ff, #089981); height:100%; width:100%; border-radius:3px;"></div>
                    </div>
                </div>
                """
            )
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
elif "Peer Comparison" in active_tab:
    current_sym = st.session_state.get("selected_symbol", "TCS.NS")
    overview = render_asset_summary_ribbon(current_sym)
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
elif "Market Screener" in active_tab:
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


# --- TAB 6: TOP STORIES & NEWS ---
elif "News" in active_tab or "Top Stories" in active_tab:
    current_sym = st.session_state.get("selected_symbol", "TCS.NS")
    st.markdown(
        """
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
                <span style="font-size:20px; font-weight:800; color:var(--text-bright);">Top stories ›</span>
                <div style="font-size:12px; color:var(--muted-color); margin-top:2px;">Real-time institutional newsfeed, earnings releases, and global market wire.</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # 3-Column Top Stories Wire matching TradingView Screenshot 1
    top_stories = get_top_stories_wire()
    wire_col1, wire_col2, wire_col3 = st.columns(3)
    cols = [wire_col1, wire_col2, wire_col3]

    for idx, story in enumerate(top_stories):
        target_c = cols[idx % 3]
        with target_c:
            st.markdown(
                f"""
                <div class="tv-story-card">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                        <span style="font-size:13px;">{story['icon']}</span>
                        <span style="font-size:11px; color:var(--muted-color); font-weight:600;">{story['time']}</span>
                        <span style="font-size:11px; color:var(--muted-color);">•</span>
                        <span style="font-size:11px; color:var(--muted-color); font-weight:600;">{story['publisher']}</span>
                    </div>
                    <a href="{story['link']}" target="_blank" style="text-decoration:none;">
                        <div style="font-size:13px; font-weight:700; color:var(--text-bright); line-height:1.4;">
                            {story['headline_bold']}
                        </div>
                    </a>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown("<div style='margin-top:24px;'></div>", unsafe_allow_html=True)
    st.markdown("##### Filtered Asset & Macro Search")

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
                        f"<div style='height:140px; width:100%; border-radius:4px; overflow:hidden; margin-bottom:10px; background:var(--input-bg);'>"
                        f"<img src='{t_thumb}' style='width:100%; height:100%; object-fit:cover;' />"
                        f"</div>"
                        if t_thumb
                        else ""
                    )
                    render_html(
                        f"""
                        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:4px; padding:14px 16px; margin-bottom:12px; min-height:160px; display:flex; flex-direction:column; justify-content:space-between; transition:border-color 0.15s ease;">
                            <div>
                                {thumb_img}
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <span style="font-size:11px; font-weight:700; color:#2962ff; text-transform:uppercase; letter-spacing:0.04em;">{item['publisher']}</span>
                                    <span style="font-size:11px; color:var(--muted-color); font-weight:500;">{item['time']}</span>
                                </div>
                                <div style="font-size:14px; font-weight:600; color:var(--text-bright); line-height:1.4; margin-bottom:8px;">{item['title']}</div>
                                {f"<div style='font-size:12px; color:var(--muted-color); line-height:1.5; margin-bottom:10px;'>{item['summary']}</div>" if item.get('summary') else ""}
                            </div>
                            <div style="padding-top:6px; border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end;">
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


# --- TAB 7: TRADE IDEAS & IPOS ---
elif "Trade Ideas" in active_tab or "IPO" in active_tab:
    st.markdown(
        """
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
                <span style="font-size:20px; font-weight:800; color:var(--text-bright);">Featured IPOs ›</span>
                <div style="font-size:12px; color:var(--muted-color); margin-top:2px;">Track prospective listings, offer price bands, and listing dates.</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    ipos = get_featured_ipos()
    ipo_cols = st.columns(len(ipos))
    for idx, ipo in enumerate(ipos):
        with ipo_cols[idx]:
            st.markdown(
                f"""
                <div class="tv-ipo-card">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:{ipo['icon_bg']}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; flex-shrink:0;">
                            {ipo['monogram']}
                        </div>
                        <div>
                            <div style="font-size:13px; font-weight:800; color:var(--text-bright);">{ipo['name']}</div>
                            <div style="font-size:11px; color:var(--muted-color);">{ipo['full_name']}</div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:14px; font-size:11px;">
                        <div>
                            <div style="color:var(--muted-color);">Exchange</div>
                            <div style="font-weight:700; color:var(--text-bright); margin-top:2px;">{ipo['exchange']}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:var(--muted-color);">Offer price</div>
                            <div style="font-weight:700; color:var(--text-bright); margin-top:2px;">{ipo['offer_price']}</div>
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown("<div style='margin-top:24px;'></div>", unsafe_allow_html=True)
    idea_head_col, idea_filter_col = st.columns([3, 3])
    with idea_head_col:
        st.markdown(
            """
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:20px; font-weight:800; color:var(--text-bright);">Community ideas ›</span>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with idea_filter_col:
        idea_tab = st.radio(
            "Idea Filter Dedicated",
            ["Editors' picks", "For you", "Following", "Popular"],
            horizontal=True,
            label_visibility="collapsed",
            key="trade_ideas_filter_radio_tab",
        )

    trade_ideas = get_community_trade_ideas(idea_tab)
    idea_col1, idea_col2 = st.columns(2)

    for idx, idea in enumerate(trade_ideas):
        target_c = idea_col1 if idx % 2 == 0 else idea_col2
        with target_c:
            st.markdown(
                f"""
                <div class="tv-idea-card">
                    <div style="padding:14px 16px 6px 16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:11px; font-weight:700; background:var(--badge-bg); color:#2962ff; padding:2px 6px; border-radius:4px;">{idea['clean_symbol']}</span>
                                <span style="font-size:11px; color:var(--muted-color); font-weight:600;">{idea['timeframe']}</span>
                                <span style="font-size:11px; font-weight:700; color:{idea['sentiment_color']};">{idea['sentiment']}</span>
                            </div>
                            <span style="font-size:11px; color:var(--muted-color);">{idea['time']}</span>
                        </div>
                        <div style="font-size:14px; font-weight:700; color:var(--text-bright); margin-bottom:6px;">{idea['title']}</div>
                        <div style="font-size:12px; color:var(--muted-color); line-height:1.45; margin-bottom:8px;">{idea['summary']}</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            idea_fig = create_trade_idea_preview_chart(idea["symbol"], idea["title"], theme=theme_mode, height=210)
            st.plotly_chart(idea_fig, use_container_width=True, config={"displayModeBar": False})

            if st.button(f"Analyze {idea['clean_symbol']} in Deep Terminal ↗", key=f"open_idea_tab_{idea['symbol']}_{idx}", use_container_width=True):
                st.session_state["selected_symbol"] = idea["symbol"]
                st.session_state["active_nav_tab"] = "📈 Interactive Chart"
                st.rerun()


# --- TAB 8: WATCHLIST ---
elif "Watchlist" in active_tab:
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
                    "52W Span": f"{c_char}{ov.get('low_52w', 0):,.1f} - {c_char}{ov.get('high_52w', 0):,.1f}",
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
