# MARA project rules

## Architecture Principles
1. **Separation of Concerns**:
   - `backend/core/services/`: Symbol resolution, chart data formatting, and pure technical indicator calculations.
   - `backend/adapters/cache/`: Hybrid two-tier caching (L1 TTLCache + L2 Upstash Redis). Check L1 first to preserve Redis command limits.
   - `backend/adapters/market_data/`: Session-aware NSE and yfinance providers and their fallback routing.
   - `backend/features/`: Stock, research, screener, market, and cache refresh services. Keep API routing and dependency wiring in `backend/api/`.
   - `backend/main.py`: FastAPI endpoints and protected internal cache refresh worker (`POST /internal/refresh-cache`).
   - `frontend/src/chart.js`: Custom Canvas chart for candles, volume, indicators, crosshair readouts, and event markers.
   - `frontend/src/watchlist.js`: Multi-tab synchronized, regex-validated localStorage watchlist with export/import backup.
   - `frontend/src/alerts.js`: 100% client-side rule alerts with browser notifications and toast banners (zero server accounts).
   - `frontend/src/notebook.js`: Per-asset persistent research notebook with markdown export.
   - `frontend/src/report_generator.js`: Institutional research report synthesizer with strict Fact / Calculation / Interpretation tags and PDF export.
   - `frontend/src/screener_builder.js`: Dynamic multi-rule screener query builder with AND/OR logic and CSV/JSON export.
   - `frontend/src/backtester.js`: Strategy simulation engine (EMA cross & RSI mean reversion) computing CAGR, Max Drawdown, and Win Rate.
   - `frontend/src/api.js`: Resilient client with cold-start detection, retry wrapper, and user alerts.

2. **Epistemological Contract**:
   - Strictly separate: `SOURCE DATA` → `CALCULATED METRICS` → `ATTRIBUTED CONTEXT` → `INTERPRETATION`.
   - Every qualitative observation or score must state its underlying factual mathematical basis and expose its methodology.
   - Zero speculative predictions: historical valuation context is described by distribution percentiles, not "undervalued/overvalued" assertions.

3. **Upstream Protection & Cache Contracts**:
   - **Zero Inline Bursts**: Never trigger burst requests to yfinance on client queries.
   - **Cache-Only Batch**: Batch endpoints (`POST /api/stocks/batch`) return cached data immediately and mark misses as `status: 'pending'` without blocking.
   - **External Scheduled Ping**: Cloud container kept warm and refreshed via external GitHub Actions scheduled workflow (`.github/workflows/warm-cache.yml`).

4. **Multi-Cloud Deployment**:
   - Multi-cloud Dockerfile configured for Google Cloud Run and Render Web Service.
   - Dependencies strictly tracked in `backend/requirements.txt` and `requirements.txt`.
