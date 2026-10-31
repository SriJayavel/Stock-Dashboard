"""
Markets API Routes - Market overview, candles, search.
Thin HTTP layer, delegates to domain services.
"""
from typing import Optional, List
from fastapi import APIRouter, Query, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from backend.api.dependencies import (
    get_cache_dep,
    get_market_data_dep,
    get_stock_service_dep,
    get_market_service_dep,
)
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider
from backend.features.stocks.service import StockService
from backend.features.markets.service import MarketService

router = APIRouter(prefix="/api/markets", tags=["markets"])


class BatchRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list, max_length=50)


@router.get("/overview")
async def get_market_overview(
    background_tasks: BackgroundTasks,
    market_service: MarketService = Depends(get_market_service_dep),
):
    """
    Get cached market overview.
    Returns macro categories (indices, sectors, etc.) with quotes.
    """
    data = await market_service.get_overview()

    # Check if we should trigger background refresh
    if data.get("market_status") == "unavailable" and not data.get("is_stale"):
        background_tasks.add_task(refresh_market_overview_background)

    return data


async def refresh_market_overview_background():
    """Background task to refresh market overview."""
    from backend.core.contracts.events import emit_market_data_updated
    from backend.api.dependencies import get_container
    import logging

    logger = logging.getLogger(__name__)
    try:
        container = get_container()
        market_service = container.market_service()
        data = await market_service.refresh()

        if data and data.get("data"):
            overview_data = data["data"]
            for category, items in overview_data.get("macro", {}).items():
                for item in items:
                    if item.get("symbol"):
                        await emit_market_data_updated(item["symbol"], item)
            if overview_data.get("hero"):
                await emit_market_data_updated(overview_data["hero"]["symbol"], overview_data["hero"])
    except Exception as e:
        logger.error(f"Background refresh failed: {e}")


@router.post("/stocks/batch")
async def get_batch_stocks(
    payload: BatchRequest,
    stock_service: StockService = Depends(get_stock_service_dep),
):
    """
    CACHE-ONLY batch endpoint.
    Returns cached quotes, marks missing as 'pending'.
    Uses new StockService.
    """
    if not payload.symbols:
        return {"results": []}

    results = await stock_service.get_batch_overview(payload.symbols)
    return {"results": results}


@router.get("/candles")
async def get_market_candles(
    symbol: str = Query(..., description="Asset ticker (e.g., AAPL, TCS.NS)"),
    interval: str = Query("1m", pattern="^(1m|5m|15m|30m|1h|1d|1wk|1mo)$"),
    range: str = Query("1d", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|max|ytd)$"),
    market_data: MarketDataProvider = Depends(get_market_data_dep),
):
    """Get market candles (OHLCV) formatted for TradingView."""
    try:
        candles = await market_data.get_history(symbol, interval, range)
        return {
            "symbol": symbol,
            "interval": interval,
            "range": range,
            "candles": [c.__dict__ for c in candles],
            "count": len(candles),
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch candles: {e}")


@router.get("/search")
async def search_assets(
    q: str = Query("", min_length=0),
    limit: int = Query(20, le=50),
    market_data: MarketDataProvider = Depends(get_market_data_dep),
):
    """Search assets by symbol or name."""
    if not q:
        return {"query": q, "results": []}

    results = await market_data.search_symbols(q, limit)
    return {
        "query": q,
        "results": [r.__dict__ for r in results]
    }