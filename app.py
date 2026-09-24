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
    get_peer_comparison,
)
from src.indicators import apply_all_indicators, generate_technical_observations
from src.charts import create_terminal_chart, create_financials_trend_chart
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


# 2. Sleek Pro Terminal CSS
render_html(
    """
    <style>
    /* Global Background and Typography */
    .stApp {
        background-color: #090d16;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, -apple-system, sans-serif;
    }

    /* Top Ticker Tape (TradingView Style) */
    .ticker-tape-container {
        display: flex;
        overflow-x: auto;
        gap: 10px;
        padding: 6px 0;
        margin-bottom: 16px;
        border-bottom: 1px solid #161f30;
        white-space: nowrap;
        min-height: 40px;
        contain: layout style;
    }
    .ticker-pill {
        background: #111726;
        border: 1px solid #1c273c;
        border-radius: 4px;
        padding: 4px 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        height: 26px;
        box-sizing: border-box;
    }
    .ticker-name {
        font-weight: 700;
        color: #f1f5f9;
        letter-spacing: 0.02em;
    }
    .ticker-val {
        color: #94a3b8;
    }

    /* KPI Summary Cards */
    .kpi-container {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
        min-height: 88px;
        contain: layout;
    }
    .kpi-card {
        background: #101624;
        border: 1px solid #1b2538;
        border-radius: 6px;
        padding: 12px 16px;
        flex: 1 1 170px;
        min-height: 80px;
        box-sizing: border-box;
    }
    .kpi-label {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
    }
    .kpi-value {
        font-size: 19px;
        font-weight: 700;
        color: #f8fafc;
    }
    .kpi-sub {
        font-size: 11px;
        margin-top: 3px;
        color: #64748b;
    }

    /* Header Badges */
    .terminal-badge {
        background: #162032;
        color: #38bdf8;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
    }

    /* Observation Cards */
    .obs-card {
        background: #101624;
        border-left: 3px solid #38bdf8;
        border-radius: 4px;
        padding: 10px 14px;
        margin-bottom: 8px;
    }

    /* Pro Segmented Control Tabs (Completely Hide Ugly Radio Circles) */
    div[data-testid="stRadio"] div[role="radiogroup"] > label > div:first-child {
        display: none !important;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        background: transparent;
        border-bottom: 1px solid #1c273c;
        padding-bottom: 8px;
        margin-bottom: 16px;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] > label {
        background: #111726;
        border: 1px solid #1c273c;
        border-radius: 4px;
        padding: 6px 14px;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s ease;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] > label:hover {
        color: #f8fafc;
        border-color: #38bdf8;
        background: #162032;
    }
    div[data-testid="stRadio"] div[role="radiogroup"] > label:has(input:checked) {
        background: #1e293b !important;
        border-color: #00e5ff !important;
        color: #00e5ff !important;
    }

    /* Plotly Chart Container */
    .stPlotlyChart {
        min-height: 500px;
        contain: layout;
    }

    /* Minimalist Footer */
    .terminal-footer {
        margin-top: 40px;
        padding: 12px 18px;
        border-top: 1px solid #161f30;
        text-align: center;
        font-size: 11px;
        color: #475569;
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
        color = "#00c076" if chg >= 0 else "#ff3b5c"
        sign = "+" if chg >= 0 else ""
        tape_items.append(
            f"<div class='ticker-pill'>"
            f"<span class='ticker-name'>{item['name']}</span>"
            f"<span class='ticker-val'>{item['price']:,.2f}</span>"
            f"<span style='color:{color}; font-weight:600;'>{sign}{chg:.2f}%</span>"
            f"</div>"
        )
    render_html(f"<div class='ticker-tape-container'>{''.join(tape_items)}</div>")


# 5. Clean Unified Search Header
col_brand, col_search_box = st.columns([1, 2.5])

with col_brand:
    st.markdown(
        """
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px; font-weight:800; letter-spacing:0.04em; color:#f8fafc;">APEX <span style="color:#00e5ff;">TERMINAL</span></span>
        </div>
        <div style="font-size:11px; color:#64748b; margin-top:2px;">Institutional market research. Zero trade execution.</div>
        """,
        unsafe_allow_html=True,
    )

with col_search_box:
    query = st.text_input(
        "Search",
        placeholder="Search any stock, index, crypto, or commodity (e.g. TCS, Reliance, Nvidia, Apple, Bitcoin, Gold)...",
        label_visibility="collapsed",
    )

# Quick Results Suggestions (Clickable Pills)
if query and len(query.strip()) >= 1:
    matches = search_global_assets(query)
    if matches:
        st.markdown("<div style='font-size:11px; color:#64748b; margin-top:4px;'>Matches:</div>", unsafe_allow_html=True)
        res_cols = st.columns(min(len(matches), 5))
        for idx, m in enumerate(matches[:5]):
            btn_text = f"{m['symbol']} ({m['name'][:18]})"
            if res_cols[idx].button(btn_text, key=f"match_{m['symbol']}_{idx}", use_container_width=True):
                st.session_state["selected_symbol"] = m["symbol"]
                st.rerun()


# Quick Trending Assets Row (Clean Minimalist Chips)
st.markdown("<div style='margin-top:10px;'></div>", unsafe_allow_html=True)
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

chip_cols = st.columns(len(trending_chips))
for i, (label, sym) in enumerate(trending_chips):
    if chip_cols[i].button(label, key=f"chip_{sym}", use_container_width=True):
        st.session_state["selected_symbol"] = sym
        st.rerun()


# 6. Fetch Target Asset Data
current_sym = st.session_state["selected_symbol"]
with st.spinner(f"Fetching {current_sym}..."):
    overview = get_company_overview(current_sym)

# Asset Title & Price Header
col_header, col_actions = st.columns([3, 1])

with col_header:
    curr_price = overview.get("current_price", 0.0)
    curr_sym_char = overview.get("currency_symbol", "$")
    change = overview.get("change", 0.0)
    change_pct = overview.get("change_pct", 0.0)
    change_color = "#00c076" if change >= 0 else "#ff3b5c"
    sign = "+" if change >= 0 else ""

    render_html(
        f"""
        <div style="display:flex; align-items:baseline; gap:10px; margin-top:10px;">
            <h2 style="margin:0; font-size:24px; font-weight:800; color:#f8fafc;">{overview.get('name')}</h2>
            <span class="terminal-badge">{overview.get('symbol')}</span>
            <span style="font-size:12px; color:#64748b;">{overview.get('sector')} • {overview.get('industry')}</span>
        </div>
        <div style="display:flex; align-items:baseline; gap:12px; margin-top:4px;">
            <span style="font-size:30px; font-weight:800; color:#ffffff;">{curr_sym_char}{curr_price:,.2f}</span>
            <span style="font-size:16px; font-weight:600; color:{change_color};">{sign}{change:,.2f} ({sign}{change_pct:.2f}%)</span>
        </div>
        """
    )

with col_actions:
    is_in_watchlist = current_sym in st.session_state["watchlist"]
    btn_label = "In Watchlist" if is_in_watchlist else "+ Add to Watchlist"
    if st.button(btn_label, use_container_width=True):
        if is_in_watchlist:
            st.session_state["watchlist"].remove(current_sym)
        else:
            st.session_state["watchlist"].append(current_sym)
        st.rerun()


# Context-Aware KPI Summary Cards (No misleading N/A walls for Crypto / Commodities)
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
                <div class="kpi-sub">Book Value Multiple</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">52-Week Range</div>
                <div class="kpi-value" style="font-size:14px; margin-top:3px;">
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
                <div class="kpi-value" style="font-size:16px;">{q_type.title()}</div>
                <div class="kpi-sub">{overview.get('industry', 'Global Asset')}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Market Scale</div>
                <div class="kpi-value">{overview.get('market_cap_str', '—')}</div>
                <div class="kpi-sub">Aggregate Value</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">52-Week Range</div>
                <div class="kpi-value" style="font-size:14px; margin-top:3px;">
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
                <div class="kpi-value" style="font-size:15px; margin-top:3px;">{vol_str}</div>
                <div class="kpi-sub">Market Activity</div>
            </div>
        </div>
        """
    )


# 7. Native Segmented Pill Navigation (No Radio Circles!)
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


# --- TAB 1: CHART ---
if active_tab == "Chart":
    # Sleek Horizontal Controls Toolbar
    tool_col1, tool_col2, tool_col3 = st.columns([2.5, 1.5, 4])

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


# --- TAB 2: TECHNICAL OBSERVATIONS ---
elif active_tab == "Technical Observations":
    st.markdown("#### Objective Technical Observations")
    st.caption("Quantitative observations on momentum, moving averages, and volatility. Strictly non-advisory.")

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


# --- TAB 3: FUNDAMENTALS & STATEMENTS ---
elif active_tab == "Fundamentals & Statements":
    st.markdown("#### Fundamental Valuation & Statements")

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
            fcf_str = f"₹{fcf/1e7:,.1f} Cr" if overview["currency"] == "INR" else f"${fcf/1e6:,.1f}M"
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


# --- TAB 4: PEER COMPARISON ---
elif active_tab == "Peer Comparison":
    st.markdown("#### Peer Benchmarking")
    st.caption(f"Comparing {overview.get('name', current_sym)} against industry rivals.")

    peer_df = get_peer_comparison(current_sym)
    if not peer_df.empty:
        st.dataframe(peer_df, use_container_width=True, hide_index=True)
    else:
        st.info("No peer metrics available.")


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

    universe_df = get_market_universe_snapshot(category)
    if not universe_df.empty:
        st.dataframe(universe_df, use_container_width=True, hide_index=True)
    else:
        st.info("Fetching market universe...")


# --- TAB 6: NEWS FEED ---
elif active_tab == "News Feed":
    st.markdown(f"#### Market Headlines for {current_sym}")

    articles = get_stock_news(current_sym)
    if articles:
        for item in articles:
            render_html(
                f"""
                <div style="background:#101624; border:1px solid #1b2538; border-radius:6px; padding:12px 16px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                        <span style="font-size:11px; font-weight:600; color:#38bdf8;">{item['publisher']}</span>
                        <span style="font-size:11px; color:#64748b;">{item['time']}</span>
                    </div>
                    <div style="font-size:14px; font-weight:600; color:#f8fafc; margin-bottom:4px;">{item['title']}</div>
                    <a href="{item['link']}" target="_blank" style="color:#00e5ff; text-decoration:none; font-size:12px; font-weight:500;">Read Article ↗</a>
                </div>
                """
            )
    else:
        st.info(f"No recent articles found for '{current_sym}'.")


# --- TAB 7: WATCHLIST ---
elif active_tab == "Watchlist":
    st.markdown("#### My Watchlist")
    st.caption("Saved in your session. Zero account required.")

    if st.session_state["watchlist"]:
        wl_data = []
        for sym in st.session_state["watchlist"]:
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
