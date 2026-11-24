import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.adapters.market_data.yfinance_provider import YFinanceProvider
from backend.core.services.calendar import get_calendar_for_symbol
from backend.core.services.symbol_resolver import search_assets
from backend.main import create_app


def test_global_search_keeps_exchange_listings_distinct():
    names = search_assets("ASML")
    assert [(item["symbol"], item["currency"]) for item in names[:2]] == [
        ("ASML", "USD"), ("ASML.AS", "EUR"),
    ]
    assert search_assets("nestle")[0]["symbol"] == "NESN.SW"
    assert search_assets("삼성전자")[0]["symbol"] == "005930.KS"
    assert search_assets("[") == []


def test_global_search_endpoint_and_exchange_metadata():
    response = TestClient(create_app()).get("/api/search", params={"q": "7203.T"})
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Toyota Motor"
    assert response.json()[0]["currency"] == "JPY"
    london = get_calendar_for_symbol("SHEL.L").get_session_state()
    assert (london["exchange"], london["timezone"], london["currency"], london["session"]) == (
        "LSE", "Europe/London", "GBp", "UNAVAILABLE",
    )


def test_provider_search_uses_a_single_cached_lookup(monkeypatch):
    calls = []

    def search(query, **kwargs):
        calls.append((query, kwargs))
        return SimpleNamespace(quotes=[
            {"symbol": "9988.HK", "longname": "Alibaba Group", "quoteType": "EQUITY"},
            {"symbol": "not/a/ticker", "quoteType": "EQUITY"},
        ])

    monkeypatch.setattr("backend.adapters.market_data.yfinance_provider.yf.Search", search)
    provider = YFinanceProvider()
    result = asyncio.run(provider.search_symbols("Cached Test Corporation"))
    cached = asyncio.run(provider.search_symbols("  Cached   Test Corporation  "))
    assert len(calls) == 1
    assert calls[0][1]["news_count"] == 0
    assert result == cached and len(result) == 1
    assert (result[0].symbol, result[0].exchange, result[0].currency) == ("9988.HK", "HKEX", "HKD")
