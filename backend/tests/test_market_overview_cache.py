import unittest
from unittest.mock import patch

from backend.services import data_pipeline


class TestMarketOverviewCacheOnly(unittest.TestCase):
    def test_explicit_refresh_uses_lock_and_refreshes_snapshot(self):
        expected = {"market_status": "available"}
        with (
            patch.object(data_pipeline.cache, "acquire_lock", return_value=True) as acquire,
            patch.object(data_pipeline.cache, "release_lock") as release,
            patch.object(data_pipeline, "get_market_overview", return_value=expected) as refresh,
        ):
            result = data_pipeline.refresh_market_overview()

        self.assertEqual(result, expected)
        acquire.assert_called_once_with("market_overview_refresh", ttl=180)
        refresh.assert_called_once_with(refresh=True)
        release.assert_called_once_with("market_overview_refresh")

    def test_explicit_refresh_skips_when_another_refresh_is_running(self):
        with (
            patch.object(data_pipeline.cache, "acquire_lock", return_value=False),
            patch.object(data_pipeline, "get_market_overview") as refresh,
        ):
            result = data_pipeline.refresh_market_overview()

        self.assertEqual(result["status"], "skipped")
        refresh.assert_not_called()

    def test_cache_miss_does_not_call_upstream_providers(self):
        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.nse_client, "get_index_quote") as nse_quote,
            patch.object(data_pipeline.yf, "Ticker") as yf_ticker,
            patch.object(data_pipeline.yf, "Tickers") as yf_tickers,
        ):
            result = data_pipeline.get_market_overview()

        self.assertEqual(result["market_status"], "unavailable")
        self.assertIsNone(result["hero"]["price"])
        self.assertEqual(result["hero"]["freshness"], "OFFLINE")
        self.assertEqual(result["feed_health"]["Indices"], "OFFLINE")
        self.assertIn("last_attempted_at", result)
        self.assertIsNone(result["last_attempted_at"])
        self.assertEqual(result["macro"]["Indices"], [])
        nse_quote.assert_not_called()
        yf_ticker.assert_not_called()
        yf_tickers.assert_not_called()

    def test_stale_snapshot_is_returned_as_stale_without_provider_calls(self):
        stale = {
            "hero": {"symbol": "^NSEI", "name": "NIFTY 50", "price": 22000},
            "macro": {"Indices": [{"symbol": "^NSEI", "price": 22000}]},
            "trending": [],
            "last_updated": "2026-10-20T10:00:00+00:00",
        }

        def cached_value(namespace, key):
            return stale if key == "overview_stale" else None

        with (
            patch.object(data_pipeline.cache, "get", side_effect=cached_value),
            patch.object(data_pipeline.nse_client, "get_index_quote") as nse_quote,
            patch.object(data_pipeline.yf, "Ticker") as yf_ticker,
            patch.object(data_pipeline.yf, "Tickers") as yf_tickers,
        ):
            result = data_pipeline.get_market_overview()

        self.assertTrue(result["is_stale"])
        self.assertTrue(result["hero"]["is_stale"])
        self.assertTrue(result["macro"]["Indices"][0]["is_stale"])
        self.assertEqual(result["macro"]["Indices"][0]["freshness"], "STALE")
        self.assertEqual(result["macro"]["Indices"][0]["retrieved_at"], stale["last_updated"])
        self.assertEqual(result["feed_health"]["Indices"], "STALE")
        nse_quote.assert_not_called()
        yf_ticker.assert_not_called()
        yf_tickers.assert_not_called()


if __name__ == "__main__":
    unittest.main()
