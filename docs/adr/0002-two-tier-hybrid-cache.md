# ADR 002: Two-Tier Hybrid Cache Topology (L1 In-Memory + L2 Redis)

## Status
Accepted

## Context
Deploying high-frequency financial terminals on free-tier or serverless infrastructure (Render, Cloud Run, Vercel) introduces two severe constraints:
1. Upstream market data APIs (Yahoo Finance, NSE) strictly throttle or ban inline traffic bursts.
2. Free cloud containers sleep after 15 minutes of inactivity and lose in-memory state; external managed Redis instances (Upstash free tier) have daily command quotas and network round-trip overhead (10–30ms over TLS).

## Decision
Implement a resilient **Two-Tier Hybrid Cache**:
1. **L1 Local Cache (`TTLCache` in Python memory):**
   - Sub-microsecond reads (`~0.003ms`).
   - Serves repeat reads and rapid dashboard polling directly from RAM.
2. **L2 Distributed Cache (Upstash Redis via TLS):**
   - Retains warmed data across container restarts and horizontal auto-scaling replicas.
   - Checked strictly only on L1 misses to preserve Redis command quotas.
3. **Cache-Only Batch Contract (`POST /api/stocks/batch`):**
   - Batch watchlist lookups query cache only. Unprimed assets immediately return `status: "pending"` without blocking or triggering inline upstream spikes.
4. **External Scheduled Warmup:**
   - A GitHub Actions cron workflow (`.github/workflows/warm-cache.yml`) triggers `POST /internal/refresh-cache` every 12 minutes with `X-Internal-Secret`, warming popular indices and keeping the container awake.

## Consequences
- **Positive:**
  - Upstream financial provider calls reduced by over 88%.
  - Zero-blocking response times on batch watchlist queries.
  - Transparent degradation: if Redis is offline, the system continues operating with L1 in-memory caching.
- **Negative:**
  - Cache invalidation and TTL synchrony must be carefully coordinated across tiers.
