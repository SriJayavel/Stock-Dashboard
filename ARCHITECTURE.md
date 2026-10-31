# Apex Financial Terminal - Architecture Document

## Core Principles

### 1. Zero Coupling Between Features
- **No feature depends on another feature's internal implementation**
- Features communicate ONLY through well-defined contracts (interfaces)
- Deleting a feature = deleting its folder, zero ripple effects

### 2. Dependency Inversion
- High-level modules (API endpoints) depend on abstractions, not concretions
- All external dependencies (Redis, yfinance, Supabase) behind interfaces
- Easy to swap/mock/test

### 3. Single Source of Truth
- Each piece of data has ONE owner
- No duplicate state across services
- Cache is a performance detail, not a source of truth

### 4. Explicit Contracts
- Every service exposes a typed interface (Protocol/ABC)
- Request/Response DTOs for all public APIs
- Versioned contracts for breaking changes

---

## Module Structure

```
backend/
├── core/                    # Framework-agnostic business logic
│   ├── contracts/           # Interfaces (Protocols/ABCs)
│   │   ├── cache.py         # CacheProtocol
│   │   ├── market_data.py   # MarketDataProvider
│   │   ├── auth.py          # AuthProvider
│   │   └── events.py        # EventBus
│   ├── domain/              # Pure domain models (no framework deps)
│   │   ├── models.py        # Stock, Candle, Portfolio, etc.
│   │   ├── value_objects.py # Money, Symbol, Timeframe, etc.
│   │   └── events.py        # Domain events
│   ├── services/            # Business logic (stateless, testable)
│   │   ├── portfolio.py
│   │   ├── screener.py
│   │   ├── research.py
│   │   └── valuation.py
│   └── exceptions/          # Domain exceptions
│
├── adapters/                # External integrations (implement contracts)
│   ├── cache/
│   │   ├── memory_cache.py
│   │   └── redis_cache.py
│   ├── market_data/
│   │   ├── yfinance_provider.py
│   │   ├── nse_provider.py
│   │   └── composite_provider.py
│   ├── auth/
│   │   └── supabase_auth.py
│   └── events/
│       └── websocket_events.py
│
├── api/                     # FastAPI layer (thin, only HTTP concerns)
│   ├── routes/
│   │   ├── markets.py
│   │   ├── stocks.py
│   │   ├── analytics.py
│   │   ├── research.py
│   │   └── websocket.py
│   ├── middleware/
│   ├── dependencies.py      # FastAPI dependency injection
│   └── schemas.py           # Request/Response DTOs
│
├── config/                  # Configuration management
│   └── settings.py
│
├── main.py                  # App factory, wiring
└── tests/
    ├── unit/                # Pure domain logic tests
    ├── integration/         # Adapter tests
    └── contract/            # Contract compliance tests
```

---

## Feature Modularity Rules

### Each Feature = Self-Contained Module
```
features/
├── watchlist/
│   ├── __init__.py          # Public exports only
│   ├── contracts.py         # WatchlistProtocol
│   ├── service.py           # Business logic
│   ├── api.py               # FastAPI routes
│   ├── models.py            # Pydantic models
│   └── tests/
├── alerts/
├── screener/
├── backtester/
├── notebook/
└── reports/
```

### Feature Contract (Example)
```python
# features/watchlist/contracts.py
from abc import ABC, abstractmethod
from typing import List
from core.domain.models import WatchlistItem

class WatchlistProtocol(ABC):
    @abstractmethod
    async def get_watchlist(self, user_id: str) -> List[WatchlistItem]: ...
    
    @abstractmethod
    async def add_symbol(self, user_id: str, symbol: str) -> WatchlistItem: ...
    
    @abstractmethod
    async def remove_symbol(self, user_id: str, symbol: str) -> None: ...
    
    @abstractmethod
    async def reorder(self, user_id: str, symbols: List[str]) -> None: ...
```

### Feature Registration (Auto-discovery)
```python
# main.py - Features auto-register
from importlib import import_module
from pathlib import Path

def register_features(app: FastAPI):
    features_dir = Path(__file__).parent / "features"
    for feature_dir in features_dir.iterdir():
        if feature_dir.is_dir() and (feature_dir / "api.py").exists():
            module = import_module(f"features.{feature_dir.name}.api")
            if hasattr(module, "router"):
                app.include_router(module.router, prefix=f"/api/{feature_dir.name}")
```

---

## Testing Strategy

### 1. Contract Tests (Run against ALL implementations)
```python
# tests/contract/test_cache_protocol.py
import pytest
from core.contracts.cache import CacheProtocol

class TestCacheContract:
    @pytest.fixture(params=["memory", "redis"])
    def cache(self, request) -> CacheProtocol:
        if request.param == "memory":
            from adapters.cache.memory_cache import MemoryCache
            return MemoryCache()
        else:
            from adapters.cache.redis_cache import RedisCache
            return RedisCache()
    
    async def test_get_set_roundtrip(self, cache: CacheProtocol):
        await cache.set("test", "key", "value")
        assert await cache.get("test", "key") == "value"
```

### 2. Domain Tests (Pure, Fast, No Mocks)
```python
# tests/unit/test_valuation.py
def test_pe_ratio_calculation():
    stock = Stock(price=100, earnings_per_share=5)
    assert stock.pe_ratio == 20
```

### 3. Integration Tests (Real Adapters)
```python
# tests/integration/test_yfinance_provider.py
@pytest.mark.integration
async def test_fetch_real_data():
    provider = YFinanceProvider()
    data = await provider.get_history("AAPL", "1y", "1d")
    assert len(data) > 0
```

---

## Development Rules

### Adding a New Feature
1. Create `features/{feature_name}/` with contracts, service, api
2. Implement the Protocol
3. Write contract tests
4. Register in main.py (auto-discovery)
5. **Run full test suite - must pass**

### Deleting a Feature
1. Delete `features/{feature_name}/`
2. Run tests - **must pass with zero changes elsewhere**

### Changing a Contract
1. Version the contract: `CacheProtocolV2`
2. Support both versions during transition
3. Deprecate old version after migration

---

## Code Quality Gates (Pre-commit + CI)

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks:
      - id: ruff
        args: [--fix]
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks:
      - id: ruff-format
  - repo: local
    hooks:
      - id: contract-tests
        name: Contract Tests
        entry: pytest tests/contract -x
        language: system
      - id: unit-tests
        name: Unit Tests
        entry: pytest tests/unit -x
        language: system
```

---

## Key Refactoring Targets

| Current Issue | Target Architecture |
|---------------|---------------------|
| `main.py` 700+ lines | Thin app factory + auto-discovery |
| Services import each other | Dependency injection via protocols |
| Frontend global state | Feature-scoped state managers |
| Direct yfinance calls | Behind `MarketDataProvider` protocol |
| Hardcoded cache keys | Typed cache namespaces |
| Inline WebSocket logic | Event bus + handlers |

---

## Migration Path

### Phase 1: Extract Contracts (Week 1)
- Define all Protocols in `core/contracts/`
- Make existing services implement them
- Add contract tests

### Phase 2: Invert Dependencies (Week 2)
- Wire via dependency injection
- Move external adapters to `adapters/`
- Remove direct imports between services

### Phase 3: Feature Modularization (Week 3)
- Extract each frontend feature to `features/`
- Auto-discovery registration
- Feature-level tests

### Phase 4: Quality Gates (Week 4)
- Pre-commit hooks
- CI pipeline with contract/unit/integration separation
- Architecture decision records (ADRs)

---

## "Delete a Feature" Test

```bash
# This should work with ZERO other changes:
rm -rf backend/features/alerts
pytest tests/ -x  # ALL PASS
```

If tests fail → architecture violation found.