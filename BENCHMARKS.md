# MARA benchmarks

Run on 2026-11-22 UTC with AMD Ryzen 5 PRO 3500U w/ Radeon Vega Mobile Gfx, Windows_NT 10.0.19045 (Windows 10 Pro), Python 3.14.2 and Node v24.15.0.

Run `npm run benchmark` from the repository root to regenerate this report. It uses NumPy and pandas from `backend/requirements.txt`.

| Measurement | Result | Scope |
| --- | --- | --- |
| Simulated L1 workload throughput | 8,245.8 requests/sec | One process and one sequential asyncio worker, 2,000 iterations. Wall-clock time includes NumPy symbol sampling, cache lookups, and bookkeeping. No HTTP, Redis, or serialization. |
| In-process L1 lookup latency | p50 0.0049 ms · p90 0.0077 ms · p95 0.0094 ms · p99 0.0184 ms | Same worker and iterations. Per-request clock surrounds the awaited memory cache lookup. No HTTP, Redis, symbol sampling, or serialization. |
| Simulated hit rate | 94.85% (1,897 hits / 103 misses) | Eight prewarmed symbols out of ten. No production traffic. |
| Indicator formula checks | 5.6843e-13 max absolute error | SMA, EMA, and Bollinger series checks, plus an RSI bounds check. Bollinger reuses the app’s helpers. See the independent pandas check below. |
| Provider fallback | Passed | Offline composite quote routing with injected HTTP 403 and timeout errors. L1 was checked separately in isolation. |

The workload samples a fixed, power-law-style popularity profile with weights `[0.25, 0.20, 0.15, 0.10, 0.10, 0.05, 0.05, 0.05, 0.025, 0.025]`. If each uncached lookup required an upstream call, the simulated reduction versus no cache would be (2,000 − 103) ÷ 2,000 = 1,897 ÷ 2,000 = 94.85%. The previous “over 88%” figure had no separate measurement in this harness. The script uses unseeded sampling, so timings and hit counts vary.

The failover simulation covers composite single-quote routing. It does not exercise a Redis disconnect or measure circuit-breaker state transitions.

### `python -m benchmarks.benchmark_cache`

```text
=================================================================
 🚀 APEX FINANCIAL TERMINAL — CACHE BENCHMARK RESULTS
=================================================================
 Total Requests:      2,000
 Total Duration:      0.2425 seconds
 Throughput:          8,245.8 requests/sec
 Cache Hit Rate:      94.85% (1,897 hits / 103 misses)
-----------------------------------------------------------------
 Latency Distribution (L1 In-Memory):
   p50 (Median):      0.0049 ms
   p90:               0.0077 ms
   p95:               0.0094 ms
   p99:               0.0184 ms
=================================================================
```

### `python -m benchmarks.failover_sim`

```text
=================================================================
 🛡️ APEX FINANCIAL TERMINAL — FAILOVER & RESILIENCE SIMULATION
=================================================================

--- 1. Testing Cache Degradation (Redis Unreachable) ---
 [PASS] In-memory L1 cache successfully handles reads and writes during Redis downtime.

--- 2. Testing Composite Market Data Fallback Routing ---
 Route for AAPL: ['yfinance']
 [PASS] US symbols cleanly routed to primary yfinance provider.
 Route for TCS.NS: ['nse', 'yfinance']
 [PASS] Indian symbols route to NSE primary with automatic yfinance fallback.
 [PASS] Composite quote fallback after injected HTTP 403.
 [PASS] Composite quote fallback after injected timeout.
=================================================================
 ALL RESILIENCE & FAILOVER CHECKS PASSED
=================================================================
```

### `node benchmarks/verify_indicators.mjs`

```text
=================================================================
 📐 MATHEMATICAL INDICATOR PRECISION VERIFICATION
=================================================================
 [PASS] SMA(20)                        Max Error: 3.9790e-13 (281 bars)
 [PASS] SMA(50)                        Max Error: 5.6843e-13 (251 bars)
 [PASS] EMA(12)                        Max Error: 0.0000e+0 (289 bars)
 [PASS] EMA(26)                        Max Error: 0.0000e+0 (275 bars)
 [PASS] BollingerBands(20,2)           Max Error: 0.0000e+0 (281 bars)
 [PASS] RSI(14) Bounds [0, 100]        Max Error: 0.0000e+0 (286 bars)
=================================================================
 Overall Status: ALL MATHEMATICAL CHECKS PASSED (Max Error < 1e-10)
=================================================================
```

### `node benchmarks/verify_reference.mjs`

```text
[PASS] TCS-NS: 251 bars against pandas 3.0.3
[PASS] AAPL: 251 bars against pandas 3.0.3
sma max absolute error: 3.6380e-12
ema max absolute error: 0.0000e+0
upper max absolute error: 2.3647e-11
lower max absolute error: 2.2283e-11
rsi max absolute error: 0.0000e+0
macd max absolute error: 8.8818e-16
```

<!-- Browser audit -->
## Mobile browser audit

Lighthouse 13.0.1 ran on 2026-11-22 against a clean-clone build of the Markets demo at `/?freeze=1#/markets`, with the default mobile preset and simulated throttling.

| Category | Score |
| --- | ---: |
| Performance | 57 |
| Accessibility | 100 |
| Best practices | 100 |
| SEO | 100 |

The first run recorded Performance 31 and cumulative layout shift of 0.42. After removing the duplicate loading screen, parallelizing demo quote loading, and deferring Canvas initialization, Performance reached 55 and layout shift fell to 0.001. The clean-clone run recorded zero layout shift, 3.1 s largest contentful paint, and 8,970 ms total blocking time. Lighthouse could not attribute the longest task to a specific script. The audit still flags unused CSS and JavaScript on the Markets route.

To reproduce, serve the built demo on port 8184 and run:

```sh
npx --yes lighthouse@13.0.1 'http://127.0.0.1:8184/?freeze=1#/markets' --chrome-flags=--headless
```
