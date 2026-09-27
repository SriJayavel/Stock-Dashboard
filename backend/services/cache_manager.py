"""
Hybrid Two-Tier Cache Manager:
- Tier 1 (L1): In-Memory cachetools.TTLCache for instant microsecond hits with zero I/O.
- Tier 2 (L2): Optional External Redis (Upstash free tier) surviving container sleep/restarts.
Crucial optimization: Strictly checks L1 first. Redis is never touched if L1 has a valid entry,
conserving free-tier command limits (10,000 commands/day).
"""

import time
import json
import logging
from typing import Any, Optional
from cachetools import TTLCache
from backend.config import settings

logger = logging.getLogger("cache_manager")

# Local locks fallback when Redis is unconfigured
_local_locks = {}

# L1 In-Memory Caches
_l1_caches = {
    "overview": TTLCache(maxsize=1000, ttl=settings.L1_STOCK_OVERVIEW_TTL),
    "history": TTLCache(maxsize=500, ttl=settings.L1_STOCK_HISTORY_TTL),
    "market": TTLCache(maxsize=50, ttl=settings.L1_MARKET_OVERVIEW_TTL),
    "indicators": TTLCache(maxsize=500, ttl=settings.L1_INDICATORS_TTL),
    "screener": TTLCache(maxsize=50, ttl=settings.L1_SCREENER_TTL),
}

# Optional L2 Redis Client
_redis_client = None
if settings.REDIS_URL:
    try:
        import redis
        _redis_client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=3,
            socket_connect_timeout=3,
        )
        # Test connection ping
        _redis_client.ping()
        logger.info("L2 External Redis connected successfully.")
    except Exception as e:
        logger.warning(f"L2 Redis connection failed or unavailable: {e}. Falling back to L1 only.")
        _redis_client = None


class CacheManager:
    @staticmethod
    def get(namespace: str, key: str) -> Optional[Any]:
        """
        Retrieve value:
        1. Check L1 in-memory (microsecond, no network I/O).
        2. If missed and Redis configured, check L2 Redis and hydrate L1.
        """
        l1 = _l1_caches.get(namespace)
        if l1 is not None and key in l1:
            return l1[key]

        # L1 Miss -> Try L2 Redis
        if _redis_client:
            try:
                raw = _redis_client.get(f"{namespace}:{key}")
                if raw:
                    val = json.loads(raw)
                    # Hydrate L1
                    if l1 is not None:
                        l1[key] = val
                    return val
            except Exception as e:
                logger.debug(f"Redis get failed for {namespace}:{key}: {e}")

        return None

    @staticmethod
    def set(namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        Store value in L1 and optional L2 Redis.
        """
        l1 = _l1_caches.get(namespace)
        if l1 is not None:
            l1[key] = value

        if _redis_client:
            try:
                effective_ttl = ttl or getattr(settings, f"L1_{namespace.upper()}_TTL", 1800)
                # Upstash/Redis string serialization
                payload = json.dumps(value, default=str)
                _redis_client.setex(f"{namespace}:{key}", effective_ttl, payload)
            except Exception as e:
                logger.debug(f"Redis set failed for {namespace}:{key}: {e}")

    @staticmethod
    def invalidate(namespace: str, key: str) -> None:
        """Invalidate a specific cache key."""
        l1 = _l1_caches.get(namespace)
        if l1 is not None and key in l1:
            del l1[key]
        if _redis_client:
            try:
                _redis_client.delete(f"{namespace}:{key}")
            except Exception:
                pass

    @staticmethod
    def acquire_lock(name: str, ttl: int = 120) -> bool:
        """
        Acquire distributed lock using Redis SETNX with expiration (TTL).
        Works across multiple Uvicorn workers and container instances.

        Fail-Closed Semantics:
        If Redis is configured and an exception occurs (network blip, timeout, etc.),
        this function FAILS CLOSED and returns False immediately. It deliberately
        avoids falling back to a process-local lock in production to prevent
        silent concurrent-warming storms against upstream APIs.

        If Redis is unconfigured (e.g. local dev without REDIS_URL), it uses
        an in-process timestamp lock.
        """
        lock_key = f"lock:{name}"
        if settings.REDIS_URL or _redis_client:
            if not _redis_client:
                logger.error(
                    f"Redis distributed lock requested for '{lock_key}' but Redis client is uninitialized. "
                    "Failing closed (returning False) to prevent concurrent warmup storm."
                )
                return False
            try:
                acquired = _redis_client.set(lock_key, "1", nx=True, ex=ttl)
                return bool(acquired)
            except Exception as e:
                logger.error(
                    f"Redis distributed lock acquire error for '{lock_key}': {e}. "
                    "Failing closed (returning False) to prevent concurrent warmup storm."
                )
                return False

        # Local development fallback ONLY when Redis is completely unconfigured (dev/test)
        now = time.time()
        expiry = _local_locks.get(lock_key, 0)
        if now < expiry:
            return False
        _local_locks[lock_key] = now + ttl
        return True

    @staticmethod
    def release_lock(name: str) -> None:
        """Release distributed lock."""
        lock_key = f"lock:{name}"
        if settings.REDIS_URL or _redis_client:
            if _redis_client:
                try:
                    _redis_client.delete(lock_key)
                except Exception as e:
                    logger.error(f"Redis distributed lock release error for '{lock_key}': {e}")
            return

        _local_locks.pop(lock_key, None)


cache = CacheManager()
