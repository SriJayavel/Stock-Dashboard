---
name: stock-terminal-core
description: Domain knowledge, technical indicator calculations (RSI, MACD, Bollinger Bands, Moving Averages), fundamental valuation metrics (P/E, P/B, ROE, Debt/Equity), resilient yfinance pipeline, and modern Streamlit architecture for building a production-ready stock research terminal.
---

# Stock Terminal Core Skill

This skill defines the technical standards, calculation formulas, data pipeline, and UI principles for building the **Stock Research Terminal**.

## 1. Technical Indicators & Mathematical Formulas

- **Moving Averages**:
  - `SMA(n)`: Simple Average of Close over `n` periods.
  - `EMA(n)`: Exponential Moving Average: $EMA_t = \text{Close}_t \times \alpha + EMA_{t-1} \times (1 - \alpha)$, where $\alpha = \frac{2}{n + 1}$.
  - Golden Cross (EMA 50 > EMA 200) & Death Cross (EMA 50 < EMA 200).
- **Relative Strength Index (RSI - 14 periods)**:
  - $RS = \frac{\text{Average Gain}}{\text{Average Loss}}$
  - $RSI = 100 - \left(\frac{100}{1 + RS}\right)$
  - Overbought (> 70), Oversold (< 30).
- **Moving Average Convergence Divergence (MACD)**:
  - MACD Line = 12-period EMA - 26-period EMA.
  - Signal Line = 9-period EMA of MACD Line.
  - Histogram = MACD Line - Signal Line.
- **Bollinger Bands (20 periods, 2 std dev)**:
  - Upper Band = SMA(20) + 2 * Standard Deviation.
  - Lower Band = SMA(20) - 2 * Standard Deviation.
  - Squeeze & Breakout detection.

## 2. Fundamental Metrics & Valuation Ratios

- **Valuation**:
  - Trailing & Forward P/E (Price to Earnings)
  - P/B (Price to Book)
  - EV / EBITDA (Enterprise Value to EBITDA)
  - PEG Ratio (P/E to Growth)
- **Financial Health & Profitability**:
  - Return on Equity (ROE) & Return on Assets (ROA)
  - Debt to Equity (D/E) (< 1.0 is healthy for non-financials)
  - Current Ratio (> 1.5)
  - Free Cash Flow (FCF) yield & Operating Margin (%)
  - Dividend Yield & Payout Ratio

## 3. Data Pipeline & Robustness (`yfinance`)

- **NSE / BSE Ticker Normalization**:
  - For Indian stocks: Append `.NS` (NSE) or `.BO` (BSE).
  - Provide fallback if `.NS` data is delayed or empty.
- **Caching (`@st.cache_data`)**:
  - Cache historical quotes with `ttl=3600` (1 hour) or `ttl=300` (5 minutes for intraday/daily).
  - Cache company metadata/overview with `ttl=86400` (24 hours).
- **Graceful Error Handling**:
  - Never crash on missing financial keys (e.g. some companies lack debt/EBITDA). Always use `.get()` with N/A fallbacks.

## 4. Modern Streamlit UI Design Rules

- **Theme**: Dark modern terminal aesthetic (sleek typography, custom CSS metric cards, high contrast, clean Plotly graphs with `plotly_dark`).
- **Layout**:
  - Collapsible or sleek sidebar for search and settings.
  - KPI metric cards (Current Price, Change %, Market Cap, P/E, 52-Week Range).
  - Tabbed or multi-section views:
    - 📈 Technical Chart (Candlestick + Volume + Indicators)
    - 🏢 Company Fundamentals & Financial Statements
    - ⚖️ Peer Comparison (Sector benchmark)
    - 📰 News & Sentiment Feed
