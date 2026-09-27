"""
FastAPI Backend for Apex Financial Terminal:
- Gated internal cache refresh endpoint (`POST /internal/refresh-cache`) for external cron/GitHub Actions.
- Two-tier cached data pipeline serving multi-asset market analytics.
- Structured endpoints optimized for TradingView Lightweight Charts frontend.
"""

import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends, Query, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.data_pipeline import (
    get_market_overview,
    get_stock_overview,
    get_batch_stock_overview,
    get_stock_history,
    search_assets,
    warm_all_caches,
    resolve_symbol,
)
from backend.services.screener import get_screener_snapshot
from backend.services.research_pipeline import get_stock_research
from backend.services.deep_research import (
    get_deep_stock_research,
    compute_correlation_matrix,
    get_sector_intelligence,
)
from backend.services.relationship_engine import (
    get_v4_intelligence,
    parse_research_query,
    get_macro_explorer,
)

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")

app = FastAPI(
    title="Apex Financial Terminal API",
    description="High-frequency financial market terminal and analytics engine.",
    version="2.0.0",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    """Security verification for internal maintenance & cache-warming endpoints."""
    if not x_internal_secret or x_internal_secret != settings.INTERNAL_REFRESH_SECRET:
        logger.warning("Unauthorized attempt to access internal cache endpoint.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal secret header (X-Internal-Secret)",
        )
    return True


@app.get("/api/health")
def health_check():
    """Lightweight ping endpoint for uptime monitors and container liveness probes."""
    return {
        "status": "healthy",
        "service": "Apex Terminal API",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/api/markets/overview")
def api_markets_overview():
    """
    Get Hero NIFTY 50 index snapshot, multi-asset macro dashboard (Indices, Forex, Crypto, Commodities),
    and community trending leaders.
    """
    try:
        data = get_market_overview()
        return data
    except Exception as e:
        logger.error(f"Error serving market overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market overview data.")


class BatchStockRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list, max_length=50)


@app.post("/api/stocks/batch")
def api_stocks_batch(payload: BatchStockRequest):
    """
    CACHE-ONLY BATCH ENDPOINT:
    Returns cached quotes for watchlist symbols without triggering upstream burst traffic.
    Uncached symbols are marked status='pending' and enqueued for scheduled warming.
    """
    return get_batch_stock_overview(payload.symbols)


@app.get("/api/stocks/{symbol:path}/overview")
def api_stock_overview(symbol: str):
    """
    Get valuation metrics, profitability multiples, 52-week envelope, and analyst targets.
    """
    try:
        data = get_stock_overview(symbol)
        return data
    except Exception as e:
        logger.error(f"Error serving stock overview for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch overview for {symbol}.")


@app.get("/api/stocks/{symbol:path}/history")
def api_stock_history(
    symbol: str,
    timeframe: str = Query("1y", pattern="^(1mo|3mo|6mo|1y|2y|5y|max)$"),
    interval: str = Query("1d", pattern="^(1d|1wk|1mo)$"),
):
    """
    Get OHLCV candlestick bars, volume, calculated indicators (EMA, SMA, BB, RSI, MACD),
    and rule-based technical observations. Formatted for TradingView Lightweight Charts.
    """
    try:
        data = get_stock_history(symbol, timeframe=timeframe, interval=interval)
        return data
    except Exception as e:
        logger.error(f"Error serving stock history for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch history for {symbol}.")


@app.get("/api/stocks/{symbol:path}/research")
def api_stock_research(symbol: str):
    """
    Get institutional research dossier: multi-year financial statements,
    peer intelligence matrix, context-categorized news, structural observations,
    and data provenance metadata.
    """
    try:
        data = get_stock_research(symbol)
        return data
    except Exception as e:
        logger.error(f"Error serving stock research for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch research for {symbol}.")


class CorrelationRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)
    period: str = "1y"


@app.get("/api/stocks/{symbol:path}/deep-research")
def api_stock_deep_research(symbol: str):
    """
    Institutional Deep Research: Corporate Events, 5Q Earnings Trajectory,
    Advanced Ratios (Cash Flow, ROCE, Net Debt), 5Y Historical Valuation,
    Max Drawdown, Volatility, Relative Benchmarking, and Auditable Financial Health Score.
    """
    try:
        return get_deep_stock_research(symbol)
    except Exception as e:
        logger.error(f"Error serving deep research for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch deep research for {symbol}.")


@app.post("/api/analytics/correlation")
def api_correlation_matrix(body: CorrelationRequest):
    """Compute Pearson log-return correlation matrix across custom symbol baskets."""
    try:
        return compute_correlation_matrix(body.symbols, period=body.period)
    except Exception as e:
        logger.error(f"Error computing correlation matrix: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate correlation matrix.")


@app.get("/api/analytics/sectors")
def api_sector_intelligence():
    """Sector benchmark intelligence, performance, and key constituents."""
    try:
        return get_sector_intelligence()
    except Exception as e:
        logger.error(f"Error serving sector intelligence: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sector intelligence.")


@app.get("/api/search")
def api_search(q: str = Query("", min_length=0)):
    """Instant asset directory lookup across indices, equities, forex, and crypto."""
    try:
        results = search_assets(q)
        return {"query": q, "results": results}
    except Exception as e:
        logger.error(f"Error searching assets for '{q}': {e}")
        return {"query": q, "results": []}


@app.get("/api/screener")
def api_screener(universe: str = Query("us_mega_caps")):
    """
    Multi-Market Screener Endpoint:
    Returns screened assets with live metrics for a chosen universe:
    - us_mega_caps
    - indian_leaders
    - semiconductors_ai
    - crypto
    - commodities
    - forex
    """
    try:
        return get_screener_snapshot(universe)
    except Exception as e:
        logger.error(f"Error serving screener for universe '{universe}': {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch screener data.")


@app.get("/api/stocks/{symbol:path}/v4-intelligence")
def api_v4_intelligence(symbol: str):
    """
    Apex v4 Intelligence: Fundamental Relationships, Statement Quality,
    Anomaly Detection, What Changed (30D), Filing Diff, and Asset Profile.
    """
    try:
        return get_v4_intelligence(symbol)
    except Exception as e:
        logger.error(f"Error serving v4 intelligence for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch v4 intelligence for {symbol}.")


@app.get("/api/stocks/{symbol:path}/macro-explorer")
def api_macro_explorer(symbol: str):
    """Compute rolling correlation between asset and core macro factors."""
    try:
        return get_macro_explorer(symbol)
    except Exception as e:
        logger.error(f"Error serving macro explorer for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch macro explorer for {symbol}.")


class ResearchQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language research query")
    active_symbol: str = Field("TCS.NS", description="Currently active asset symbol")


@app.post("/api/research/query")
def api_research_query(body: ResearchQueryRequest):
    """Deterministic Research Query Parser: Maps natural language to structured data actions."""
    try:
        return parse_research_query(body.query, body.active_symbol)
    except Exception as e:
        logger.error(f"Error parsing research query: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse research query.")


@app.post("/internal/refresh-cache", status_code=status.HTTP_202_ACCEPTED)
def api_refresh_cache(
    background_tasks: BackgroundTasks,
    authorized: bool = Depends(verify_internal_secret)
):
    """
    PROTECTED ASYNC INTERNAL WORKER:
    Returns immediately (HTTP 202 Accepted) in sub-50ms to prevent external cron client timeouts.
    Dispatches jittered cache warming asynchronously in background.
    """
    logger.info("Enqueuing scheduled external cache warming in background...")
    background_tasks.add_task(warm_all_caches)
    return {
        "status": "accepted",
        "message": "Scheduled cache warming dispatched in background.",
    }


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
