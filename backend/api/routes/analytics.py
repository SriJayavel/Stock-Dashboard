"""
Analytics API Routes - Correlation, portfolio risk, sector intelligence.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.dependencies import get_deep_research_service_dep
from backend.features.deep_research.service import DeepResearchService

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
    """Sector benchmark intelligence."""
    try:
        return await deep_research_service.get_sector_intelligence()
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch sector intelligence: {e}")