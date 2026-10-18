"""
Tests for defensive ticker.info handling to prevent AttributeError when
yfinance returns non-dictionary values.
"""
import unittest
from unittest.mock import patch, MagicMock
import yfinance as yf

from backend.services.research_pipeline import get_stock_research, _extract_peer_summary
from backend.services.relationship_engine import get_v4_intelligence
from backend.services.data_pipeline import get_stock_overview
from backend.services.deep_research import get_deep_stock_research
from backend.services.screener import get_screener_snapshot


class TestTInfoHandling(unittest.TestCase):
    """Test that services handle non-dictionary ticker.info gracefully."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_symbol = "TCS.NS"

    def test_research_pipeline_handles_non_dict_info(self):
        """Test get_stock_research handles non-dict info without AttributeError."""
        # Test cases: None, string, list, int, etc.
        test_values = [None, "string", [], 42, {"nested": "dict"}]

        for non_dict_value in test_values:
            with self.subTest(info_value=non_dict_value):
                with patch('yfinance.Ticker') as mock_ticker:
                    mock_instance = MagicMock()
                    mock_ticker.return_value = mock_instance

                    # Configure the mock to return our test value for .info
                    mock_instance.info = non_dict_value
                    mock_instance.fast_info = None

                    # Should not raise AttributeError
                    try:
                        result = get_stock_research(self.test_symbol)
                        # Should return a dict (even if empty/default data)
                        self.assertIsInstance(result, dict)
                        self.assertIn('symbol', result)
                    except AttributeError:
                        self.fail(f"get_stock_research raised AttributeError for info={non_dict_value}")

    def test_research_pipeline_peer_summary_handles_non_dict_info(self):
        """Test _extract_peer_summary handles non-dict info without AttributeError."""
        test_values = [None, "string", [], 42, {"nested": "dict"}]

        for non_dict_value in test_values:
            with self.subTest(info_value=non_dict_value):
                with patch('yfinance.Ticker') as mock_ticker:
                    mock_instance = MagicMock()
                    mock_ticker.return_value = mock_instance

                    # Configure the mock to return our test value for .info
                    mock_instance.info = non_dict_value
                    mock_instance.fast_info = None

                    # Should not raise AttributeError
                    try:
                        result = _extract_peer_summary("TEST.NS")
                        # Should return a dict with symbol at least
                        self.assertIsInstance(result, dict)
                        self.assertEqual(result['symbol'], "TEST.NS")
                    except AttributeError:
                        self.fail(f"_extract_peer_summary raised AttributeError for info={non_dict_value}")

    def test_relationship_engine_handles_non_dict_info(self):
        """Test get_v4_intelligence handles non-dict info without AttributeError."""
        test_values = [None, "string", [], 42, {"nested": "dict"}]

        for non_dict_value in test_values:
            with self.subTest(info_value=non_dict_value):
                with patch('yfinance.Ticker') as mock_ticker:
                    mock_instance = MagicMock()
                    mock_ticker.return_value = mock_instance

                    # Configure the mock to return our test value for .info
                    mock_instance.info = non_dict_value

                    # Should not raise AttributeError when accessing .info
                    try:
                        result = get_v4_intelligence(self.test_symbol)
                        # Should return a dict (even if empty/default data)
                        self.assertIsInstance(result, dict)
                        self.assertIn('symbol', result)
                    except AttributeError:
                        self.fail(f"get_v4_intelligence raised AttributeError for info={non_dict_value}")

    def test_data_pipeline_handles_non_dict_info(self):
        """Test get_stock_overview handles non-dict info without AttributeError."""
        test_values = [None, "string", [], 42, {"nested": "dict"}]

        for non_dict_value in test_values:
            with self.subTest(info_value=non_dict_value):
                with patch('yfinance.Ticker') as mock_ticker:
                    mock_instance = MagicMock()
                    mock_ticker.return_value = mock_instance

                    # Configure the mock to return our test value for .info
                    mock_instance.info = non_dict_value
                    mock_instance.fast_info = None

                    # Should not raise AttributeError
                    try:
                        result = get_stock_overview(self.test_symbol)
                        # Should return a dict (even if empty/default data)
                        self.assertIsInstance(result, dict)
                        self.assertIn('symbol', result)
                    except AttributeError:
                        self.fail(f"get_stock_overview raised AttributeError for info={non_dict_value}")

    def test_deep_research_handles_non_dict_info(self):
        """Test get_deep_stock_research handles non-dict info without AttributeError."""
        test_values = [None, "string", [], 42, {"nested": "dict"}]

        for non_dict_value in test_values:
            with self.subTest(info_value=non_dict_value):
                with patch('yfinance.Ticker') as mock_ticker:
                    mock_instance = MagicMock()
                    mock_ticker.return_value = mock_instance

                    # Configure the mock to return our test value for .info
                    mock_instance.info = non_dict_value
                    mock_instance.fast_info = {}

                    # Should not raise AttributeError
                    try:
                        result = get_deep_stock_research(self.test_symbol)
                        # Should return a dict (even if empty/default data)
                        self.assertIsInstance(result, dict)
                        self.assertIn('symbol', result)
                    except AttributeError:
                        self.fail(f"get_deep_stock_research raised AttributeError for info={non_dict_value}")

    def test_screener_handles_non_dict_info(self):
        """Test screener handles non-dict info without AttributeError."""
        test_values = [None, "string", [], 42, {"nested": "dict"}]

        for non_dict_value in test_values:
            with self.subTest(info_value=non_dict_value):
                with patch('yfinance.Tickers') as mock_tickers:
                    mock_batch = MagicMock()
                    mock_tickers.return_value = mock_batch

                    mock_ticker = MagicMock()
                    mock_batch.tickers.get.return_value = mock_ticker

                    # Configure the mock to return our test value for .info
                    mock_ticker.info = non_dict_value
                    mock_ticker.fast_info = None

                    # Should not raise AttributeError
                    try:
                        result = get_screener_snapshot("us_mega_caps")
                        # Should return a dict
                        self.assertIsInstance(result, dict)
                        self.assertIn('items', result)
                    except AttributeError:
                        self.fail(f"get_screener_snapshot raised AttributeError for info={non_dict_value}")


if __name__ == '__main__':
    unittest.main()