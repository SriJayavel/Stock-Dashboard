"""
Symbol Resolution & Asset Discovery
Canonical symbol mapping, aliases, universe definitions, and instant search.
Pure domain logic - no external I/O.
"""

import os
import logging
import unicodedata
from typing import Optional, List, Dict, Any

import pandas as pd

from backend.config import settings
from backend.core.services.equity_directory import GLOBAL_EQUITIES, GLOBAL_EQUITY_ALIASES

logger = logging.getLogger(__name__)


# Canonical symbols accepted by the API may differ from Yahoo's current
# provider symbols after corporate actions. Keep this mapping in one place.
PROVIDER_SYMBOL_ALIASES: Dict[str, str] = {
    "TATAMOTORS.NS": "TMPV.NS",
}


# Comprehensive Pre-defined Asset Universe for Instant Discovery
POPULAR_UNIVERSE: List[Dict[str, Any]] = [
    # Benchmark Indices
    {"symbol": "^NSEI", "name": "NIFTY 50", "category": "Indices", "exchange": "NSE", "country": "IN"},
    {"symbol": "^BSESN", "name": "BSE SENSEX", "category": "Indices", "exchange": "BSE", "country": "IN"},
    {"symbol": "^NSEBANK", "name": "BANK NIFTY", "category": "Indices", "exchange": "NSE", "country": "IN"},
    {"symbol": "^GSPC", "name": "S&P 500", "category": "Indices", "exchange": "US", "country": "US"},
    {"symbol": "^IXIC", "name": "NASDAQ", "category": "Indices", "exchange": "US", "country": "US"},
    {"symbol": "^DJI", "name": "Dow Jones", "category": "Indices", "exchange": "US", "country": "US"},
    {"symbol": "^FTSE", "name": "FTSE 100", "category": "Indices", "exchange": "LSE", "country": "UK"},
    {"symbol": "^N225", "name": "Nikkei 225", "category": "Indices", "exchange": "TSE", "country": "JP"},

    # Major Forex Pairs
    {"symbol": "EURUSD=X", "name": "EUR / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDJPY=X", "name": "USD / JPY", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "GBPUSD=X", "name": "GBP / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDCHF=X", "name": "USD / CHF", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "AUDUSD=X", "name": "AUD / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDCAD=X", "name": "USD / CAD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "NZDUSD=X", "name": "NZD / USD", "category": "Forex", "exchange": "Forex", "country": "Global"},
    {"symbol": "USDINR=X", "name": "USD / INR", "category": "Forex", "exchange": "Forex", "country": "Global"},

    # Commodities
    {"symbol": "GC=F", "name": "Gold", "category": "Commodities", "exchange": "COMEX", "country": "Global"},
    {"symbol": "SI=F", "name": "Silver", "category": "Commodities", "exchange": "COMEX", "country": "Global"},
    {"symbol": "CL=F", "name": "Crude Oil", "category": "Commodities", "exchange": "NYMEX", "country": "Global"},

    # Cryptocurrencies
    {"symbol": "BTC-USD", "name": "Bitcoin", "category": "Crypto", "exchange": "Crypto", "country": "Global"},
    {"symbol": "ETH-USD", "name": "Ethereum", "category": "Crypto", "exchange": "Crypto", "country": "Global"},
    {"symbol": "SOL-USD", "name": "Solana", "category": "Crypto", "exchange": "Crypto", "country": "Global"},

    # Major Indian Equities
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "INFY.NS", "name": "Infosys", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "SBIN.NS", "name": "State Bank of India", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "ITC.NS", "name": "ITC Limited", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "LT.NS", "name": "Larsen & Toubro", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "LTM.NS", "name": "LTM Limited", "category": "Equities", "exchange": "NSE", "country": "IN"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors", "category": "Equities", "exchange": "NSE", "country": "IN"},

    # Major US Tech Equities
    {"symbol": "NVDA", "name": "NVIDIA", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "AAPL", "name": "Apple", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "MSFT", "name": "Microsoft", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "GOOGL", "name": "Alphabet (Google)", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "AMZN", "name": "Amazon", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "META", "name": "Meta Platforms", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
    {"symbol": "TSLA", "name": "Tesla", "category": "Equities", "exchange": "NASDAQ", "country": "US"},
]


_COMPANIES_DF: Optional[pd.DataFrame] = None


def get_companies_catalog() -> pd.DataFrame:
    """Load local NSE companies catalog (cached)."""
    global _COMPANIES_DF
    if _COMPANIES_DF is None:
        csv_path = settings.COMPANIES_CSV_PATH
        if os.path.exists(csv_path):
            try:
                _COMPANIES_DF = pd.read_csv(csv_path)
            except Exception as e:
                logger.error(f"Failed to load companies.csv from {csv_path}: {e}")
                _COMPANIES_DF = pd.DataFrame(columns=["SYMBOL", "NAME OF COMPANY"])
        else:
            logger.warning(f"Companies catalog not found at {csv_path}")
            _COMPANIES_DF = pd.DataFrame(columns=["SYMBOL", "NAME OF COMPANY"])
    return _COMPANIES_DF


def get_provider_symbol(symbol: str) -> str:
    """Translate a canonical symbol to the provider-specific Yahoo symbol."""
    return PROVIDER_SYMBOL_ALIASES.get(symbol, symbol)


def resolve_symbol(query: str) -> str:
    """
    Resolve aliases and standard query formats into clean tickers.
    Pure function - no I/O, no side effects.
    """
    if not query:
        return "TCS.NS"
    cleaned = query.strip()
    upper = cleaned.upper()

    aliases = {
        # Yahoo Finance retired LTIM.NS; normalize legacy input before any
        # cache lookup or provider request so all services share one identity.
        "LTIM": "LTIM.NS",
        "LTIM.NS": "LTIM.NS",
        "LTIMINDTREE": "LTIM.NS",
        "LTIMINDTREE LIMITED": "LTIM.NS",
        "NIFTY": "^NSEI",
        "NIFTY50": "^NSEI",
        "NIFTY 50": "^NSEI",
        "SENSEX": "^BSESN",
        "BANKNIFTY": "^NSEBANK",
        "BANK NIFTY": "^NSEBANK",
        "SP500": "^GSPC",
        "S&P 500": "^GSPC",
        "NASDAQ": "^IXIC",
        "DOW": "^DJI",
        "BTC": "BTC-USD",
        "BITCOIN": "BTC-USD",
        "ETH": "ETH-USD",
        "ETHEREUM": "ETH-USD",
        "SOL": "SOL-USD",
        "GOLD": "GC=F",
        "SILVER": "SI=F",
        "CRUDE": "CL=F",
        "OIL": "CL=F",
        "BRK.B": "BRK-B",
    }
    if upper in aliases:
        return aliases[upper]

    # Forex pair standard checks (supports EUR/USD, EUR-USD, EUR USD, EURUSD, etc.)
    compact = upper.replace("/", "").replace("-", "").replace(" ", "").replace("_", "")
    forex_pairs = {
        "EURUSD", "USDJPY", "GBPUSD", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "USDINR",
        "EURGBP", "EURJPY", "GBPJPY", "EURCHF", "AUDJPY", "CADJPY",
    }
    if compact in forex_pairs or (compact.endswith("=X") and compact[:-2] in forex_pairs):
        return f"{compact.replace('=X', '')}=X"

    if any(ch in upper for ch in [".", "^", "=", "-"]):
        return upper

    if any(item["symbol"] == upper for item in [*POPULAR_UNIVERSE, *GLOBAL_EQUITIES]):
        return upper

    # Check local Indian catalog
    cat = get_companies_catalog()
    if not cat.empty and "SYMBOL" in cat.columns:
        if upper in cat["SYMBOL"].values:
            return f"{upper}.NS"

    return upper


def _search_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold().replace("’", "'"))
    return "".join(char for char in text if not unicodedata.combining(char))


def search_assets(query: str) -> List[Dict[str, Any]]:
    """Rank the local directory without fetching quotes or using the network."""
    if not query or len(query.strip()) < 1:
        return POPULAR_UNIVERSE[:12]

    q_clean = query.strip()
    resolved_query = resolve_symbol(q_clean)
    if resolved_query != q_clean.upper():
        canonical_match = next(
            (item for item in POPULAR_UNIVERSE if item["symbol"] == resolved_query),
            None,
        )
        if canonical_match:
            return [canonical_match]

    q = _search_text(q_clean)
    candidates = POPULAR_UNIVERSE + GLOBAL_EQUITIES
    cat = get_companies_catalog()
    if not cat.empty and {"SYMBOL", "NAME OF COMPANY"}.issubset(cat.columns):
        ticker = q_clean.upper().removesuffix(".NS")
        hits = cat[
            cat["SYMBOL"].str.contains(ticker, case=False, na=False, regex=False)
            | cat["NAME OF COMPANY"].str.contains(q_clean, case=False, na=False, regex=False)
        ]
        candidates += [
            {"symbol": f"{symbol}.NS", "name": name if isinstance(name, str) else symbol,
             "category": "Equities", "exchange": "NSE", "country": "IN", "currency": "INR"}
            for symbol, name in hits[["SYMBOL", "NAME OF COMPANY"]].itertuples(index=False, name=None)
        ]

    def rank(item):
        symbol = item["symbol"].casefold()
        name = _search_text(item["name"])
        if symbol == q:
            return 0
        if symbol.split(".")[0] == q or name == q or q in aliases_for(item):
            return 1
        if symbol.startswith(q) or name.startswith(q):
            return 2
        return 3

    def aliases_for(item):
        return [_search_text(alias) for alias in GLOBAL_EQUITY_ALIASES.get(item["symbol"], [])]

    matches = {
        item["symbol"]: item for item in reversed(candidates)
        if q in item["symbol"].casefold() or q in _search_text(item["name"])
        or any(q in alias for alias in aliases_for(item))
    }
    return sorted(matches.values(), key=lambda item: (rank(item), item["symbol"]))[:20]


def get_popular_universe() -> List[Dict[str, Any]]:
    """Get the full popular universe list."""
    return POPULAR_UNIVERSE.copy()
