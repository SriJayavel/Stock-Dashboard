import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

from backend.services import data_pipeline


class TestMarketBenchmarkQuotes(unittest.TestCase):
    symbols = ["^NSEI", "^BSESN", "^NSEBANK", "^GSPC", "^IXIC", "^FTSE", "^N225"]

    def test_index_history_fallback_supplies_real_price_change_and_range(self):
        tickers = {}
        for i, symbol in enumerate(self.symbols):
            ticker = MagicMock()
            ticker.fast_info = {}
            ticker.history.return_value = pd.DataFrame(
                {
                    "Close": [100.0 + i, 105.0 + i],
                    "High": [102.0 + i, 108.0 + i],
                    "Low": [99.0 + i, 103.0 + i],
                },
                index=pd.to_datetime(["2026-10-19", "2026-10-20"]),
            )
            tickers[symbol] = ticker
        batch = MagicMock()
        batch.tickers = tickers
        hero = MagicMock()
        hero.fast_info = {"last_price": 25000, "previous_close": 24900}

        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_index_quote", return_value=None),
            patch.object(data_pipeline.yf, "Ticker", return_value=hero),
            patch.object(data_pipeline.yf, "Tickers", return_value=batch),
        ):
            snapshot = data_pipeline.get_market_overview(refresh=True)

        indices = {item["symbol"]: item for item in snapshot["macro"]["Indices"]}
        self.assertEqual(set(indices), set(self.symbols))
        for offset, symbol in enumerate(self.symbols):
            with self.subTest(symbol=symbol):
                quote = indices[symbol]
                self.assertEqual(quote["price"], 105 + offset)
                self.assertEqual(quote["change"], 5)
                self.assertEqual(quote["change_pct"], round(5 / (100 + offset) * 100, 2))
                self.assertEqual(quote["high"], 108 + offset)
                self.assertEqual(quote["low"], 103 + offset)
                self.assertTrue(quote["source_timestamp"])

    def test_batch_failure_falls_back_per_symbol_and_reports_independent_health(self):
        good_ticker = MagicMock()
        good_ticker.fast_info = {
            "last_price": 105.0,
            "previous_close": 100.0,
            "day_high": 108.0,
            "day_low": 103.0,
        }
        def ticker_for_symbol(symbol, **kwargs):
            if symbol == "^GSPC":
                return good_ticker
            raise RuntimeError("provider unavailable")

        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_index_quote", return_value=None),
            patch.object(data_pipeline.yf, "Ticker", side_effect=ticker_for_symbol),
            patch.object(data_pipeline.yf, "Tickers", side_effect=RuntimeError("batch failed")),
        ):
            snapshot = data_pipeline.get_market_overview(refresh=True)

        indices = {item["symbol"]: item for item in snapshot["macro"]["Indices"]}
        self.assertEqual(set(indices), {"^GSPC"})
        self.assertEqual(indices["^GSPC"]["freshness"], "DELAYED")
        self.assertTrue(indices["^GSPC"]["retrieved_at"])
        self.assertEqual(snapshot["feed_health"]["Indices"], "DELAYED")
        self.assertEqual(snapshot["feed_health"]["Forex"], "OFFLINE")
        self.assertEqual(snapshot["feed_health"]["Commodities"], "OFFLINE")
        self.assertEqual(snapshot["feed_health"]["Crypto"], "OFFLINE")

    def test_provider_symbol_alias_is_applied_without_changing_unknown_symbols(self):
        self.assertEqual(data_pipeline.get_provider_symbol("TATAMOTORS.NS"), "TMPV.NS")
        self.assertEqual(data_pipeline.get_provider_symbol("EURUSD=X"), "EURUSD=X")

    def test_missing_previous_close_stays_unknown_not_zero_return(self):
        ticker = MagicMock()
        ticker.fast_info = {"last_price": 105}
        ticker.history.return_value = pd.DataFrame(
            {"Close": [105.0], "High": [108.0], "Low": [103.0]},
            index=pd.to_datetime(["2026-10-20"]),
        )
        batch = MagicMock()
        batch.tickers = {"^GSPC": ticker}

        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_index_quote", return_value=None),
            patch.object(data_pipeline.yf, "Ticker", return_value=MagicMock(fast_info={"last_price": 1})),
            patch.object(data_pipeline.yf, "Tickers", return_value=batch),
        ):
            snapshot = data_pipeline.get_market_overview(refresh=True)

        sp = next(item for item in snapshot["macro"]["Indices"] if item["symbol"] == "^GSPC")
        self.assertIsNone(sp["change"])
        self.assertIsNone(sp["change_pct"])

    def test_partial_batch_failure_supplements_missing_symbol_from_stale_cache(self):
        good_ticker = MagicMock()
        good_ticker.fast_info = {"last_price": 7700.0, "previous_close": 7650.0}
        batch = MagicMock()
        batch.tickers = {"^GSPC": good_ticker}  # Only ^GSPC succeeded, ^BSESN is missing

        stale_data = {
            "macro": {
                "Indices": [
                    {"symbol": "^BSESN", "name": "SENSEX", "price": 73500.0, "change": 150.0, "change_pct": 0.2, "high": 73800.0, "low": 73200.0}
                ]
            },
            "last_updated": "2026-10-21T10:00:00+00:00",
        }

        def mock_cache_get(namespace, key):
            if key == "overview_stale":
                return stale_data
            return None

        with (
            patch.object(data_pipeline.cache, "get", side_effect=mock_cache_get),
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_index_quote", return_value=None),
            patch.object(data_pipeline.yf, "Ticker", side_effect=RuntimeError("symbol unavailable")),
            patch.object(data_pipeline.yf, "Tickers", return_value=batch),
        ):
            snapshot = data_pipeline.get_market_overview(refresh=True)

        symbols = {item["symbol"] for item in snapshot["macro"]["Indices"]}
        self.assertIn("^GSPC", symbols)
        self.assertIn("^BSESN", symbols)
        bsesn = next(item for item in snapshot["macro"]["Indices"] if item["symbol"] == "^BSESN")
        self.assertTrue(bsesn["is_stale"])
        self.assertEqual(bsesn["freshness"], "STALE")
        self.assertEqual(bsesn["price"], 73500.0)

    def test_hero_direct_nse_supplies_nsei_to_macro_when_batch_omits_it(self):
        nse_quote = {
            "symbol": "^NSEI",
            "name": "NIFTY 50",
            "price": 22600.0,
            "change": 100.0,
            "change_pct": 0.44,
            "high": 22700.0,
            "low": 22500.0,
        }
        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_index_quote", return_value=nse_quote),
            patch.object(data_pipeline.yf, "Ticker", side_effect=RuntimeError("no yf")),
            patch.object(data_pipeline.yf, "Tickers", side_effect=RuntimeError("no batch")),
        ):
            snapshot = data_pipeline.get_market_overview(refresh=True)

        nsei = next((item for item in snapshot["macro"]["Indices"] if item["symbol"] == "^NSEI"), None)
        self.assertIsNotNone(nsei)
        self.assertEqual(nsei["price"], 22600.0)
        self.assertEqual(nsei["change"], 100.0)
        self.assertEqual(nsei["source"], "NSE Direct")


if __name__ == "__main__":
    unittest.main()
