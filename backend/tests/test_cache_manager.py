"""
Unit and Concurrency Tests for CacheManager Distributed Lock.
Covers:
1. Fail-closed behavior on Redis exceptions (never falls back to process-local dict).
2. Distributed lock semantics with Redis SETNX (NX=True, EX=ttl).
3. Concurrent multi-worker race condition simulation where only 1 worker succeeds.
4. Clean release allowing next worker to acquire.
5. Dev-only fallback when REDIS_URL is completely unconfigured.
"""
import unittest
from unittest.mock import MagicMock, patch
import time
from backend.services.cache_manager import CacheManager
from backend.config import settings

class TestDistributedLock(unittest.TestCase):
    def setUp(self):
        # Reset local locks dict
        from backend.services import cache_manager
        cache_manager._local_locks.clear()

    def test_fail_closed_on_redis_connection_error(self):
        """
        CRITICAL TEST: When Redis raises ANY exception (timeout, network blip, etc.),
        acquire_lock MUST fail closed (return False) and NEVER fall through to _local_locks.
        """
        from backend.services import cache_manager
        mock_redis = MagicMock()
        mock_redis.set.side_effect = TimeoutError("Upstash network timeout")
        
        with patch.object(cache_manager, "_redis_client", mock_redis):
            result = cache_manager.cache.acquire_lock("warming", ttl=120)
            # Must return False (fail closed)
            self.assertFalse(result, "Should return False when Redis raises an exception")
            # Must NOT touch _local_locks
            self.assertEqual(len(cache_manager._local_locks), 0, "_local_locks must remain empty")

    def test_fail_closed_when_redis_url_configured_but_client_is_none(self):
        """
        When REDIS_URL is configured in settings, but _redis_client is None (e.g. startup ping failed),
        acquire_lock MUST fail closed and NEVER silently degrade to _local_locks.
        """
        from backend.services import cache_manager
        with patch.object(settings, "REDIS_URL", "rediss://default:token@example.upstash.io:6379"):
            with patch.object(cache_manager, "_redis_client", None):
                result = cache_manager.cache.acquire_lock("warming", ttl=120)
                self.assertFalse(result, "Should fail closed when REDIS_URL is configured but client is None")
                self.assertEqual(len(cache_manager._local_locks), 0, "_local_locks must not be used")

    def test_redis_setnx_multi_worker_concurrency(self):
        """
        Simulates two Uvicorn workers (Worker A and Worker B) with separate memory spaces
        competing for the distributed lock backed by Redis SETNX.
        """
        from backend.services import cache_manager
        
        shared_redis_store = {}
        
        def mock_set(key, val, nx=False, ex=None):
            # Atomic SETNX simulation
            if nx and key in shared_redis_store:
                return None  # Key already exists
            shared_redis_store[key] = val
            return True
            
        def mock_delete(key):
            shared_redis_store.pop(key, None)
            return 1

        mock_redis = MagicMock()
        mock_redis.set.side_effect = mock_set
        mock_redis.delete.side_effect = mock_delete

        with patch.object(cache_manager, "_redis_client", mock_redis):
            # Worker A arrives first
            worker_a_acquired = cache_manager.cache.acquire_lock("warming", ttl=120)
            self.assertTrue(worker_a_acquired, "Worker A should acquire lock")
            self.assertIn("lock:warming", shared_redis_store)

            # Worker B arrives while Worker A is still executing
            worker_b_acquired = cache_manager.cache.acquire_lock("warming", ttl=120)
            self.assertFalse(worker_b_acquired, "Worker B MUST be denied lock while Worker A holds it")

            # Worker A completes and releases lock
            cache_manager.cache.release_lock("warming")
            self.assertNotIn("lock:warming", shared_redis_store)

            # Worker C arrives after release and succeeds
            worker_c_acquired = cache_manager.cache.acquire_lock("warming", ttl=120)
            self.assertTrue(worker_c_acquired, "Worker C should acquire lock after Worker A released")
            cache_manager.cache.release_lock("warming")

    def test_dev_fallback_when_redis_unconfigured(self):
        """
        When REDIS_URL is completely unconfigured (local dev),
        in-process fallback works as expected.
        """
        from backend.services import cache_manager
        with patch.object(settings, "REDIS_URL", ""):
            with patch.object(cache_manager, "_redis_client", None):
                # 1st acquire
                acq1 = cache_manager.cache.acquire_lock("test_dev", ttl=60)
                self.assertTrue(acq1)
                # 2nd concurrent acquire should fail
                acq2 = cache_manager.cache.acquire_lock("test_dev", ttl=60)
                self.assertFalse(acq2)
                # Release
                cache_manager.cache.release_lock("test_dev")
                # 3rd acquire after release
                acq3 = cache_manager.cache.acquire_lock("test_dev", ttl=60)
                self.assertTrue(acq3)
                cache_manager.cache.release_lock("test_dev")

    def test_dev_fallback_release_lock_key_alignment(self):
        """
        Verify key alignment: acquire_lock and release_lock must both use 'lock:{name}',
        ensuring release_lock immediately clears the lock without waiting for TTL expiration.
        """
        from backend.services import cache_manager
        with patch.object(settings, "REDIS_URL", ""):
            with patch.object(cache_manager, "_redis_client", None):
                lock_name = "test_align"
                expected_key = f"lock:{lock_name}"

                acquired = cache_manager.cache.acquire_lock(lock_name, ttl=300)
                self.assertTrue(acquired)
                self.assertIn(expected_key, cache_manager._local_locks)

                # release must clear using the exact same key
                cache_manager.cache.release_lock(lock_name)
                self.assertNotIn(expected_key, cache_manager._local_locks)

                # Re-acquire immediately succeeds
                re_acquired = cache_manager.cache.acquire_lock(lock_name, ttl=300)
                self.assertTrue(re_acquired)
                cache_manager.cache.release_lock(lock_name)

    def test_production_supports_missing_redis_url_with_warning(self):
        """
        Verify that Settings initializes cleanly in production even if REDIS_URL is omitted (falling back to L1 cache).
        """
        from backend.config import Settings
        prod_settings = Settings(
            ENVIRONMENT="production",
            SUPABASE_URL="https://example.supabase.co",
            SUPABASE_KEY="valid_key",
            INTERNAL_REFRESH_SECRET="valid_production_secret_token_12345",
            REDIS_URL="",
        )
        self.assertEqual(prod_settings.REDIS_URL, "")

    def test_production_succeeds_with_valid_redis_url_and_secret(self):
        """
        Verify that Settings initializes successfully in production when both secret and REDIS_URL are provided.
        """
        from backend.config import Settings
        prod_settings = Settings(
            ENVIRONMENT="production",
            INTERNAL_REFRESH_SECRET="valid_production_secret_token_12345",
            REDIS_URL="rediss://default:token@my-cluster.upstash.io:6379",
        )
        self.assertEqual(prod_settings.ENVIRONMENT, "production")
        self.assertEqual(prod_settings.REDIS_URL, "rediss://default:token@my-cluster.upstash.io:6379")


if __name__ == "__main__":
    unittest.main()
