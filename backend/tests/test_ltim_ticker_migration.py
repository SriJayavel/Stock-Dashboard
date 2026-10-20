import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

from backend.services import data_pipeline, research_pipeline


class TestLTIMTickerMigration(unittest.TestCase):
    def test_legacy_inputs_normalize_to_canonical_symbol(self):
        for old_input in ("LTIM.NS", "LTIM", "LTIMindtree", "LTIMindtree Limited"):
            with self.subTest(old_input=old_input):
                self.assertEqual(data_pipeline.resolve_symbol(old_input), "LTM.NS")
        self.assertEqual(data_pipeline.resolve_symbol("LTM.NS"), "LTM.NS")

    def test_asset_search_redirects_legacy_name_without_searching_old_yahoo_ticker(self):
        with patch.object(data_pipeline.yf, "Search") as yahoo_search:
            results = data_pipeline.search_assets("LTIMindtree")
        self.assertEqual(results[0]["symbol"], "LTM.NS")
        self.assertEqual(results[0]["name"], "LTM Limited")
        yahoo_search.assert_not_called()

    def test_quote_and_history_requests_use_canonical_provider_symbol(self):
        ticker = MagicMock()
        ticker.info = {"shortName": "LTM LIMITED"}
        ticker.fast_info = None
        ticker.history.return_value = pd.DataFrame(
            {"Close": [5000.0, 5050.0]},
            index=pd.to_datetime(["2026-10-19", "2026-10-20"]),
        )
        with (
            patch.object(data_pipeline.cache, "get", return_value=None) as quote_cache_get,
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_equity_quote", return_value=None),
            patch.object(data_pipeline, "is_circuit_open", return_value=False),
            patch.object(data_pipeline, "record_success"),
            patch.object(data_pipeline.yf, "Ticker", return_value=ticker) as yahoo,
        ):
            overview = data_pipeline.get_stock_overview("LTIM.NS")

        yahoo.assert_called_once()
        self.assertEqual(yahoo.call_args.args[0], "LTM.NS")
        self.assertEqual(overview["symbol"], "LTM.NS")
        self.assertEqual(overview["name"], "LTM LIMITED")
        self.assertEqual(
            [call.args for call in quote_cache_get.call_args_list],
            [("overview", "LTM.NS"), ("overview_stale", "LTM.NS")],
        )

        history_ticker = MagicMock()
        dates = pd.date_range("2025-10-01", periods=250, freq="B")
        closes = [5000.0 + i for i in range(len(dates))]
        history_ticker.history.return_value = pd.DataFrame(
            {
                "Open": closes,
                "High": [v + 2 for v in closes],
                "Low": [v - 2 for v in closes],
                "Close": closes,
                "Volume": [1000] * len(dates),
            },
            index=dates,
        )
        market_status = {
            "exchange": "NSE",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "session": "CLOSED",
            "freshness": "DELAYED",
            "market_status": "CLOSED",
        }
        with (
            patch.object(data_pipeline.cache, "get", return_value=None) as history_cache_get,
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.yf, "Ticker", return_value=history_ticker) as yahoo,
            patch.object(data_pipeline, "get_instrument_market_status", return_value=market_status),
        ):
            history = data_pipeline.get_stock_history("LTIM.NS", timeframe="1y", interval="1d")
        yahoo.assert_called_once()
        self.assertEqual(yahoo.call_args.args[0], "LTM.NS")
        self.assertEqual(history["symbol"], "LTM.NS")
        self.assertTrue(history["candles"])
        self.assertEqual(history_cache_get.call_args.args, ("history", "LTM.NS_1y_1d"))

    def test_research_peer_request_uses_canonical_symbol_and_cache_key(self):
        ticker = MagicMock()
        ticker.info = {"shortName": "LTM LIMITED"}
        ticker.fast_info = {}
        with (
            patch.object(research_pipeline.cache, "get", return_value=None) as cache_get,
            patch.object(research_pipeline.cache, "set"),
            patch.object(research_pipeline.yf, "Ticker", return_value=ticker) as yahoo,
        ):
            research_pipeline._extract_peer_summary("LTIM.NS")

        cache_get.assert_called_once_with("overview", "LTM.NS")
        yahoo.assert_called_once()
        self.assertEqual(yahoo.call_args.args[0], "LTM.NS")


if __name__ == "__main__":
    unittest.main()
