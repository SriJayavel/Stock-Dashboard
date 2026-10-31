"""
Cache Protocol - Defines the contract for all cache implementations.
Any cache backend (memory, Redis, etc.) must implement this protocol.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional, List
from typing_extensions import Protocol


class CacheProtocol(Protocol):
    """Protocol for cache operations. Implementations must be thread-safe."""

    async def get(self, namespace: str, key: str) -> Optional[Any]:
        """Retrieve a value from cache."""
        ...

    async def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store a value in cache with optional TTL (seconds)."""
        ...

    async def delete(self, namespace: str, key: str) -> None:
        """Remove a value from cache."""
        ...

    async def exists(self, namespace: str, key: str) -> bool:
        """Check if a key exists in cache."""
        ...

    async def clear_namespace(self, namespace: str) -> None:
        """Clear all keys in a namespace."""
        ...

    async def get_many(self, namespace: str, keys: List[str]) -> dict[str, Any]:
        """Retrieve multiple values at once."""
        ...

    async def set_many(self, namespace: str, mapping: dict[str, Any], ttl: Optional[int] = None) -> None:
        """Store multiple values at once."""
        ...


class LockProtocol(Protocol):
    """Protocol for distributed locking."""

    async def acquire(self, key: str, ttl: int = 30) -> bool:
        """Try to acquire a lock. Returns True if acquired."""
        ...

    async def release(self, key: str) -> None:
        """Release a lock."""
        ...

    async def extend(self, key: str, ttl: int) -> bool:
        """Extend lock TTL. Returns True if extended."""
        ...


# Cache namespaces - single source of truth for all cache keys
class CacheNamespaces:
    """Centralized cache namespace definitions."""

    # Market data
    MARKET_OVERVIEW = "market:overview"
    STOCK_OVERVIEW = "stock:overview"
    STOCK_HISTORY = "stock:history"
    MARKET_CANDLES = "market:candles"

    # Computed data
    INDICATORS = "computed:indicators"
    SCREENER = "computed:screener"
    RESEARCH = "computed:research"
    DEEP_RESEARCH = "computed:deep_research"
    CORRELATION = "computed:correlation"
    PORTFOLIO_RISK = "computed:portfolio_risk"
    SECTOR_INTEL = "computed:sector_intel"
    V4_INTELLIGENCE = "computed:v4_intelligence"
    MACRO_EXPLORER = "computed:macro_explorer"

    # Search & discovery
    SEARCH = "discovery:search"
    SYMBOL_RESOLUTION = "discovery:symbol_resolution"

    # Locks
    LOCKS = "locks"

    @classmethod
    def all(cls) -> List[str]:
        """Get all cache namespaces."""
        return [
            cls.MARKET_OVERVIEW,
            cls.STOCK_OVERVIEW,
            cls.STOCK_HISTORY,
            cls.MARKET_CANDLES,
            cls.INDICATORS,
            cls.SCREENER,
            cls.RESEARCH,
            cls.DEEP_RESEARCH,
            cls.CORRELATION,
            cls.PORTFOLIO_RISK,
            cls.SECTOR_INTEL,
            cls.V4_INTELLIGENCE,
            cls.MACRO_EXPLORER,
            cls.SEARCH,
            cls.SYMBOL_RESOLUTION,
        ]