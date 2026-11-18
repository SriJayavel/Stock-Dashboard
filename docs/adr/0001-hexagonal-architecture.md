# ADR 001: Hexagonal Architecture (Ports & Adapters)

## Status
Accepted

## Context
Financial market data providers (e.g. NSE India, Yahoo Finance, AlphaVantage) change APIs frequently, impose volatile rate limits, or block scraper traffic. Furthermore, running unit tests that depend on live network connections produces slow, flaky, and non-deterministic builds.

If business logic (screening, valuation multiples, technical indicators) is coupled directly to a specific provider library or database client, swapping providers requires rewrite cascades across the application.

## Decision
Adopt a decoupled **Hexagonal (Ports and Adapters)** architecture:
1. **Core Domain (`backend/core/`):** Contains pure business entities, value objects, and typed contracts/protocols (`MarketDataProvider`, `CacheProtocol`, `AuthProvider`, `EventBus`). Zero third-party framework or network dependencies.
2. **Adapters (`backend/adapters/`):** Implement the core protocols for specific external infrastructure (`NSEProvider`, `YFinanceProvider`, `MemoryCache`, `RedisCache`, `SupabaseAuthProvider`).
3. **Application & API (`backend/api/`):** Thin FastAPI routes that consume dependencies injected through standard FastAPI dependency injection.

## Consequences
- **Positive:**
  - Automated contract test suites run in milliseconds with 100% mocked/in-memory adapters without internet access.
  - New market data vendors (e.g., licensed direct NSE UDP feed, Bloomberg B-PIPE) can be added by implementing `MarketDataProvider` with zero changes to analytics or UI endpoints.
  - Resilience: Composite provider dynamically routes Indian equities to NSE first, seamlessly failing over to yfinance on HTTP 403 or timeouts.
- **Negative:**
  - Requires maintaining explicit abstract protocol definitions and Data Transfer Objects (DTOs).
