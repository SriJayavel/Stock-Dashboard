# Project Rules: Apex Financial Terminal

## Architecture Principles
1. **Separation of Concerns**:
   - `backend/services/data_pipeline.py`: Ticker resolution, multi-tier cache coordination, historical price fetching, company valuation multiples, and TradingView Lightweight Charts formatting.
   - `backend/services/cache_manager.py`: Hybrid two-tier caching (L1 TTLCache + L2 Upstash Redis), strictly checking L1 first to preserve free-tier command limits.
   - `backend/services/nse_fetcher.py`: Session-aware direct NSE India fetcher with cookie handshake and graceful fallback to yfinance.
   - `backend/services/indicators.py`: Pure mathematical calculations for technical indicators (RSI, MACD, Bollinger Bands, EMAs).
   - `backend/services/research_pipeline.py`: Multi-year audited financials, structural observations, and comparative peer dossiers.
   - `backend/services/deep_research.py`: Deep research analytics engine (quarterly trends, corporate actions, historical valuation envelope, relative benchmarking, correlation matrix, sector intelligence, and auditable financial health score).
   - `backend/main.py`: FastAPI endpoints and protected internal cache refresh worker (`POST /internal/refresh-cache`).
   - `frontend/src/chart.js`: High-performance TradingView Lightweight Charts rendering candles, volume, EMA overlays, Bollinger Bands, real-time crosshair tooltip, and event/signal markers.
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
