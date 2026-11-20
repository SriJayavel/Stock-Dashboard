"""
Markets API Routes - Market overview, candles, search.
Thin HTTP layer, delegates to domain services.
"""
from typing import List
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.dependencies import (
    get_market_data_dep,
    get_stock_service_dep,
    get_market_service_dep,
)
from backend.core.contracts.market_data import MarketDataProvider
from backend.features.stocks.service import StockService
from backend.features.markets.service import MarketService

router = APIRouter(prefix="/api/markets", tags=["markets"])


class BatchRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list, max_length=50)


@router.get("/overview")
async def get_market_overview(
    market_service: MarketService = Depends(get_market_service_dep),
):
    """
    Get cached market overview.
    Returns macro categories (indices, sectors, etc.) with quotes.
    """
    return await market_service.get_overview()


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
            "candles": [{**c.__dict__, "time": c.timestamp // 1000} for c in candles],
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
