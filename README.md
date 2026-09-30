# 📈 Apex Financial Terminal v2.0

> **High-Performance Financial Research Terminal • Decoupled Cloud Architecture**  
> Built with **FastAPI**, **Vite (Vanilla JS)**, **TradingView Lightweight Charts**, and a **Two-Tier Resilient Cache**.

---

## 🏗️ Architecture Overview

The system is decoupled into an asynchronous backend service and a low-latency client frontend:

```text
Stock-Dashboard/
├── backend/                        # FastAPI High-Frequency API
│   ├── services/
│   │   ├── cache_manager.py       # Hybrid L1 (TTLCache) + L2 (Upstash Redis)
│   │   ├── data_pipeline.py       # Ticker resolution, cache contracts & TV chart formatting
│   │   ├── indicators.py          # Pure mathematical indicator engine (RSI, MACD, BB, EMAs)
│   │   └── nse_fetcher.py         # Session-aware direct NSE India client with cookie handshake
│   ├── config.py                  # Pydantic Settings & environment variables
│   ├── main.py                    # API routes, CORS & protected /internal/refresh-cache
│   └── requirements.txt           # Backend dependencies
├── frontend/                       # Vite + Vanilla JS Client
│   ├── src/
│   │   ├── api.js                 # Resilient API client with cold-start detection
│   │   ├── chart.js               # TradingView Lightweight Charts engine
│   │   ├── watchlist.js           # Multi-tab sync & validated localStorage manager
│   │   ├── styles/terminal.css    # Ultra-modern dark aesthetic, glassmorphism & badges
│   │   └── main.js                # State management, ticker tape, and UI orchestration
│   ├── index.html                 # Semantic responsive terminal interface
│   ├── package.json
│   └── vite.config.js             # Development proxy to backend
├── .github/workflows/
│   └── warm-cache.yml             # Scheduled GitHub Actions cron for keep-alive & cache warmup
├── Dockerfile                     # Multi-cloud container definition (Render / Cloud Run)
├── companies.csv                  # 2,369 NSE companies metadata catalog
├── requirements.txt               # Root pointer to backend/requirements.txt
└── README.md
```

---

## 🌟 Key Engineering Highlights

1. **Anti-Rate-Limiting Pipeline**:
   - **Zero Inline Bursts**: User queries never trigger unthrottled requests to upstream financial APIs.
   - **Cache-Only Batch Contract (`POST /api/stocks/batch`)**: User watchlists (up to 50 assets) query L1/L2 cache exclusively. Any misses immediately return `status: "pending"` in 0ms without blocking.
   - **Direct NSE Session Handshake**: Custom browser cookie handshake visits NSE India before fetching quotes, falling back gracefully to yfinance.

2. **Render / Cloud Run Free-Tier Keep-Alive**:
   - Free container instances spin down after 15 minutes of inactivity.
   - Protected endpoint `POST /internal/refresh-cache` (gated by `X-Internal-Secret`) is pinged every 12 minutes by a free **GitHub Actions scheduled workflow** (`.github/workflows/warm-cache.yml`), keeping the container warm and pre-populating the cache.

3. **TradingView Lightweight Charts (`lightweight-charts`)**:
   - 60fps hardware-accelerated charting replacing slow iframe widgets.
   - Candlesticks, volume histogram, EMA 50 & EMA 200 overlays, and Bollinger Bands.
   - Real-time crosshair legend showing Date, O, H, L, C, and % Change.

4. **Zero-Account Persistent Watchlist**:
   - Saved locally in the user's browser (`localStorage`).
   - Cross-tab synchronization via `window.addEventListener('storage', ...)`.
   - Rapid-clicking race condition defense via monotonic request tokens.
   - Strict format validation (regex check, max 50 symbols cap).
   - 1-Click JSON backup export and import.

---

## 🚀 Running Locally

### 1. Start Backend (FastAPI)
```bash
# Install dependencies
pip install -r requirements.txt

# Launch FastAPI development server
uvicorn backend.main:app --reload --port 8080
```
API Documentation will be available at: `http://localhost:8080/docs`

### 2. Start Frontend (Vite)
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: `http://localhost:5173`

---

## 🐳 Docker Deployment (Google Cloud Run / Render)

Build and run the production container:
```bash
# Build the Docker image
docker build -t apex-financial-terminal .

# Run container locally
docker run -p 8080:8000 apex-financial-terminal
```

## Cloudflare Pages Deployment

Cloudflare Pages hosts the Vite frontend. The FastAPI backend still needs a Python container host such as Render or Google Cloud Run; Pages does not run this project's Python service. The Pages Function at `frontend/functions/api/[[path]].js` forwards same-origin `/api/*` requests to that backend.

1. Push this repository to a Git provider and create a Pages project from it in **Workers & Pages → Create application → Pages → Connect to Git**.
2. Set the project root directory to `frontend`, the build command to `npm run build`, and the build output directory to `dist`.
3. Set `BACKEND_API_URL` as a Pages runtime variable to the HTTPS origin of the deployed FastAPI service (for example, `https://api.example.com`). Do not include an `/api` suffix.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Pages build variables using the project's Supabase URL and publishable/anonymous key. These are embedded in the frontend build.
5. Deploy. Pages will rebuild on pushes and provide a `*.pages.dev` URL. Add that URL to the backend's `CORS_ORIGINS`/`FRONTEND_URL` configuration if other browser flows require direct cross-origin calls.

The FastAPI deployment must separately receive its production `SUPABASE_URL`, `SUPABASE_KEY`, `REDIS_URL`, `INTERNAL_REFRESH_SECRET`, and `CORS_ORIGINS` settings. Keep the GitHub Actions `BACKEND_API_URL` secret pointed at the backend origin so scheduled cache refreshes continue to work.

---

## 📦 Legacy Streamlit Prototype
The original prototype is permanently preserved via Git:
- **Git Branch**: `legacy-streamlit`
- **Git Tag**: `v1.0.0-streamlit`
- To run or inspect the legacy prototype:
  ```bash
  git checkout legacy-streamlit
  streamlit run app.py
  ```
