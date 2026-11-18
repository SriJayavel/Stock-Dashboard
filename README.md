# 📈 Apex Financial Terminal (MARA) v2.0

[![CI Pipeline](https://github.com/Phantom-Jay/Stock-Dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Phantom-Jay/Stock-Dashboard/actions/workflows/ci.yml)
[![Tests Passing](https://img.shields.io/badge/tests-102%20passed-success)](https://github.com/Phantom-Jay/Stock-Dashboard)
[![Python Version](https://img.shields.io/badge/python-3.12%20%7C%203.14-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **High-Performance Equities Research Terminal for Indian (NSE/BSE) & Global Financial Assets**  
> Built with **FastAPI**, **Hexagonal Architecture**, **Two-Tier Cache (L1 Memory + L2 Redis)**, and a custom **HTML5 Canvas Charting Engine**.

🔗 **Live Static Demo:** [https://stock-dashboard-five-nu.vercel.app](https://stock-dashboard-five-nu.vercel.app) *(Runs 100% client-side with synthetic fixtures — zero backend/login required)*

---

## 🏗️ Architecture Overview

The platform uses a decoupled hexagonal pattern separating core quantitative algorithms from external market providers:

```text
Stock-Dashboard/
├── backend/
│   ├── core/                  # Pure domain entities, value objects & abstract protocols
│   ├── adapters/              # Concrete implementations (NSE, yfinance, Upstash Redis, Supabase)
│   ├── features/              # Modular services (research, screener, deep research, warmer)
│   ├── api/                   # Thin FastAPI HTTP routes, security headers & CORS allowlist
│   └── tests/                 # 102 unit, contract, and regression tests (100% offline)
├── frontend/                  # Vite + Vanilla JS Client
│   ├── src/
│   │   ├── chart.js           # 60fps hardware-accelerated HTML5 Canvas chart
│   │   ├── indicators.js      # Zero-dependency mathematical indicators (RSI, MACD, BB, EMAs)
│   │   ├── backtester.js      # Strategy simulator (Sharpe, Sortino, Drawdown, Friction)
│   │   ├── watchlist.js       # Multi-tab synchronized localStorage manager
│   │   └── api.js             # Resilient client with cold-start retry & demo routing
│   └── public/demo/           # Deterministic synthetic data fixtures for offline demo mode
├── benchmarks/                # Reproducible latency, throughput & indicator precision scripts
├── docs/                      # Compliance audits, data-flow matrices & Architecture Decision Records (ADRs)
└── .github/workflows/         # CI testing (pytest + Playwright) & automated cache warming
```

---

## ⚡ Measured Engineering Benchmarks

Every claim in this repository is measured and reproducible via scripts committed in [`/benchmarks`](./benchmarks) (see [`BENCHMARKS.md`](./BENCHMARKS.md)):

- **Cache Throughput:** `19,186 req/sec` with **`0.0037 ms` (3.7 µs)** p95 latency on primed L1 in-memory hits (`benchmarks/benchmark_cache.py`).
- **Cache Hit Rate:** **`94.70%`** under power-law equity distribution, reducing upstream provider calls by > 88%.
- **Indicator Accuracy:** **$MAE < 10^{-12}$** maximum absolute error verified against analytical formulas across RSI, MACD, EMAs, and Bollinger Bands (`benchmarks/verify_indicators.mjs`).
- **Failover Routing:** Automated circuit-breaker switches from direct NSE (`.NS`) to fallback provider on HTTP 403 or network timeout with zero unhandled exceptions (`benchmarks/failover_sim.py`).

---

## 🧠 Key Architectural Decisions

1. **Hexagonal Domain Boundaries ([ADR-001](./docs/adr/0001-hexagonal-architecture.md)):** Core analytics depend strictly on abstract protocols (`MarketDataProvider`, `CacheProtocol`), enabling 102 tests to run in seconds without internet access.
2. **Two-Tier Resilient Cache ([ADR-002](./docs/adr/0002-two-tier-hybrid-cache.md)):** L1 in-memory `TTLCache` handles microsecond repeat reads; L2 Upstash Redis persists data across serverless container restarts.
3. **Epistemological Contract ([ADR-003](./docs/adr/0003-epistemological-contract-no-speculation.md)):** Strict separation of *Fact $\rightarrow$ Metric $\rightarrow$ Context*. Valuation multiples are represented strictly as historical distribution percentiles (e.g. 82nd percentile), avoiding subjective advice triggers under SEBI (Research Analysts) Regulations 2014.
4. **Zero-Knowledge Client Storage ([ADR-004](./docs/adr/0004-client-side-only-user-storage.md)):** User watchlists, notes, and alerts reside exclusively in browser `localStorage`. Zero personal portfolio data is sent to or stored in backend databases, honoring India's DPDP Act 2023.

---

## 🚀 Quick Start (5 Commands)

```bash
# 1. Clone repository
git clone https://github.com/Phantom-Jay/Stock-Dashboard.git && cd Stock-Dashboard

# 2. Run backend test suite (102 tests)
pip install -r backend/requirements.txt && pytest backend/tests

# 3. Start FastAPI backend
uvicorn backend.main:app --port 8000

# 4. In a new terminal: Install frontend dependencies & run demo verification
cd frontend && npm install && npm run test:demo

# 5. Launch frontend dev server
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## ⚠️ Known Limitations & Compliance Position

- **NSE Real-Time Data:** Direct calls to unofficial NSE web endpoints return HTTP 403 access barriers. The terminal automatically falls back to secondary market providers for research. Official commercial live feeds require licensing via NSE Data & Analytics Ltd.
- **Educational Scope:** This software is an informational equities research workstation, not a registered investment advisor. It produces zero algorithmic buy/sell recommendations or price targets.
- **Data Protection:** Authentication credentials (if used) are processed by Supabase Auth (US/EU data centers). For data protection inquiries, contact `dpo@mara-financial.com`.

---

## 📄 License
This project is open-source under the [MIT License](./LICENSE).
