import unittest
from unittest.mock import patch

from backend import main


class TestHealthCheck(unittest.TestCase):
    def test_cache_probe_uses_cache_manager_namespace_and_key(self):
        with (
            patch.object(main.settings, "config_errors", []),
            patch.object(main.cache, "set") as cache_set,
            patch.object(main.cache, "get", return_value="ok") as cache_get,
        ):
            result = main.health_check()

        self.assertEqual(result["status"], "healthy")
        self.assertEqual(result["dependencies"]["cache"], "ok")
        cache_set.assert_called_once_with("market", "health_check_test", "ok", ttl=1)
        cache_get.assert_called_once_with("market", "health_check_test")


if __name__ == "__main__":
    unittest.main()
