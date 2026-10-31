"""
Stocks API Routes - Individual stock data, research, analytics.
Uses new clean architecture with StockService.
"""
from typing import Optional, List
from fastapi import APIRouter, Query, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from backend.api.dependencies import (
    get_stock_service_dep,
    get_market_data_dep,
    get_research_service_dep,
    get_deep_research_service_dep,
    get_relationship_intelligence_service_dep,
)
from backend.features.stocks.service import StockService
from backend.features.research.service import ResearchService
from backend.features.deep_research.service import DeepResearchService
from backend.features.relationship_intelligence.service import RelationshipIntelligenceService
from backend.core.contracts.market_data import MarketDataProvider

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


class CorrelationRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)
    period: str = "1y"


class PortfolioPosition(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    weight: float = Field(default=1, gt=0, le=100)


class PortfolioRiskRequest(BaseModel):
    positions: list[PortfolioPosition] = Field(default_factory=list, max_length=20)
    period: str = "1y"


@router.get("/{symbol:path}/overview")
async def get_stock_overview(
    symbol: str = Path(..., description="Stock symbol"),
    stock_service: StockService = Depends(get_stock_service_dep),
):
    """Get stock overview with valuation metrics."""
    try:
        overview = await stock_service.get_overview(symbol)
        if not overview:
            raise HTTPException(404, f"No data for {symbol}")
        return overview
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch overview: {e}")


@router.get("/{symbol:path}/history")
async def get_stock_history(
    symbol: str = Path(..., description="Stock symbol"),
    timeframe: str = Query("max", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|max|ytd|all)$"),
    interval: str = Query("1d", pattern="^(1m|5m|15m|30m|1h|1d|1wk|1mo)$"),
    stock_service: StockService = Depends(get_stock_service_dep),
):
    """Get historical candles with indicators."""
    try:
        clean_tf = timeframe.lower().replace("all", "max")
        history = await stock_service.get_history(symbol, clean_tf, interval)
        return history
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch history: {e}")


@router.get("/{symbol:path}/research")
async def get_stock_research(
    symbol: str = Path(..., description="Stock symbol"),
    research_service: ResearchService = Depends(get_research_service_dep),
):
    """Get institutional research dossier."""
    try:
        return await research_service.get_stock_research(symbol)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch research: {e}")


@router.get("/{symbol:path}/deep-research")
async def get_deep_research(
    symbol: str = Path(..., description="Stock symbol"),
    deep_research_service: DeepResearchService = Depends(get_deep_research_service_dep),
):
    """Get deep research: corporate events, valuation envelope, health score."""
    try:
        return await deep_research_service.get_deep_research(symbol)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch deep research: {e}")


@router.get("/{symbol:path}/v4-intelligence")
async def get_v4_intelligence(
    symbol: str = Path(..., description="Stock symbol"),
    ri_service: RelationshipIntelligenceService = Depends(get_relationship_intelligence_service_dep),
):
    """Mara v4 Intelligence - fundamental relationships, anomalies, etc."""
    try:
        return await ri_service.get_v4_intelligence(symbol)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch v4 intelligence: {e}")


@router.get("/{symbol:path}/macro-explorer")
async def get_macro_explorer(
    symbol: str = Path(..., description="Stock symbol"),
    ri_service: RelationshipIntelligenceService = Depends(get_relationship_intelligence_service_dep),
):
    """Rolling correlation with macro factors."""
    try:
        return await ri_service.get_macro_explorer(symbol)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch macro explorer: {e}")


@router.post("/batch")
async def get_batch_stock_overview(
    symbols: List[str],
    stock_service: StockService = Depends(get_stock_service_dep),
):
    """Batch stock overview - CACHE ONLY contract."""
    if not symbols:
        return []
    results = await stock_service.get_batch_overview(symbols)
    return results


@router.get("/search")
async def search_assets(
    q: str = Query(..., min_length=1, max_length=100),
    stock_service: StockService = Depends(get_stock_service_dep),
):
    """Search assets by query."""
    try:
        results = await stock_service.search(q)
        return results
    except Exception as e:
        raise HTTPException(500, f"Search failed: {e}")


@router.get("/popular")
async def get_popular_universe(
    stock_service: StockService = Depends(get_stock_service_dep),
):
    """Get popular asset universe for discovery."""
    try:
        results = await stock_service.get_popular_universe()
        return results
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch popular universe: {e}")