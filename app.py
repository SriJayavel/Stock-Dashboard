"""
Financial Market Analysis Terminal — Analyze everything. Trade nothing.
Built with Streamlit, Plotly, and yfinance.
"""

import streamlit as st
import pandas as pd
import numpy as np

from src.data_loader import (
    load_companies_catalog,
    resolve_symbol,
    get_company_overview,
    get_historical_ohlcv,
    get_financial_statements,
    get_stock_news,
    get_peer_comparison,
)
from src.indicators import apply_all_indicators, generate_technical_observations
from src.charts import create_terminal_chart, create_financials_trend_chart
from src.screener import get_popular_stocks_snapshot

# 1. Page Configuration
st.set_page_config(
    page_title="Apex Financial Terminal",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# 2. Modern Dark Terminal CSS
st.markdown(
    """
    <style>
    /* Global Background and Fonts */
    .stApp {
        background-color: #0b0e14;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    /* Sleek KPI Metric Cards */
    .kpi-container {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
    }
    .kpi-card {
        background: #141824;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 14px 18px;
        flex: 1 1 180px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    .kpi-label {
        font-size: 12px;
        font-weight: 500;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
    }
    .kpi-value {
        font-size: 20px;
        font-weight: 700;
        color: #f8fafc;
    }
    .kpi-sub {
        font-size: 12px;
        margin-top: 4px;
    }
    .positive-text {
        color: #10b981;
    }
    .negative-text {
        color: #ef4444;
    }
    
    /* Observation Cards */
    .obs-card {
        background: #131722;
        border-left: 4px solid #38bdf8;
        border-radius: 4px;
        padding: 12px 16px;
        margin-bottom: 10px;
    }
    
    /* Terminal Header Tag */
    .terminal-tag {
        background: #1e293b;
        color: #38bdf8;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
    }

    /* Disclaimer Footer */
    .disclaimer-box {
        margin-top: 50px;
        padding: 14px 20px;
        background: #10141d;
        border: 1px solid #1e293b;
        border-radius: 8px;
        text-align: center;
        font-size: 12px;
        color: #64748b;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# 3. Session State Initialization (No Account Needed)
if "selected_symbol" not in st.session_state:
    st.session_state["selected_symbol"] = "TCS.NS"
if "watchlist" not in st.session_state:
    st.session_state["watchlist"] = ["TCS.NS", "RELIANCE.NS", "HDFCBANK.NS", "INFY.NS"]


# 4. Top Header & Search Bar
col_logo, col_search = st.columns([1.2, 3])

with col_logo:
    st.markdown("### 📈 APEX <span style='color:#00e5ff;'>TERMINAL</span>", unsafe_allow_html=True)
    st.markdown("<span style='font-size:12px; color:#64748b;'>Analyze everything. Trade nothing.</span>", unsafe_allow_html=True)

catalog = load_companies_catalog()

with col_search:
    # Autocomplete company list + search input
    options = [""]
    if not catalog.empty and "DISPLAY" in catalog.columns:
        options = [""] + catalog["DISPLAY"].tolist()

    selected_from_dropdown = st.selectbox(
        "Search 1,800+ NSE Stocks or Enter Any Global Ticker",
        options=options,
        index=0,
        placeholder="Type company name or symbol (e.g., Reliance, TCS, NVDA)...",
        label_visibility="collapsed",
    )

    if selected_from_dropdown:
        sym_code = selected_from_dropdown.split(" — ")[0].strip()
        st.session_state["selected_symbol"] = f"{sym_code}.NS"


# Quick trending stock chips
st.markdown(
    "<div style='margin-bottom: 12px;'>"
    "<span style='font-size:12px; color:#64748b; margin-right:8px;'>Popular:</span>",
    unsafe_allow_html=True,
)
chip_cols = st.columns(8)
trending = [
    ("TCS", "TCS.NS"),
    ("Reliance", "RELIANCE.NS"),
    ("HDFC Bank", "HDFCBANK.NS"),
    ("Infosys", "INFY.NS"),
    ("Tata Motors", "TATAMOTORS.NS"),
    ("ICICI Bank", "ICICIBANK.NS"),
    ("Apple", "AAPL"),
    ("Nvidia", "NVDA"),
]

for i, (label, sym) in enumerate(trending):
    if chip_cols[i].button(label, key=f"chip_{sym}", use_container_width=True):
        st.session_state["selected_symbol"] = sym
        st.rerun()


# 5. Fetch Target Stock Data
current_sym = st.session_state["selected_symbol"]
with st.spinner(f"Loading live market data for {current_sym}..."):
    overview = get_company_overview(current_sym)

# Top Stock Banner
col_title, col_actions = st.columns([3, 1])

with col_title:
    curr_price = overview.get("current_price", 0.0)
    curr_sym_char = overview.get("currency_symbol", "₹")
    change = overview.get("change", 0.0)
    change_pct = overview.get("change_pct", 0.0)
    change_color = "#10b981" if change >= 0 else "#ef4444"
    sign = "+" if change >= 0 else ""

    st.markdown(
        f"""
        <div style="display:flex; align-items:baseline; gap:12px;">
            <h2 style="margin:0; font-weight:800; color:#f8fafc;">{overview.get('name')}</h2>
            <span class="terminal-tag">{overview.get('symbol')}</span>
            <span style="font-size:13px; color:#94a3b8;">{overview.get('sector')} • {overview.get('industry')}</span>
        </div>
        <div style="display:flex; align-items:baseline; gap:12px; margin-top:6px;">
            <span style="font-size:32px; font-weight:800; color:#ffffff;">{curr_sym_char}{curr_price:,.2f}</span>
            <span style="font-size:18px; font-weight:600; color:{change_color};">{sign}{change:,.2f} ({sign}{change_pct:.2f}%)</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

with col_actions:
    is_in_watchlist = current_sym in st.session_state["watchlist"]
    btn_label = "⭐ In Watchlist" if is_in_watchlist else "☆ Add to Watchlist"
    if st.button(btn_label, use_container_width=True):
        if is_in_watchlist:
            st.session_state["watchlist"].remove(current_sym)
        else:
            st.session_state["watchlist"].append(current_sym)
        st.rerun()

    st.caption("Auto-refreshed from live market data")


# KPI Summary Cards
st.markdown(
    f"""
    <div class="kpi-container">
        <div class="kpi-card">
            <div class="kpi-label">Market Cap</div>
            <div class="kpi-value">{overview.get('market_cap_str', 'N/A')}</div>
            <div class="kpi-sub" style="color:#94a3b8;">Enterprise Scale</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">P/E Ratio (TTM)</div>
            <div class="kpi-value">{f"{overview.get('pe_trailing'):.1f}" if overview.get('pe_trailing') else 'N/A'}</div>
            <div class="kpi-sub" style="color:#94a3b8;">Fwd: {f"{overview.get('pe_forward'):.1f}" if overview.get('pe_forward') else 'N/A'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Price to Book (P/B)</div>
            <div class="kpi-value">{f"{overview.get('pb_ratio'):.2f}" if overview.get('pb_ratio') else 'N/A'}</div>
            <div class="kpi-sub" style="color:#94a3b8;">Book Multiple</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">52-Week Range</div>
            <div class="kpi-value" style="font-size:15px; margin-top:4px;">
                {curr_sym_char}{overview.get('low_52w', 0):,.1f} — {curr_sym_char}{overview.get('high_52w', 0):,.1f}
            </div>
            <div class="kpi-sub" style="color:#94a3b8;">Annual Span</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">ROE / ROCE</div>
            <div class="kpi-value">{f"{overview.get('roe'):.1f}%" if overview.get('roe') else 'N/A'}</div>
            <div class="kpi-sub" style="color:#94a3b8;">Equity Return</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Debt-to-Equity</div>
            <div class="kpi-value">{f"{overview.get('debt_to_equity'):.2f}" if overview.get('debt_to_equity') else 'N/A'}</div>
            <div class="kpi-sub" style="color:#94a3b8;">Solvency Health</div>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)


# 6. Main Terminal Tabs
tab_chart, tab_tech, tab_funds, tab_peers, tab_screener, tab_news, tab_watchlist = st.tabs([
    "📈 Interactive Chart",
    "🔬 Technical Observations",
    "🏢 Fundamentals & Financials",
    "⚖️ Peer Comparison",
    "🔍 Screener",
    "📰 News & Catalysts",
    "⭐ Watchlist",
])


# --- TAB 1: INTERACTIVE CHART ---
with tab_chart:
    ctrl_col1, ctrl_col2, ctrl_col3, ctrl_col4 = st.columns([2, 1.5, 3.5, 2])

    with ctrl_col1:
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
        )

    with ctrl_col2:
        chart_type = st.radio("Style", ["Candlestick", "Line"], horizontal=True)

    with ctrl_col3:
        st.write("Overlays & Subplots")
        check_col1, check_col2, check_col3, check_col4 = st.columns(4)
        show_ema = check_col1.checkbox("EMA 20/50/200", value=True)
        show_bb = check_col2.checkbox("Bollinger", value=False)
        show_rsi = check_col3.checkbox("RSI (14)", value=False)
        show_macd = check_col4.checkbox("MACD", value=False)

    with ctrl_col4:
        st.write("Controls")
        show_vol = st.checkbox("Volume Panel", value=True)

    # Fetch and process historical data
    hist_df = get_historical_ohlcv(current_sym, period=timeframe, interval="1d")

    if not hist_df.empty:
        # Apply technical indicator calculations
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
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": True, "scrollZoom": True})
    else:
        st.info("No historical data returned for this ticker. Try another timeframe or symbol.")


# --- TAB 2: TECHNICAL OBSERVATIONS ---
with tab_tech:
    st.markdown("### 🔬 Objective Technical Observations")
    st.caption("Automated technical analysis following strict non-advisory principles. Observations highlight price behavior, momentum, and statistical indicators.")

    if not hist_df.empty and len(hist_df) >= 20:
        observations = generate_technical_observations(hist_df)

        if observations:
            obs_col1, obs_col2 = st.columns(2)
            for i, obs in enumerate(observations):
                target_col = obs_col1 if i % 2 == 0 else obs_col2
                with target_col:
                    st.markdown(
                        f"""
                        <div class="obs-card" style="border-left-color: {obs['color']};">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-weight:700; color:#f8fafc; font-size:14px;">{obs['indicator']} — {obs['type']}</span>
                                <span style="font-size:12px; font-weight:600; color:{obs['color']};">{obs['status']}</span>
                            </div>
                            <div style="font-size:13px; color:#cbd5e1; margin-top:6px;">{obs['detail']}</div>
                            <div style="font-size:11px; color:#64748b; margin-top:4px;">Indicator Reference: {obs['value']}</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
        else:
            st.info("Not enough data points to compute complete technical indicators.")

        # Key Technical Levels Table
        st.markdown("#### 📏 Key Moving Average Levels")
        latest = hist_df.iloc[-1]
        levels = [
            {"Level": "Current Close", "Value": f"{curr_sym_char}{latest['Close']:,.2f}", "Distance": "0.0%"},
            {"Level": "EMA 20 (Short-term)", "Value": f"{curr_sym_char}{latest.get('EMA_20', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('EMA_20', latest['Close'])) / latest.get('EMA_20', 1) * 100):+.2f}%"},
            {"Level": "EMA 50 (Medium-term)", "Value": f"{curr_sym_char}{latest.get('EMA_50', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('EMA_50', latest['Close'])) / latest.get('EMA_50', 1) * 100):+.2f}%"},
            {"Level": "EMA 200 (Long-term Institutional)", "Value": f"{curr_sym_char}{latest.get('EMA_200', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('EMA_200', latest['Close'])) / latest.get('EMA_200', 1) * 100):+.2f}%"},
            {"Level": "Bollinger Upper (20,2)", "Value": f"{curr_sym_char}{latest.get('BB_Upper', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('BB_Upper', latest['Close'])) / latest.get('BB_Upper', 1) * 100):+.2f}%"},
            {"Level": "Bollinger Lower (20,2)", "Value": f"{curr_sym_char}{latest.get('BB_Lower', 0):,.2f}", "Distance": f"{((latest['Close'] - latest.get('BB_Lower', latest['Close'])) / latest.get('BB_Lower', 1) * 100):+.2f}%"},
        ]
        st.dataframe(pd.DataFrame(levels), use_container_width=True, hide_index=True)
    else:
        st.warning("Insufficient data to generate technical observations.")


# --- TAB 3: FUNDAMENTALS & FINANCIAL STATEMENTS ---
with tab_funds:
    st.markdown("### 🏢 Fundamental Analysis & Financial Statements")

    f_col1, f_col2, f_col3 = st.columns(3)

    with f_col1:
        st.markdown("#### 📊 Valuation Multiples")
        st.write(f"**Trailing P/E:** {overview.get('pe_trailing', 'N/A')}")
        st.write(f"**Forward P/E:** {overview.get('pe_forward', 'N/A')}")
        st.write(f"**Price to Book (P/B):** {overview.get('pb_ratio', 'N/A')}")
        st.write(f"**EV / EBITDA:** {overview.get('ev_ebitda', 'N/A')}")
        st.write(f"**PEG Ratio:** {overview.get('peg_ratio', 'N/A')}")
        st.write(f"**Dividend Yield:** {overview.get('dividend_yield', 0):.2f}%" if overview.get('dividend_yield') else "**Dividend Yield:** N/A")

    with f_col2:
        st.markdown("#### 📈 Profitability & Returns")
        st.write(f"**Return on Equity (ROE):** {overview.get('roe', 0):.2f}%" if overview.get('roe') else "**ROE:** N/A")
        st.write(f"**Return on Assets (ROA):** {overview.get('roa', 0):.2f}%" if overview.get('roa') else "**ROA:** N/A")
        st.write(f"**Operating Margin:** {overview.get('operating_margin', 0):.2f}%" if overview.get('operating_margin') else "**Operating Margin:** N/A")
        st.write(f"**Net Profit Margin:** {overview.get('profit_margin', 0):.2f}%" if overview.get('profit_margin') else "**Profit Margin:** N/A")

    with f_col3:
        st.markdown("#### 🛡️ Solvency & Health")
        st.write(f"**Debt to Equity:** {overview.get('debt_to_equity', 'N/A')}")
        st.write(f"**Current Ratio:** {overview.get('current_ratio', 'N/A')}")
        st.write(f"**Quick Ratio:** {overview.get('quick_ratio', 'N/A')}")
        if overview.get("free_cash_flow"):
            fcf = overview["free_cash_flow"]
            fcf_str = f"₹{fcf/1e7:,.1f} Cr" if overview["currency"] == "INR" else f"${fcf/1e6:,.1f}M"
            st.write(f"**Free Cash Flow (TTM):** {fcf_str}")

    st.markdown("---")

    # Financial Statements Section
    st.markdown("#### 📑 Financial Statements")
    statements = get_financial_statements(current_sym)

    freq_toggle = st.radio("Statement Frequency", ["Annual", "Quarterly"], horizontal=True)
    is_qtr = freq_toggle == "Quarterly"

    stmt_tab1, stmt_tab2, stmt_tab3, stmt_tab4 = st.tabs([
        "Revenue & Income Trend",
        "Income Statement",
        "Balance Sheet",
        "Cash Flow Statement",
    ])

    with stmt_tab1:
        st.caption("Multi-year trend of Total Revenue vs. Net Income")
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

    # Business Overview Description
    st.markdown("---")
    st.markdown("#### 🏢 About the Company")
    st.write(overview.get("summary", "No description available."))
    if overview.get("website"):
        st.markdown(f"**Official Website:** [{overview['website']}]({overview['website']})")


# --- TAB 4: PEER COMPARISON ---
with tab_peers:
    st.markdown("### ⚖️ Peer Group Comparison")
    st.caption(f"Comparing {overview.get('name', current_sym)} with sector competitors.")

    peer_df = get_peer_comparison(current_sym)
    if not peer_df.empty:
        st.dataframe(peer_df, use_container_width=True, hide_index=True)
    else:
        st.info("No peer metrics available.")


# --- TAB 5: SCREENER ---
with tab_screener:
    st.markdown("### 🔍 Indian Benchmark Screener")
    st.caption("Quick screening across major benchmark leaders by Sector, Valuation, and Returns.")

    benchmark_df = get_popular_stocks_snapshot()

    if not benchmark_df.empty:
        s_col1, s_col2 = st.columns(2)
        with s_col1:
            all_sectors = ["All Sectors"] + sorted(list(set(benchmark_df["Sector"].dropna())))
            selected_sector = st.selectbox("Filter by Sector", all_sectors)
        with s_col2:
            max_pe = st.slider("Max P/E Ratio Filter", min_value=10.0, max_value=120.0, value=100.0, step=5.0)

        filtered = benchmark_df.copy()
        if selected_sector != "All Sectors":
            filtered = filtered[filtered["Sector"] == selected_sector]

        # Filter by P/E if present
        filtered = filtered[(filtered["P/E"].isna()) | (filtered["P/E"] <= max_pe)]

        st.dataframe(filtered, use_container_width=True, hide_index=True)
    else:
        st.info("Loading screener dataset...")


# --- TAB 6: NEWS & CATALYSTS ---
with tab_news:
    st.markdown("### 📰 Market News & Catalyst Feed")
    st.caption("Real-time headline monitoring. No paywalled or restricted APIs.")

    articles = get_stock_news(current_sym)

    if articles:
        for item in articles:
            st.markdown(
                f"""
                <div style="background:#141824; border:1px solid #1e293b; border-radius:8px; padding:14px 18px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="font-size:12px; font-weight:600; color:#38bdf8;">{item['publisher']}</span>
                        <span style="font-size:12px; color:#64748b;">{item['time']}</span>
                    </div>
                    <div style="font-size:15px; font-weight:600; color:#f8fafc; margin-bottom:6px;">{item['title']}</div>
                    <a href="{item['link']}" target="_blank" style="color:#00e5ff; text-decoration:none; font-size:13px; font-weight:500;">Read Full Coverage ↗</a>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        st.info("No recent news articles found for this ticker.")


# --- TAB 7: WATCHLIST ---
with tab_watchlist:
    st.markdown("### ⭐ My Watchlist")
    st.caption("Locally saved session tracking. Zero login or account registration required.")

    if st.session_state["watchlist"]:
        wl_data = []
        for sym in st.session_state["watchlist"]:
            ov = get_company_overview(sym)
            wl_data.append({
                "Symbol": sym,
                "Company": ov.get("name", sym),
                "Price": f"{ov.get('currency_symbol', '₹')}{ov.get('current_price', 0):,.2f}",
                "Change %": f"{ov.get('change_pct', 0):+.2f}%",
                "Market Cap": ov.get("market_cap_str", "N/A"),
                "P/E": f"{ov.get('pe_trailing'):.1f}" if ov.get("pe_trailing") else "N/A",
                "52W High": f"{ov.get('currency_symbol', '₹')}{ov.get('low_52w', 0):,.1f} - {ov.get('high_52w', 0):,.1f}",
            })

        wl_df = pd.DataFrame(wl_data)
        st.dataframe(wl_df, use_container_width=True, hide_index=True)

        remove_col1, remove_col2 = st.columns([3, 1])
        with remove_col1:
            sym_to_remove = st.selectbox("Select symbol to remove", st.session_state["watchlist"])
        with remove_col2:
            st.write("&nbsp;")
            if st.button("Remove from Watchlist"):
                st.session_state["watchlist"].remove(sym_to_remove)
                st.rerun()
    else:
        st.info("Your watchlist is currently empty. Use the '☆ Add to Watchlist' button on any stock to track it.")


# 7. Non-Negotiable Product Rule: Analysis Only Disclaimer
st.markdown(
    """
    <div class="disclaimer-box">
        <strong>LEGAL & REGULATORY DISCLAIMER:</strong> This platform is designed strictly for financial research, education, and quantitative analysis.
        <strong>Analyze everything. Trade nothing.</strong> It does not execute orders, handle brokerage transactions, or provide individual investment recommendations.
        Always consult a SEBI / FINRA registered financial advisor before making actual capital allocation decisions.
    </div>
    """,
    unsafe_allow_html=True,
)
