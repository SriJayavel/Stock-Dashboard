"""
Unit tests for Quote object field access helpers.
Tests the frozen dataclass access patterns used in deep_research and relationship_intelligence services.
"""
import pytest
from typing import NamedTuple

from backend.features.deep_research.service import (
    _quote_price,
    _quote_volume,
    _quote_prev_close,
    _safe_float,
)
from backend.core.contracts.market_data import Quote


class MockQuote(NamedTuple):
    """Mock Quote for testing frozen dataclass access."""
    price: float
    volume: int
    prev_close: float | None


class TestQuoteHelpers:
    """Test Quote field access helper functions."""

    def test_quote_price_from_quote_object(self):
        """Test reading price from Quote frozen dataclass."""
        q = MockQuote(price=100.5, volume=10000, prev_close=99.0)
        assert _quote_price(q) == 100.5

    def test_quote_price_from_dict(self):
        """Test reading price from dict representation of Quote."""
        q = {"price": 100.5, "volume": 10000, "prev_close": 99.0}
        assert _quote_price(q) == 100.5

    def test_quote_price_none_returns_zero(self):
        """Test that None returns 0.0 for price."""
        assert _quote_price(None) == 0.0

    def test_quote_price_missing_key_returns_zero(self):
        """Test that missing price key returns 0.0."""
        q = {"volume": 10000}
        assert _quote_price(q) == 0.0

    def test_quote_price_null_value_returns_zero(self):
        """Test that null price value returns 0.0."""
        q = {"price": None, "volume": 10000}
        assert _quote_price(q) == 0.0

    def test_quote_volume_from_quote_object(self):
        """Test reading volume from Quote frozen dataclass."""
        q = MockQuote(price=100.5, volume=10000, prev_close=99.0)
        assert _quote_volume(q) == 10000

    def test_quote_volume_from_dict(self):
        """Test reading volume from dict representation."""
        q = {"price": 100.5, "volume": 10000}
        assert _quote_volume(q) == 10000

    def test_quote_volume_none_returns_zero(self):
        """Test that None returns 0.0 for volume."""
        assert _quote_volume(None) == 0.0

    def test_quote_volume_missing_key_returns_zero(self):
        """Test that missing volume key returns 0.0."""
        q = {"price": 100.5}
        assert _quote_volume(q) == 0.0

    def test_quote_prev_close_from_quote_object(self):
        """Test reading prev_close from Quote frozen dataclass."""
        q = MockQuote(price=100.5, volume=10000, prev_close=99.0)
        assert _quote_prev_close(q) == 99.0

    def test_quote_prev_close_from_dict(self):
        """Test reading prev_close from dict."""
        q = {"price": 100.5, "prev_close": 99.0}
        assert _quote_prev_close(q) == 99.0

    def test_quote_prev_close_none_returns_none(self):
        """Test that None returns None for prev_close."""
        assert _quote_prev_close(None) is None

    def test_quote_prev_close_none_value_returns_none(self):
        """Test that None prev_close value returns None."""
        q = {"price": 100.5, "prev_close": None}
        assert _quote_prev_close(q) is None

    def test_quote_prev_close_missing_key_returns_none(self):
        """Test that missing prev_close key returns None."""
        q = {"price": 100.5}
        assert _quote_prev_close(q) is None

    def test_quote_price_zero_price(self):
        """Test that 0.0 price is a valid value."""
        q = MockQuote(price=0.0, volume=10000, prev_close=99.0)
        assert _quote_price(q) == 0.0

    def test_quote_volume_zero_volume(self):
        """Test that 0 volume is a valid value."""
        q = MockQuote(price=100.5, volume=0, prev_close=99.0)
        assert _quote_volume(q) == 0


class TestSafeFloat:
    """Test _safe_float helper function."""

    def test_safe_float_with_float(self):
        """Test passing a float returns the same float."""
        assert _safe_float(100.5) == 100.5

    def test_safe_float_with_int(self):
        """Test passing an int returns a float."""
        assert _safe_float(100) == 100.0

    def test_safe_float_with_string(self):
        """Test passing a numeric string returns float."""
        assert _safe_float("100.5") == 100.5

    def test_safe_float_with_none(self):
        """Test None returns None."""
        assert _safe_float(None) is None

    def test_safe_float_with_nan(self):
        """Test NaN returns None."""
        import math
        assert _safe_float(float('nan')) is None

    def test_safe_float_with_inf(self):
        """Test infinity returns None."""
        assert _safe_float(float('inf')) is None
        assert _safe_float(float('-inf')) is None

    def test_safe_float_with_invalid_string(self):
        """Test invalid string returns None."""
        assert _safe_float("not a number") is None


class TestAnalyzeFundamentalRelationships:
    """Test analyze_fundamental_relationships function."""

    def test_returns_has_data_false_for_empty_timeline(self):
        """Test that empty timeline returns has_data=False."""
        from backend.features.relationship_intelligence.service import analyze_fundamental_relationships as afr

        result = afr([], {})
        assert result["has_data"] is False

    def test_returns_has_data_false_for_single_entry(self):
        """Test that single entry timeline returns has_data=False."""
        from backend.features.relationship_intelligence.service import analyze_fundamental_relationships as afr

        result = afr([{"fiscal_year": "2022", "source_data": {}, "calculated_metrics": {}}], {})
        assert result["has_data"] is False

    def test_calculates_cagr_correctly(self):
        """Test CAGR is calculated correctly for revenue growth."""
        from backend.features.relationship_intelligence.service import analyze_fundamental_relationships as afr

        timeline = [
            {
                "fiscal_year": "2020",
                "source_data": {"total_revenue": 100, "net_income": 10, "operating_income": 15, "gross_profit": 40},
                "calculated_metrics": {"net_margin_pct": 10, "operating_margin_pct": 15, "gross_margin_pct": 40},
            },
            {
                "fiscal_year": "2021",
                "source_data": {"total_revenue": 110, "net_income": 12, "operating_income": 18, "gross_profit": 44},
                "calculated_metrics": {"net_margin_pct": 10.9, "operating_margin_pct": 16.4, "gross_margin_pct": 40},
            },
            {
                "fiscal_year": "2022",
                "source_data": {"total_revenue": 121, "net_income": 15, "operating_income": 22, "gross_profit": 48.4},
                "calculated_metrics": {"net_margin_pct": 12.4, "operating_margin_pct": 18.2, "gross_margin_pct": 40},
            },
        ]

        result = afr(timeline, {})
        assert result["has_data"] is True

        # Revenue CAGR: (121/100)^(1/2) - 1 = 10%
        assert result["cagrs"]["revenue_cagr_pct"] == 10.0