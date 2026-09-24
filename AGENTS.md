# Project Rules: Stock Research Terminal

## Architecture Principles
1. **Separation of Concerns**:
   - `src/data_loader.py`: Ticker normalization, historical price fetching, company fundamentals, caching via `@st.cache_data`.
   - `src/indicators.py`: Pure mathematical calculations for technical indicators (RSI, MACD, Bollinger Bands, Moving Averages).
   - `src/charts.py`: High-performance Plotly interactive charts with a sleek dark theme (`plotly_dark`).
   - `app.py`: Streamlit frontend layout, reactive state, KPI metric cards, tabs, and user controls.
2. **Error Resilience**:
   - Financial APIs frequently have missing fields or network timeouts. Always use `.get()` with safe defaults and display user-friendly warnings rather than raw tracebacks.
3. **Streamlit Deployment Ready**:
   - Dependencies must strictly match `requirements.txt`.
   - Never write to local disk paths that fail on cloud containers; use session state and memory buffers.
