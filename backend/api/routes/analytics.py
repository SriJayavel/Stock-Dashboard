"""
Analytics API Routes - Correlation, portfolio risk, sector intelligence.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from logging import getLogger

from backend.api.dependencies import get_deep_research_service_dep
from backend.features.deep_research.service import DeepResearchService

logger = getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class CorrelationRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list)
    period: str = "1y"


class PortfolioPosition(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    weight: float = Field(default=1, gt=0, le=100)


class PortfolioRiskRequest(BaseModel):
    positions: List[PortfolioPosition] = Field(default_factory=list, max_length=20)
    period: str = "1y"


@router.post("/correlation")
async def compute_correlation(
    body: CorrelationRequest,
    deep_research_service: DeepResearchService = Depends(get_deep_research_service_dep),
):
    """Compute Pearson correlation matrix."""
    try:
        # We need to add this method to DeepResearchService
        return await deep_research_service.compute_correlation_matrix(body.symbols, period=body.period)
    except Exception as e:
        raise HTTPException(500, f"Failed to compute correlation: {e}")


@router.post("/portfolio-risk")
async def compute_portfolio_risk(
    body: PortfolioRiskRequest,
    deep_research_service: DeepResearchService = Depends(get_deep_research_service_dep),
):
    """Estimate portfolio risk using cached chart data."""
    try:
        positions = [p.model_dump() for p in body.positions]
        return await deep_research_service.compute_portfolio_risk(positions, period=body.period)
    except Exception as e:
        raise HTTPException(500, f"Failed to compute portfolio risk: {e}")


@router.get("/sectors")
async def get_sector_intelligence(
    deep_research_service: DeepResearchService = Depends(get_deep_research_service_dep),
):
    """Sector benchmark intelligence with fallback to cached data."""
    try:
        result = await deep_research_service.get_sector_intelligence()
        # Always return valid JSON even on partial failure
        if result.get("error"):
            # Check for stale cache
            stale_key = "computed:sector_intelligence"
            cached = await deep_research_service._cache.get(stale_key, "sector_intelligence")
            if cached:
                return cached
        return result
    except Exception as e:
        logger = __import__('logging').getLogger(__name__)
        logger.warning(f"Sector intelligence error (returning fallback): {e}")
        # Try to get stale cache as fallback
        try:
            stale_key = "computed:sector_intelligence"
            cached = await deep_research_service._cache.get(stale_key, "sector_intelligence")
            if cached:
                return cached
        except:
            pass
        # Return empty but valid response with fallback sectors
        return {
            "sectors": [],
            "fallback": True,
            "message": "Sector intelligence feed temporarily unavailable. Using cached data.",
            "retrieved_at": None
        }