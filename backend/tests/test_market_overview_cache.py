import unittest
from unittest.mock import patch

from backend.services import data_pipeline


class TestMarketOverviewCacheOnly(unittest.TestCase):
    def test_cache_miss_does_not_call_upstream_providers(self):
        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.nse_client, "get_index_quote") as nse_quote,
            patch.object(data_pipeline.yf, "Ticker") as yf_ticker,
            patch.object(data_pipeline.yf, "Tickers") as yf_tickers,
        ):
            result = data_pipeline.get_market_overview()

        self.assertEqual(result["market_status"], "Unavailable")
        self.assertIsNone(result["hero"]["price"])
        self.assertEqual(result["macro"]["Indices"], [])
        nse_quote.assert_not_called()
        yf_ticker.assert_not_called()
        yf_tickers.assert_not_called()

    def test_stale_snapshot_is_returned_as_stale_without_provider_calls(self):
        stale = {
            "hero": {"symbol": "^NSEI", "name": "NIFTY 50", "price": 22000},
            "macro": {"Indices": [{"symbol": "^NSEI", "price": 22000}]},
            "trending": [],
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
        nse_quote.assert_not_called()
        yf_ticker.assert_not_called()
        yf_tickers.assert_not_called()


if __name__ == "__main__":
    unittest.main()
