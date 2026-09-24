# 📈 Apex Financial Terminal

> **Institutional market research. Zero trade execution.**  
> A high-performance, web-based market research terminal for Global & Indian equities, cryptocurrencies, and commodities.

[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://stock-dashboard-kgdogayx7utzmpad9fpwhx.streamlit.app/)

Built with **Python**, **Streamlit**, **Plotly**, and **yfinance**. Free to deploy, zero account required, and completely ad-free.

---

## 🌐 Live Terminal

Access the live cloud terminal instantly in your browser:  
🔗 **[https://stock-dashboard-kgdogayx7utzmpad9fpwhx.streamlit.app/](https://stock-dashboard-kgdogayx7utzmpad9fpwhx.streamlit.app/)**

---

## 🌟 Key Features

- **⚡ Instant Access & Zero Friction:** No login, no signup, no API keys, and no subscription paywalls.
- **🚆 Continuous Live Ticker Train Marquee:** Hardware-accelerated 60fps ticker tape displaying major global indices, crypto, and commodities with edge gradient masks and hover-to-pause inspection.
- **🔍 2,400+ Asset Universal Search:** Instant suggested dropdown menu across Indian equities (NSE/BSE), US mega-caps, AI & semiconductor giants, precious metals, crude oil, and cryptocurrencies.
- **📈 Dual-Engine Interactive Charting:**
  - **TradingView Real-Time Embed:** Official TradingView engine with complete multi-timeframe controls, drawing tools, and advanced indicators.
  - **Terminal Quantitative Engine:** Custom Plotly dark theme chart with right-side price scale, EMA 20/50/200, Bollinger Bands (20, 2.0), RSI (14), MACD (12, 26, 9), and volume overlays.
- **⚡ Contextual Flash Intelligence:** Top 3 breaking news stories displayed directly beneath the active chart with media thumbnails, relative timestamps, and summaries so you never lose context of price action catalysts.
- **📰 Institutional Terminal Newsroom (Tab 6):**
  - **Source Toggle:** Seamlessly switch between *Active Asset Headlines* and *Global Macro Wire*.
  - **Live Keyword Filter:** Instant search across articles by keyword (e.g., *AI*, *earnings*, *dividend*, *Fed*, *revenue*).
  - **Rich 2-Column Cards:** HD thumbnails, publisher tags (`Bloomberg`, `Reuters`, `Yahoo Finance`, `CNBC`), relative times (`25m ago`, `3h ago`), and direct external links.
- **🏢 Deep Fundamental Research:**
  - **Valuation Multiples:** Trailing & Forward P/E, P/B, EV/EBITDA, PEG, and Dividend Yield.
  - **Profitability & Returns:** ROE, ROA, Operating Margin, Net Profit Margin.
  - **Balance Sheet Health:** Debt-to-Equity, Current Ratio, Quick Ratio, and Free Cash Flow.
  - **Financial Statements:** Complete Income Statement, Balance Sheet, and Cash Flows (Annual & Quarterly) with 4-year trend charts.
- **⚖️ Peer Comparison:** Side-by-side benchmarking of key valuation and return metrics against sector rivals worldwide.
- **🌐 Multi-Market Universe Screener:** Instant snapshot scanner for US Mega-Caps, Indian Leaders, Semiconductors, Crypto, and Commodities.
- **⭐ Session Watchlist:** Track favorite symbols with live prices, percentage changes, and 52-week spans directly in session state.

---

## 📂 Project Architecture

```text
Stock-Dashboard/
├── .streamlit/
│   └── config.toml          # Custom dark terminal theme configuration
├── src/
│   ├── data_loader.py       # Resilient yfinance pipeline, catalog caching, news parser & fallbacks
│   ├── indicators.py        # Mathematical indicators (RSI, MACD, EMA, Bollinger Bands)
│   ├── charts.py            # TradingView embed & right-side scale Plotly charts
│   └── screener.py          # Fast multi-threaded batch market screener
├── app.py                   # Main terminal interface, marquee ribbon & tabs
├── companies.csv            # 1,800+ NSE companies catalog
├── requirements.txt         # Production dependencies
└── README.md
```

---

## 🚀 Local Installation & Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SriJayavel/Stock-Dashboard.git
   cd Stock-Dashboard
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the terminal:**
   ```bash
   streamlit run app.py
   ```

---

## ⚖️ Non-Negotiable Product Rule & Disclaimer

**LEGAL & REGULATORY DISCLAIMER:** This platform is designed strictly for financial research, education, and quantitative analysis. **Analyze everything. Trade nothing.** It does not execute orders, handle brokerage transactions, or provide individual investment recommendations. Always consult a SEBI / FINRA registered financial advisor before making actual capital allocation decisions.
