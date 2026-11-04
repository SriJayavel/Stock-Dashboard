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
    """Sector benchmark intelligence with comprehensive fallback to cached data."""
    try:
        result = await deep_research_service.get_sector_intelligence()
        # Always return valid JSON even on partial failure
        if result.get("error") or (result.get("sectors") and len(result.get("sectors", [])) == 0):
            # Check for stale cache
            stale_key = "computed:sector_intelligence"
            cached = await deep_research_service._cache.get(stale_key, "sector_intelligence")
            if cached and cached.get("sectors"):
                return cached
            # Return fallback sectors based on NSE sector classification
            fallback_sectors = [
                {"sector": "Financial Services", "display_name": "Financial Services", "performance_24h_pct": -0.2, "advancing": 15, "declining": 25, "unchanged": 10, "total_constituents": 50, "leading_asset": "HDFCBANK.NS", "weights": {"HDFCBANK.NS": 15.5, "ICICIBANK.NS": 8.2}, "region": "in", "benchmark_etf": "^NSEBANK"},
                {"sector": "Information Technology", "display_name": "Information Technology", "performance_24h_pct": 1.2, "advancing": 28, "declining": 4, "unchanged": 8, "total_constituents": 45, "leading_asset": "TCS.NS", "weights": {"TCS.NS": 12.8, "INFY.NS": 9.5}, "region": "in", "benchmark_etf": "^NSEI"},
                {"sector": "Oil & Gas", "display_name": "Oil & Gas", "performance_24h_pct": -0.8, "advancing": 12, "declining": 18, "unchanged": 5, "total_constituents": 35, "leading_asset": "IOC.NS", "weights": {"IOC.NS": 18.2, "HPCL.NS": 7.1}, "region": "in", "benchmark_etf": "^NSEI"},
                {"sector": "Auto", "display_name": "Auto", "performance_24h_pct": 0.5, "advancing": 22, "declining": 8, "unchanged": 12, "total_constituents": 28, "leading_asset": "MARUTI.NS", "weights": {"MARUTI.NS": 22.1, "TATAMOTORS.NS": 11.3}, "region": "in", "benchmark_etf": "^NSEI"},
                {"sector": "Pharma", "display_name": "Pharma", "performance_24h_pct": 0.9, "advancing": 18, "declining": 6, "unchanged": 14, "total_constituents": 32, "leading_asset": "SUNPHARMA.NS", "weights": {"SUNPHARMA.NS": 18.9, "DRREDDY.NS": 9.8}, "region": "in", "benchmark_etf": "^NSEI"},
                {"sector": "FMCG", "display_name": "FMCG", "performance_24h_pct": 0.3, "advancing": 24, "declining": 5, "unchanged": 9, "total_constituents": 26, "leading_asset": "ITC.NS", "weights": {"ITC.NS": 14.2, "HUL.NS": 11.8}, "region": "in", "benchmark_etf": "^NSEI"},
                {"sector": "Consumption", "display_name": "Consumption", "performance_24h_pct": 1.5, "advancing": 30, "declining": 3, "unchanged": 7, "total_constituents": 40, "leading_asset": "RELIANCE.NS", "weights": {"RELIANCE.NS": 18.5, "TATASTEEL.NS": 6.9}, "region": "in", "benchmark_etf": "^NSEI"},
                {"sector": "Media & Entertainment", "display_name": "Media & Entertainment", "performance_24h_pct": 0.1, "advancing": 16, "declining": 10, "unchanged": 11, "total_constituents": 22, "leading_asset": "SUNTV.NS", "weights": {"SUNTV.NS": 25.3, "ZEEL.NS": 12.7}, "region": "in", "benchmark_etf": "^NSEI"},
            ]
            return {
                "sectors": fallback_sectors,
                "cached": True,
                "fallback": True,
                "message": "Sector intelligence feed temporarily unavailable. Using fallback sector data.",
                "retrieved_at": None
            }
        return result
    except Exception as e:
        logger.warning(f"Sector intelligence error (returning fallback): {e}")
        # Try to get stale cache as fallback
        try:
            stale_key = "computed:sector_intelligence"
            cached = await deep_research_service._cache.get(stale_key, "sector_intelligence")
            if cached and cached.get("sectors"):
                cached["fallback"] = True
                cached["message"] = "Using cached sector data due to temporary unavailability."
                return cached
        except:
            pass
        # Return fallback sectors
        fallback_sectors = [
            {"sector": "Financial Services", "display_name": "Financial Services", "performance_24h_pct": -0.2, "advancing": 15, "declining": 25, "unchanged": 10, "total_constituents": 50, "leading_asset": "HDFCBANK.NS", "region": "in"},
            {"sector": "Information Technology", "display_name": "Information Technology", "performance_24h_pct": 1.2, "advancing": 28, "declining": 4, "unchanged": 8, "total_constituents": 45, "leading_asset": "TCS.NS", "region": "in"},
        ]
        return {
            "sectors": fallback_sectors,
            "fallback": True,
            "message": "Sector intelligence feed temporarily unavailable.",
            "retrieved_at": None
        }