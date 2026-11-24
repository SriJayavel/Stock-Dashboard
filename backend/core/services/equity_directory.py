"""Exchange metadata and request-free discovery for international equities."""

import json
from pathlib import Path


_path = Path(__file__).resolve().parents[3] / "frontend" / "src" / "global-equities.json"
_directory = json.loads(_path.read_text(encoding="utf-8")) if _path.is_file() else {}
MARKETS = _directory.get("markets", {})
GLOBAL_EQUITY_ALIASES = _directory.get("aliases", {})


def market_for_symbol(symbol: str):
    _, separator, suffix = symbol.upper().rpartition(".")
    return MARKETS.get(suffix) if separator else None


def _listing(record):
    symbol, name, *market = record
    exchange, country, currency, _timezone = market or market_for_symbol(symbol)
    return {
        "symbol": symbol,
        "name": name,
        "category": "Equities",
        "exchange": exchange,
        "country": country,
        "currency": currency,
    }


GLOBAL_EQUITIES = [_listing(record) for record in _directory.get("listings", [])]
