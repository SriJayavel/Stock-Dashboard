import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

from backend.services import data_pipeline


class TestTickerResolution(unittest.TestCase):
    def test_tata_motors_legacy_symbol_maps_only_at_provider_boundary(self):
        self.assertEqual(data_pipeline.resolve_symbol("TATAMOTORS.NS"), "TATAMOTORS.NS")
        self.assertEqual(
            data_pipeline.get_provider_symbol("TATAMOTORS.NS"), "TMPV.NS"
        )
        for symbol in ("TCS.NS", "RELIANCE.NS", "INFY.NS"):
            with self.subTest(symbol=symbol):
                self.assertEqual(data_pipeline.resolve_symbol(symbol), symbol)
                self.assertEqual(data_pipeline.get_provider_symbol(symbol), symbol)

    def test_overview_uses_history_when_quote_summary_is_unavailable(self):
        ticker = MagicMock()
        ticker.info = {}
        ticker.fast_info = None
        ticker.history.return_value = pd.DataFrame(
            {"Close": [800.0]}, index=pd.to_datetime(["2026-10-19"])
        )
        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.cache, "set"),
            patch.object(data_pipeline.nse_client, "get_equity_quote", return_value=None),
            patch.object(data_pipeline, "is_circuit_open", return_value=False),
            patch.object(data_pipeline, "record_success"),
            patch.object(data_pipeline.yf, "Ticker", return_value=ticker) as yahoo,
        ):
            result = data_pipeline.get_stock_overview("TATAMOTORS.NS")

        yahoo.assert_called_once()
        self.assertEqual(yahoo.call_args.args[0], "TMPV.NS")
        self.assertEqual(result["symbol"], "TATAMOTORS.NS")
        self.assertEqual(result["provider_symbol"], "TMPV.NS")
        self.assertEqual(result["current_price"], 800.0)

    def test_overview_does_not_cache_or_invent_price_when_all_sources_empty(self):
        ticker = MagicMock()
        ticker.info = {}
        ticker.fast_info = None
        ticker.history.return_value = pd.DataFrame()
        with (
            patch.object(data_pipeline.cache, "get", return_value=None),
            patch.object(data_pipeline.cache, "set") as cache_set,
            patch.object(data_pipeline.nse_client, "get_equity_quote", return_value=None),
            patch.object(data_pipeline, "is_circuit_open", return_value=False),
            patch.object(data_pipeline, "record_success"),
            patch.object(data_pipeline.yf, "Ticker", return_value=ticker),
        ):
            with self.assertRaises(data_pipeline.InstrumentUnavailableError):
                data_pipeline.get_stock_overview("INVALIDTICKER.NS")
        cache_set.assert_not_called()


if __name__ == "__main__":
    unittest.main()
