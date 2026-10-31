"""
Research API Routes - Query parser, screener.
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.contracts.market_data import MarketDataProvider
from backend.api.dependencies import (
    get_market_data_dep,
    get_screener_service_dep,
    get_relationship_intelligence_service_dep,
)
from backend.features.screener.service import ScreenerService
from backend.features.relationship_intelligence.service import RelationshipIntelligenceService

router = APIRouter(prefix="/api", tags=["research"])


class ResearchQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language research query")
    active_symbol: str = Field("TCS.NS", description="Currently active asset symbol")


@router.post("/research/query")
async def parse_research_query(
    body: ResearchQueryRequest,
    ri_service: RelationshipIntelligenceService = Depends(get_relationship_intelligence_service_dep),
):
    """Parse natural language to structured data actions."""
    try:
        return await ri_service.parse_query(body.query, body.active_symbol)
    except Exception as e:
        raise HTTPException(500, f"Failed to parse query: {e}")


@router.get("/screener")
async def get_screener(
    universe: str = Query("us_mega_caps", description="Universe to screen"),
    screener_service: ScreenerService = Depends(get_screener_service_dep),
):
    """Multi-market screener."""
    try:
        return await screener_service.get_screener_snapshot(universe)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch screener: {e}")