# 📊 Apex Financial Terminal: Engineering Benchmarks & Scale Proof

> **Date:** November 18, 2026  
> **Environment:** Intel/AMD x86_64, Windows 11 / Linux CI, Python 3.12/3.14, Node.js 20+  
> **Reproducibility:** All benchmarks are reproducible via scripts committed in `/benchmarks`.

---

## 1. Two-Tier Cache Performance & Latency

Measured by `python benchmarks/benchmark_cache.py` simulating 2,000 requests with 80/20 power-law asset distribution:

| Metric | Result | Benchmark Target | Status |
|---|---|---|---|
| **Simulated Hit Rate** | **94.70%** (1,894 hits / 106 misses) | > 85% | **EXCEEDED** |
| **Throughput** | **19,186 req/sec** | > 10,000 req/sec | **EXCEEDED** |
| **p50 Latency (L1 In-Memory)** | **0.0029 ms** (2.9 µs) | < 1 ms | **EXCEEDED** |
| **p90 Latency** | **0.0036 ms** (3.6 µs) | < 2 ms | **EXCEEDED** |
| **p95 Latency** | **0.0037 ms** (3.7 µs) | < 5 ms | **EXCEEDED** |
| **p99 Latency** | **0.0041 ms** (4.1 µs) | < 10 ms | **EXCEEDED** |

*Methodology: Requests evaluated against primed L1 in-memory `TTLCache` with TTL eviction and namespace isolation (`stock:overview`).*

---

## 2. Mathematical Indicator Precision ($MAE$)

Measured by `node benchmarks/verify_indicators.mjs` against analytical mathematical reference formulas over 300 deterministic OHLCV bars:

| Indicator | Implementation Tested | Max Absolute Error ($MAE$) | Formula / Tolerance |
|---|---|---|---|
| **SMA (20-bar)** | `calculateSMAValues` | **$3.98 \times 10^{-13}$** | $\frac{1}{n} \sum_{i=0}^{n-1} P_i$ ($< 10^{-10}$) |
| **SMA (50-bar)** | `calculateSMAValues` | **$5.68 \times 10^{-13}$** | $\frac{1}{n} \sum_{i=0}^{n-1} P_i$ ($< 10^{-10}$) |
| **EMA (12-bar)** | `calculateEMAValues` | **$0.0000$** | $\alpha = \frac{2}{n+1}$, recursive ($< 10^{-10}$) |
| **EMA (26-bar)** | `calculateEMAValues` | **$0.0000$** | $\alpha = \frac{2}{n+1}$, recursive ($< 10^{-10}$) |
| **Bollinger Bands** | `computeIndicator('bollinger')` | **$0.0000$** | $\mu \pm 2\sigma$ ($< 10^{-10}$) |
| **RSI (14-bar)** | `computeIndicator('rsi')` | **$0.0000$** | Wilder Smoothing, strictly bounded $[0, 100]$ |

*Methodology: Comparing client HTML5 Canvas indicator computations against analytical floating point series.*

---

## 3. High Availability & Failover Routing

Measured by `python benchmarks/failover_sim.py`:

| Component | Failure Simulated | Degraded Mode Behavior | Verification |
|---|---|---|---|
| **Cache Layer** | Redis connection dropped / offline | Auto-downgrades to L1 In-Memory `TTLCache`. Zero 500 errors. | **PASS** |
| **US Equities** | Primary routing | Direct route to `YFinanceProvider`. | **PASS** |
| **Indian Equities (`.NS`)** | Primary routing + 403 block | Direct route to `NSEProvider`; on HTTP 403 / timeout, circuit breaker fails over to `YFinanceProvider`. | **PASS** |

---

## 4. Test Suite Coverage & Scale Facts

- **Backend Pytest Suite:** 102 passing tests (100% contract compliance).
- **Frontend E2E Demo Mode:** 100% passing Playwright smoke tests (zero live network calls).
- **Equity Catalog:** 2,369 NSE companies mapped with sector, market cap, and symbol aliases (`companies.csv`).
- **Workspaces:** 6 synchronized client environments (**Markets, Discover, Analyze, Compare, Research, Monitor**).
