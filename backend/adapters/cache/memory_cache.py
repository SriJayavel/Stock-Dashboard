"""
Memory Cache Adapter - L1 in-memory cache implementation.
Thread-safe, zero dependencies, for development and testing.
"""
import asyncio
import time
import logging
from typing import Any, Optional, List, Dict
from collections import OrderedDict
from threading import RLock

from backend.core.contracts.cache import CacheProtocol, LockProtocol, CacheNamespaces


logger = logging.getLogger("memory_cache")


class MemoryCache:
    """
    Thread-safe in-memory cache with TTL support.
    Uses OrderedDict for LRU eviction when maxsize reached.
    """

    def __init__(self, maxsize: int = 1000, default_ttl: int = 300):
        self._maxsize = maxsize
        self._default_ttl = default_ttl
        self._cache: Dict[str, OrderedDict] = {}  # namespace -> OrderedDict[key -> (value, expiry)]
        self._locks: Dict[str, RLock] = {}
        self._global_lock = RLock()

    def _get_namespace_lock(self, namespace: str) -> RLock:
        with self._global_lock:
            if namespace not in self._locks:
                self._locks[namespace] = RLock()
                self._cache[namespace] = OrderedDict()
            return self._locks[namespace]

    def _make_key(self, namespace: str, key: str) -> str:
        return f"{namespace}:{key}"

    def _is_expired(self, expiry: Optional[float]) -> bool:
        if expiry is None:
            return False
        return time.time() > expiry

    async def get(self, namespace: str, key: str) -> Optional[Any]:
        lock = self._get_namespace_lock(namespace)
        with lock:
            ns_cache = self._cache[namespace]
            if key in ns_cache:
                value, expiry = ns_cache[key]
                if not self._is_expired(expiry):
                    # Move to end (LRU)
                    ns_cache.move_to_end(key)
                    return value
                else:
                    # Expired - remove
                    del ns_cache[key]
        return None

    async def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        lock = self._get_namespace_lock(namespace)
        with lock:
            ns_cache = self._cache[namespace]

            # Evict if at maxsize and key is new
            if key not in ns_cache and len(ns_cache) >= self._maxsize:
                ns_cache.popitem(last=False)  # Remove oldest

            expiry = time.time() + (ttl or self._default_ttl) if ttl != 0 else None
            ns_cache[key] = (value, expiry)
            ns_cache.move_to_end(key)

    async def delete(self, namespace: str, key: str) -> None:
        lock = self._get_namespace_lock(namespace)
        with lock:
            ns_cache = self._cache[namespace]
            ns_cache.pop(key, None)

    async def exists(self, namespace: str, key: str) -> bool:
        val = await self.get(namespace, key)
        return val is not None

    async def clear_namespace(self, namespace: str) -> None:
        lock = self._get_namespace_lock(namespace)
        with lock:
            self._cache[namespace].clear()

    async def get_many(self, namespace: str, keys: List[str]) -> Dict[str, Any]:
        lock = self._get_namespace_lock(namespace)
        with lock:
            ns_cache = self._cache[namespace]
            result = {}
            for key in keys:
                if key in ns_cache:
                    value, expiry = ns_cache[key]
                    if not self._is_expired(expiry):
                        result[key] = value
                        ns_cache.move_to_end(key)
                    else:
                        del ns_cache[key]
            return result

    async def set_many(self, namespace: str, mapping: Dict[str, Any], ttl: Optional[int] = None) -> None:
        for key, value in mapping.items():
            await self.set(namespace, key, value, ttl)

    # --- Utility methods ---

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._global_lock:
            total_keys = sum(len(ns) for ns in self._cache.values())
            return {
                "namespaces": list(self._cache.keys()),
                "total_keys": total_keys,
                "maxsize": self._maxsize,
                "default_ttl": self._default_ttl,
            }

    async def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count removed."""
        removed = 0
        now = time.time()
        with self._global_lock:
            for namespace, lock in self._locks.items():
                with lock:
                    ns_cache = self._cache[namespace]
                    expired_keys = [
                        k for k, (_, expiry) in ns_cache.items()
                        if expiry is not None and now > expiry
                    ]
                    for k in expired_keys:
                        del ns_cache[k]
                    removed += len(expired_keys)
        return removed


class MemoryLock:
    """In-memory distributed lock (single-process only)."""

    def __init__(self):
        self._locks: Dict[str, asyncio.Lock] = {}
        self._expiry: Dict[str, float] = {}
        self._global_lock = asyncio.Lock()

    async def acquire(self, key: str, ttl: int = 30) -> bool:
        async with self._global_lock:
            if key in self._locks:
                # Check if expired
                if time.time() > self._expiry.get(key, 0):
                    # Expired - release old lock
                    self._locks[key].release()
                    del self._locks[key]
                    del self._expiry[key]
                else:
                    # Still held
                    return False

            # Create new lock
            lock = asyncio.Lock()
            await lock.acquire()
            self._locks[key] = lock
            self._expiry[key] = time.time() + ttl
            return True

    async def release(self, key: str) -> None:
        async with self._global_lock:
            if key in self._locks:
                self._locks[key].release()
                del self._locks[key]
                del self._expiry[key]

    async def extend(self, key: str, ttl: int) -> bool:
        async with self._global_lock:
            if key in self._locks and time.time() < self._expiry.get(key, 0):
                self._expiry[key] = time.time() + ttl
                return True
        return False


# Backwards-compatible sync interface for existing code
class SyncMemoryCache:
    """Synchronous wrapper for existing code that uses cache synchronously."""

    def __init__(self, async_cache: MemoryCache):
        self._async = async_cache

    def get(self, namespace: str, key: str) -> Optional[Any]:
        # Run async get in event loop
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(self._async.get(namespace, key))

    def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        loop.run_until_complete(self._async.set(namespace, key, value, ttl))

    def invalidate(self, namespace: str, key: str) -> None:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        loop.run_until_complete(self._async.delete(namespace, key))

    def acquire_lock(self, key: str, ttl: int = 30) -> bool:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(self._async._lock.acquire(key, ttl))

    def release_lock(self, key: str) -> None:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        loop.run_until_complete(self._async._lock.release(key))


# Default instance for dependency injection
_default_cache: Optional[MemoryCache] = None


def get_memory_cache() -> MemoryCache:
    global _default_cache
    if _default_cache is None:
        _default_cache = MemoryCache()
    return _default_cache


def get_sync_cache() -> SyncMemoryCache:
    return SyncMemoryCache(get_memory_cache())