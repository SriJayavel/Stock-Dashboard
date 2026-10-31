"""
Stocks Feature - Service Implementation
Business logic for stock data using clean architecture protocols.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from backend.core.contracts.market_data import MarketDataProvider
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.events import EventBusProtocol
from backend.core.services import (
    resolve_symbol,
    search_assets,
    get_popular_universe,
    get_provider_symbol,
    apply_all_indicators,
    generate_technical_observations,
    build_lightweight_charts_payload,
    get_range_note,
    calculate_dynamic_ttl,
    get_calendar_for_symbol,
)

logger = logging.getLogger(__name__)


class StockService:
    """
    Stock data service using dependency-injected protocols.
    Zero direct external dependencies - all through protocols.
    """

    def __init__(
        self,
        market_data: MarketDataProvider,
        cache: CacheProtocol,
        event_bus: Optional[EventBusProtocol] = None,
    ):
        self._market_data = market_data
        self._cache = cache
        self._event_bus = event_bus

    async def get_overview(self, symbol: str) -> Dict[str, Any]:
        """
        Get comprehensive stock overview.
        Uses MarketDataProvider protocol for data fetching.
        """
        sym = resolve_symbol(symbol)
        provider_sym = get_provider_symbol(sym)

        # Check cache first
        cached = await self._cache.get("stock:overview", sym)
        if cached:
            return cached

        # Check stale cache
        stale_cached = await self._cache.get("stock:overview_stale", sym)

        # Fetch from market data provider
        try:
            quote = await self._market_data.get_quote(provider_sym)
            asset_info = await self._market_data.get_asset_info(provider_sym)
        except Exception as e:
            logger.warning(f"Market data fetch failed for {sym}: {e}")
            if stale_cached:
                stale = dict(stale_cached)
                stale["is_stale"] = True
                return stale
            raise

        if not quote:
            if stale_cached:
                stale = dict(stale_cached)
                stale["is_stale"] = True
                return stale
            raise ValueError(f"No quote available for {sym}")

        # Build overview response
        overview = {
            "symbol": sym,
            "name": asset_info.name if asset_info else sym,
            "asset_type": asset_info.asset_type if asset_info else "EQUITY",
            "current_price": quote.price,
            "prev_close": quote.prev_close,
            "change": quote.change,
            "change_pct": quote.change_pct,
            "currency": asset_info.currency if asset_info else "USD",
            "currency_symbol": self._get_currency_symbol(asset_info.currency if asset_info else "USD"),
            "market_cap": quote.market_cap,
            "market_cap_str": self._format_market_cap(quote.market_cap, asset_info.currency if asset_info else "USD"),
            "sector": asset_info.sector if asset_info else "General",
            "industry": asset_info.industry if asset_info else "Market Asset",
            "summary": asset_info.description if asset_info else "Financial asset live market tracking and valuation terminal.",
            "website": asset_info.website if asset_info else "",
            "pe_trailing": quote.pe_trailing,
            "pe_forward": quote.pe_forward,
            "pb_ratio": quote.pb_ratio,
            "ev_ebitda": quote.ev_ebitda,
            "peg_ratio": quote.peg_ratio,
            "dividend_yield": quote.dividend_yield,
            "high_52w": quote.high_52w,
            "low_52w": quote.low_52w,
            "roe": quote.roe,
            "roa": quote.roa,
            "profit_margin": quote.profit_margin,
            "debt_to_equity": quote.debt_to_equity,
            "current_ratio": quote.current_ratio,
            "target_mean": quote.target_mean,
            "recommendation": quote.recommendation or "",
            "volume": quote.volume,
            "avg_volume": quote.avg_volume,
            "exchange": asset_info.exchange if asset_info else "US",
            "exchange_timezone": asset_info.timezone if asset_info else "America/New_York",
            "data_source": "Composite Provider",
            "is_stale": False,
            "last_updated": (
                quote.timestamp.isoformat() if hasattr(quote.timestamp, 'isoformat')
                else (datetime.fromtimestamp(quote.timestamp / 1000).isoformat() if quote.timestamp else "")
            ),
            "provider_symbol": provider_sym,
        }

        # Cache the result
        await self._cache.set("stock:overview", sym, overview, ttl=300)
        await self._cache.set("stock:overview_stale", sym, overview, ttl=604800)  # 7 days

        return overview

    async def get_history(
        self,
        symbol: str,
        timeframe: str = "max",
        interval: str = "1d",
    ) -> Dict[str, Any]:
        """
        Get historical OHLCV data with technical indicators.
        Returns TradingView Lightweight Charts compatible format.
        """
        sym = resolve_symbol(symbol)
        provider_sym = get_provider_symbol(sym)
        cache_key = f"{sym}_{timeframe}_{interval}"

        # Check cache
        cached = await self._cache.get("stock:history", cache_key)
        if cached:
            return cached

        # Fetch from market data provider
        try:
            candles = await self._market_data.get_history(
                provider_sym, interval=interval, range_=timeframe
            )
        except Exception as e:
            logger.warning(f"Candles fetch failed for {sym}: {e}")
            # Return empty structure
            return self._empty_history_response(sym, timeframe, interval)

        if not candles:
            return self._empty_history_response(sym, timeframe, interval)

        # Convert to DataFrame for indicator calculation
        import pandas as pd
        df = pd.DataFrame([{
            "Date": c.timestamp if isinstance(c.timestamp, str) else c.timestamp,
            "Open": c.open,
            "High": c.high,
            "Low": c.low,
            "Close": c.close,
            "Volume": c.volume,
        } for c in candles])

        # Ensure Date column is datetime
        df["Date"] = pd.to_datetime(df["Date"])

        # Apply indicators
        df = apply_all_indicators(df)
        observations = generate_technical_observations(df)

        # Get market status for freshness
        cal = get_calendar_for_symbol(sym)
        session_info = cal.get_session_state()
        session = session_info["session"]

        # Determine freshness
        if session in ["OPEN", "PRE_MARKET", "POST_MARKET"]:
            freshness = "DELAYED"
        else:
            freshness = "CACHED"

        is_intraday = interval in ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]

        # Build TradingView payload
        payload = build_lightweight_charts_payload(
            df=df,
            symbol=sym,
            timeframe=timeframe,
            interval=interval,
            exchange=session_info["exchange"],
            exchange_timezone=session_info["timezone"],
            currency=session_info["currency"],
            market_status=session,
            freshness=freshness,
            observations=observations,
            data_source="Composite Provider",
            range_note=get_range_note(interval),
        )

        # Cache with dynamic TTL
        ttl = calculate_dynamic_ttl(is_intraday, session, 1800)
        await self._cache.set("stock:history", cache_key, payload, ttl=ttl)

        return payload

    async def get_batch_overview(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """
        Get batch stock overview - CACHE ONLY.
        Never blocks on live upstream fetches.
        """
        results = []
        sanitized_symbols = [str(s).strip() for s in symbols if s][:50]

        for raw_sym in sanitized_symbols:
            sym = resolve_symbol(raw_sym)
            cached = await self._cache.get("stock:overview", sym)

            if cached:
                item = dict(cached)
                item["status"] = "cached"
                results.append(item)
            else:
                # Mark as pending for background warmer
                results.append({
                    "symbol": sym,
                    "name": sym,
                    "status": "pending",
                    "current_price": None,
                    "change": None,
                    "change_pct": None,
                    "currency_symbol": "₹" if sym.endswith(".NS") or sym.endswith(".BO") else "$",
                    "market_cap_str": "—",
                    "message": "Asset quote is queued for scheduled cache warmup.",
                })

        return results

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search assets by query."""
        return search_assets(query)

    async def get_popular_universe(self) -> List[Dict[str, Any]]:
        """Get popular universe for discovery."""
        return get_popular_universe()

    def _empty_history_response(self, symbol: str, timeframe: str, interval: str) -> Dict[str, Any]:
        """Return empty history response structure."""
        cal = get_calendar_for_symbol(symbol)
        session_info = cal.get_session_state()
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "interval": interval,
            "candles": [],
            "volume": [],
            "indicators": {},
            "observations": [],
            "technical_snapshot": {},
            "exchange": session_info["exchange"],
            "exchange_timezone": session_info["timezone"],
            "currency": session_info["currency"],
            "market_status": session_info["session"],
            "freshness": "unavailable",
            "data_source": "Composite Provider",
            "message": f"{interval} data unavailable for {symbol}",
            "last_updated": "",
            "latest_quote": None,
        }

    def _get_currency_symbol(self, currency: str) -> str:
        symbols = {
            "INR": "₹", "USD": "$", "EUR": "€", "GBP": "£",
            "JPY": "¥", "CAD": "CA$", "AUD": "A$", "CHF": "CHF",
        }
        return symbols.get(currency.upper(), f"{currency} ")

    def _format_market_cap(self, mcap: Optional[float], currency: str) -> str:
        if not mcap or mcap <= 0:
            return "—"
        curr_sym = self._get_currency_symbol(currency)
        if currency == "INR":
            cr_val = mcap / 1e7
            return f"₹{cr_val:,.1f} Cr"
        if mcap >= 1e12:
            return f"{curr_sym}{mcap/1e12:.2f}T"
        if mcap >= 1e9:
            return f"{curr_sym}{mcap/1e9:.2f}B"
        return f"{curr_sym}{mcap/1e6:.1f}M"