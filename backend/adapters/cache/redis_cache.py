"""
Redis Cache Adapter - L2 external Redis cache implementation.
For production use with Upstash/Redis.
"""
import asyncio
import json
import logging
import time
from typing import Any, Optional, List, Dict

import redis.asyncio as redis
from redis.exceptions import RedisError

from backend.core.contracts.cache import CacheProtocol, LockProtocol, CacheNamespaces
from backend.config import settings

logger = logging.getLogger("redis_cache")


class RedisCache:
    """
    Async Redis cache with connection pooling.
    Implements CacheProtocol for L2 caching.
    """

    def __init__(self, redis_url: Optional[str] = None):
        self._redis_url = redis_url or settings.REDIS_URL
        self._pool: Optional[redis.ConnectionPool] = None
        self._client: Optional[redis.Redis] = None
        self._local_cache = None  # Will be set via DI

    async def connect(self) -> None:
        """Initialize connection pool."""
        if self._client is not None:
            return

        if not self._redis_url:
            raise RuntimeError("Redis URL not configured")

        self._pool = redis.ConnectionPool.from_url(
            self._redis_url,
            decode_responses=True,
            max_connections=20,
            socket_timeout=3,
            socket_connect_timeout=3,
        )
        self._client = redis.Redis(connection_pool=self._pool)

        # Test connection
        await self._client.ping()
        logger.info("Redis cache connected successfully")

    async def close(self) -> None:
        """Close connections."""
        if self._client:
            await self._client.close()
        if self._pool:
            await self._pool.disconnect()
        self._client = None
        self._pool = None

    def _key(self, namespace: str, key: str) -> str:
        return f"{namespace}:{key}"

    async def get(self, namespace: str, key: str) -> Optional[Any]:
        if not self._client:
            return None
        try:
            raw = await self._client.get(self._key(namespace, key))
            if raw:
                return json.loads(raw)
        except RedisError as e:
            logger.debug(f"Redis get failed for {namespace}:{key}: {e}")
        except json.JSONDecodeError as e:
            logger.warning(f"Redis value not valid JSON for {namespace}:{key}: {e}")
        return None

    async def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        if not self._client:
            return
        try:
            payload = json.dumps(value, default=str)
            effective_ttl = ttl or 1800
            await self._client.setex(self._key(namespace, key), effective_ttl, payload)
        except RedisError as e:
            logger.debug(f"Redis set failed for {namespace}:{key}: {e}")

    async def delete(self, namespace: str, key: str) -> None:
        if not self._client:
            return
        try:
            await self._client.delete(self._key(namespace, key))
        except RedisError as e:
            logger.debug(f"Redis delete failed for {namespace}:{key}: {e}")

    async def exists(self, namespace: str, key: str) -> bool:
        if not self._client:
            return False
        try:
            return await self._client.exists(self._key(namespace, key)) > 0
        except RedisError:
            return False

    async def clear_namespace(self, namespace: str) -> None:
        if not self._client:
            return
        try:
            pattern = f"{namespace}:*"
            cursor = 0
            while True:
                cursor, keys = await self._client.scan(cursor, match=pattern, count=100)
                if keys:
                    await self._client.delete(*keys)
                if cursor == 0:
                    break
        except RedisError as e:
            logger.debug(f"Redis clear_namespace failed for {namespace}: {e}")

    async def get_many(self, namespace: str, keys: List[str]) -> Dict[str, Any]:
        if not self._client or not keys:
            return {}
        try:
            redis_keys = [self._key(namespace, k) for k in keys]
            values = await self._client.mget(redis_keys)
            result = {}
            for k, v in zip(keys, values):
                if v:
                    try:
                        result[k] = json.loads(v)
                    except json.JSONDecodeError:
                        pass
            return result
        except RedisError as e:
            logger.debug(f"Redis get_many failed for {namespace}: {e}")
            return {}

    async def set_many(self, namespace: str, mapping: Dict[str, Any], ttl: Optional[int] = None) -> None:
        if not self._client or not mapping:
            return
        try:
            effective_ttl = ttl or 1800
            pipe = self._client.pipeline()
            for k, v in mapping.items():
                payload = json.dumps(v, default=str)
                pipe.setex(self._key(namespace, k), effective_ttl, payload)
            await pipe.execute()
        except RedisError as e:
            logger.debug(f"Redis set_many failed for {namespace}: {e}")


class RedisLock:
    """Redis-based distributed lock using SETNX with TTL."""

    def __init__(self, redis_cache: RedisCache):
        self._redis = redis_cache

    async def acquire(self, key: str, ttl: int = 30) -> bool:
        if not self._redis._client:
            return False
        try:
            lock_key = f"lock:{key}"
            # SET key value NX EX ttl
            result = await self._redis._client.set(
                lock_key, "1", nx=True, ex=ttl
            )
            return result is True
        except RedisError:
            return False

    async def release(self, key: str) -> None:
        if not self._redis._client:
            return
        try:
            lock_key = f"lock:{key}"
            await self._redis._client.delete(lock_key)
        except RedisError:
            pass

    async def extend(self, key: str, ttl: int) -> bool:
        if not self._redis._client:
            return False
        try:
            lock_key = f"lock:{key}"
            # Only extend if we own it (simplified - in prod use Lua script)
            result = await self._redis._client.expire(lock_key, ttl)
            return result
        except RedisError:
            return False


# Hybrid cache that combines L1 (memory) + L2 (Redis)
class HybridCache:
    """
    Two-tier cache: L1 Memory (fast) + L2 Redis (persistent).
    Always checks L1 first to save Redis commands.
    """

    def __init__(
        self,
        l1_cache: "MemoryCache",
        l2_cache: Optional[RedisCache] = None,
    ):
        self._l1 = l1_cache
        self._l2 = l2_cache
        self._l2_enabled = l2_cache is not None

    async def get(self, namespace: str, key: str) -> Optional[Any]:
        # L1 first
        value = await self._l1.get(namespace, key)
        if value is not None:
            return value

        # L2 fallback
        if self._l2_enabled and self._l2:
            value = await self._l2.get(namespace, key)
            if value is not None:
                # Hydrate L1
                await self._l1.set(namespace, key, value)
                return value

        return None

    async def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        # Write to both
        await self._l1.set(namespace, key, value, ttl)
        if self._l2_enabled and self._l2:
            await self._l2.set(namespace, key, value, ttl)

    async def delete(self, namespace: str, key: str) -> None:
        await self._l1.delete(namespace, key)
        if self._l2_enabled and self._l2:
            await self._l2.delete(namespace, key)

    async def exists(self, namespace: str, key: str) -> bool:
        if await self._l1.exists(namespace, key):
            return True
        if self._l2_enabled and self._l2:
            return await self._l2.exists(namespace, key)
        return False

    async def clear_namespace(self, namespace: str) -> None:
        await self._l1.clear_namespace(namespace)
        if self._l2_enabled and self._l2:
            await self._l2.clear_namespace(namespace)

    async def get_many(self, namespace: str, keys: List[str]) -> Dict[str, Any]:
        # Get from L1
        l1_result = await self._l1.get_many(namespace, keys)

        # Find missing keys
        missing = [k for k in keys if k not in l1_result]

        if missing and self._l2_enabled and self._l2:
            l2_result = await self._l2.get_many(namespace, missing)
            # Hydrate L1
            for k, v in l2_result.items():
                await self._l1.set(namespace, k, v)
            l1_result.update(l2_result)

        return l1_result

    async def set_many(self, namespace: str, mapping: Dict[str, Any], ttl: Optional[int] = None) -> None:
        await self._l1.set_many(namespace, mapping, ttl)
        if self._l2_enabled and self._l2:
            await self._l2.set_many(namespace, mapping, ttl)