# 📈 Apex Financial Terminal

> **Analyze everything. Trade nothing.**  
> A high-performance, web-based market research terminal for Indian (NSE/BSE) and global equities.

Built with **Python**, **Streamlit**, **Plotly**, and **yfinance**. Free to deploy, zero account required, and completely ad-free.

---

## 🌟 Key Features

- **⚡ Instant Access & Zero Friction:** No login, no signup, and no subscription paywalls.
- **🔍 Intelligent Search & Coverage:** Instant lookup across 1,800+ NSE companies plus US global equities (AAPL, NVDA, TSLA, etc.).
- **📈 Interactive Financial Charts:**
  - Candlestick & Line views with volume overlay.
  - Moving Averages (EMA 20, 50, 200).
  - Bollinger Bands (20, 2.0).
  - RSI (14) with overbought/oversold bands.
  - MACD (12, 26, 9) with histogram.
- **🔬 Objective Technical Observations:** Automated non-advisory analysis of momentum, crossovers, and volatility envelopes.
- **🏢 Deep Fundamental Research:**
  - Valuation Multiples: Trailing & Forward P/E, P/B, EV/EBITDA, PEG, Dividend Yield.
  - Profitability & Returns: ROE, ROA, Operating Margin, Net Profit Margin.
  - Financial Health: Debt-to-Equity, Current Ratio, Quick Ratio, Free Cash Flow.
  - Full Financial Statements: Income Statement, Balance Sheet, and Cash Flow (Annual & Quarterly) with 4-year trend charts.
- **⚖️ Peer Comparison:** Side-by-side benchmarking of key valuation and return metrics against sector rivals.
- **🔍 Indian Benchmark Screener:** Filter major market leaders by sector and valuation multiples.
- **📰 Live Catalysts & News Feed:** Real-time headlines and source attribution without paywalled API keys.
- **⭐ Session Watchlist:** Track stocks with live prices without needing a backend database.

---

## 📂 Project Architecture

```text
Stock-Dashboard/
├── .streamlit/
│   └── config.toml          # Custom dark terminal theme
├── src/
│   ├── data_loader.py       # Caching pipeline for quotes, financials, and company profiles
│   ├── indicators.py        # Mathematical technical indicators (RSI, MACD, EMA, Bollinger)
│   ├── charts.py            # Dark-themed Plotly charts with multi-pane subplots
│   └── screener.py          # Benchmark stock screening module
├── app.py                   # Main terminal interface & KPI banner
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

## 🌐 Free Cloud Deployment (Streamlit Community Cloud)

Share this terminal with friends on mobile and desktop for **100% free**:

1. Go to [share.streamlit.io](https://share.streamlit.io) and log in with your GitHub account.
2. Click **"New app"**.
3. Select your repository: `SriJayavel/Stock-Dashboard`.
4. Main file path: `app.py`.
5. Click **"Deploy!"** — Your terminal will go live with a shareable URL (e.g., `https://stock-dashboard.streamlit.app`).

---

## ⚖️ Non-Negotiable Product Rule & Disclaimer

**LEGAL & REGULATORY DISCLAIMER:** This platform is designed strictly for financial research, education, and quantitative analysis. **Analyze everything. Trade nothing.** It does not execute orders, handle brokerage transactions, or provide individual investment recommendations. Always consult a SEBI / FINRA registered financial advisor before making actual capital allocation decisions.
