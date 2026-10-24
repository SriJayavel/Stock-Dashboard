"""
FastAPI Backend for Mara Market Intelligence:
- Gated internal cache refresh endpoint (`POST /internal/refresh-cache`) for external cron/GitHub Actions.
- Two-tier cached data pipeline serving multi-asset market analytics.
- Structured endpoints optimized for TradingView Lightweight Charts frontend.
"""

import os
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends, Query, status, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, FileResponse
from starlette.staticfiles import StaticFiles

from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
import asyncio
import json
from typing import Set, Dict, List, Optional
from datetime import datetime
from backend.auth import verify_access_token

from backend.config import settings
from backend.services.data_pipeline import (
    InstrumentUnavailableError,
    get_market_overview,
    get_stock_overview,
    get_batch_stock_overview,
    get_stock_history,
    get_market_candles,
    search_assets,
    warm_all_caches,
    refresh_market_overview,
    resolve_symbol,
)
from backend.services.cache_manager import cache
from backend.services.screener import get_screener_snapshot
from backend.services.research_pipeline import get_stock_research
from backend.services.deep_research import (
    get_deep_stock_research,
    compute_correlation_matrix,
    compute_cached_portfolio_risk,
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
    title="Mara Stock Dashboard API",
    description="High-frequency financial market terminal and analytics engine.",
    version="2.0.0",
)

# HTTP Compression Middleware (compresses JSON payloads >= 1KB)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS Middleware (supports explicit origins and any *.vercel.app deployment preview/production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_mara_account(request, call_next):
    """Require an active Supabase Auth session for all application data APIs."""
    path = request.url.path

    # Define public path prefixes that don't require authentication
    public_path_prefixes = [
        "/api/health",
        "/api/market/candles",
        "/api/markets/overview",
        "/api/markets/refresh",
        "/api/screener",
        "/api/search"
    ]

    # Define public path patterns with parameters
    public_path_patterns = [
        ("/api/stocks/", "/overview"),
        ("/api/stocks/", "/history")
    ]

    # Check if path is in public prefixes
    is_public_prefix = any(path.startswith(prefix) for prefix in public_path_prefixes)

    # Check if path matches public patterns
    is_public_pattern = False
    if path.startswith("/api/"):
        for prefix, suffix in public_path_patterns:
            if path.startswith(prefix) and path.endswith(suffix):
                is_public_pattern = True
                break

    is_public = is_public_prefix or is_public_pattern

    if request.method != "OPTIONS" and path.startswith("/api/") and not is_public:
        if settings.ENVIRONMENT != "production" and (not settings.SUPABASE_URL or not settings.SUPABASE_KEY):
            request.state.mara_user = {"id": "guest_dev", "email": "dev@mara.internal"}
            return await call_next(request)

        authorization = request.headers.get("authorization", "")
        scheme, _, credential = authorization.partition(" ")
        if scheme.lower() != "bearer" or not credential:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Sign in to Mara to access this data."},
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            request.state.mara_user = await run_in_threadpool(verify_access_token, credential)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers={"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None,
            )
    return await call_next(request)


def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    """Security verification for internal maintenance & cache-warming endpoints."""
    if not x_internal_secret or x_internal_secret != settings.INTERNAL_REFRESH_SECRET:
        logger.warning("Unauthorized attempt to access internal cache endpoint.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal secret header (X-Internal-Secret)",
        )
    return True


# ===== WebSocket Manager for Live Market Data =====
class MarketWebSocketManager:
    """Manages WebSocket connections for live market data push."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # symbol -> set of websockets
        self.connection_symbols: Dict[WebSocket, Set[str]] = {}  # websocket -> set of symbols
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket, symbols: List[str]):
        await websocket.accept()
        self.connection_symbols[websocket] = set(symbols)
        for symbol in symbols:
            if symbol not in self.active_connections:
                self.active_connections[symbol] = set()
            self.active_connections[symbol].add(websocket)
        logger.info(f"WebSocket connected for symbols: {symbols}")

        # Start heartbeat if not running
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat())

    def disconnect(self, websocket: WebSocket):
        symbols = self.connection_symbols.pop(websocket, set())
        for symbol in symbols:
            if symbol in self.active_connections:
                self.active_connections[symbol].discard(websocket)
                if not self.active_connections[symbol]:
                    del self.active_connections[symbol]
        logger.info(f"WebSocket disconnected, was subscribed to: {symbols}")

    async def subscribe(self, websocket: WebSocket, symbols: List[str]):
        for symbol in symbols:
            if symbol not in self.active_connections:
                self.active_connections[symbol] = set()
            self.active_connections[symbol].add(websocket)
        self.connection_symbols[websocket].update(symbols)
        logger.info(f"WebSocket subscribed to: {symbols}")

    async def unsubscribe(self, websocket: WebSocket, symbols: List[str]):
        for symbol in symbols:
            if symbol in self.active_connections:
                self.active_connections[symbol].discard(websocket)
                if not self.active_connections[symbol]:
                    del self.active_connections[symbol]
        self.connection_symbols[websocket].difference_update(symbols)
        logger.info(f"WebSocket unsubscribed from: {symbols}")

    async def broadcast_price_update(self, symbol: str, data: dict):
        """Broadcast price update to all connections subscribed to symbol."""
        if symbol not in self.active_connections:
            return
        disconnected = set()
        message = json.dumps({
            "type": "price_update",
            "symbol": symbol,
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
        for ws in self.active_connections[symbol].copy():
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.add(ws)
        # Clean up disconnected
        for ws in disconnected:
            self.disconnect(ws)

    async def broadcast_market_status(self, status: str, message: str = ""):
        """Broadcast market status change to all connections."""
        all_ws = set()
        for ws_set in self.active_connections.values():
            all_ws.update(ws_set)

        msg = json.dumps({
            "type": "market_status",
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
        disconnected = set()
        for ws in all_ws:
            try:
                await ws.send_text(msg)
            except Exception:
                disconnected.add(ws)
        for ws in disconnected:
            self.disconnect(ws)

    async def _heartbeat(self):
        """Send periodic heartbeat to detect dead connections."""
        while True:
            await asyncio.sleep(30)  # 30 second heartbeat
            all_ws = set()
            for ws_set in self.active_connections.values():
                all_ws.update(ws_set)

            if not all_ws:
                break

            msg = json.dumps({
                "type": "heartbeat",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            })
            disconnected = set()
            for ws in all_ws:
                try:
                    await ws.send_text(msg)
                except Exception:
                    disconnected.add(ws)
            for ws in disconnected:
                self.disconnect(ws)


market_ws_manager = MarketWebSocketManager()


@app.websocket("/ws/markets")
async def markets_websocket(websocket: WebSocket):
    """WebSocket endpoint for live market data.

    Client sends JSON messages:
    - {"action": "subscribe", "symbols": ["AAPL", "TCS.NS"]}
    - {"action": "unsubscribe", "symbols": ["AAPL"]}
    - {"action": "ping"}

    Server sends:
    - {"type": "price_update", "symbol": "AAPL", "data": {...}, "timestamp": "..."}
    - {"type": "market_status", "status": "live", "message": "...", "timestamp": "..."}
    - {"type": "heartbeat", "timestamp": "..."}
    """
    await market_ws_manager.connect(websocket, [])
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                symbols = msg.get("symbols", [])

                if action == "subscribe":
                    await market_ws_manager.subscribe(websocket, symbols)
                elif action == "unsubscribe":
                    await market_ws_manager.unsubscribe(websocket, symbols)
                elif action == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": datetime.utcnow().isoformat() + "Z"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        market_ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        market_ws_manager.disconnect(websocket)


# Helper function to push price updates from cache refresh
async def push_price_updates(symbol_data: dict):
    """Call this from cache refresh to push live updates."""
    for symbol, data in symbol_data.items():
        await market_ws_manager.broadcast_price_update(symbol, data)


@app.get("/api/health")
def health_check():
    """Lightweight ping endpoint for uptime monitors and container liveness probes."""
    if settings.config_errors:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "misconfigured",
                "service": "Mara Stock Dashboard API",
                "environment": settings.ENVIRONMENT,
                "config_errors": settings.config_errors,
            },
        )

    # Check cache status (critical for our application)
    cache_status = "ok"
    try:
        # Simple cache operation to verify it's working
        cache.set("market", "health_check_test", "ok", ttl=1)
        result = cache.get("market", "health_check_test")
        if result != "ok":
            cache_status = "fail"
    except Exception:
        cache_status = "fail"

    # Overall status depends on critical components (config and cache)
    # External APIs can be degraded without making the whole system unhealthy
    overall_status = "healthy" if (settings.config_errors == [] and cache_status == "ok") else "degraded"

    # Prepare dependency information (don't include in overall status for external APIs)
    dependencies = {
        "cache": cache_status,
        # Note: We don't include external APIs in overall health status to avoid
        # cascading failures, but we monitor them for alerting purposes
    }

    response = {
        "status": overall_status,
        "service": "Mara Stock Dashboard API",
        "environment": settings.ENVIRONMENT,
        "dependencies": dependencies,
    }

    # Include config errors if any (even if we're degraded due to config, we still show them)
    if settings.config_errors:
        response["config_errors"] = settings.config_errors

    return response


@app.get("/api/markets/overview")
def api_markets_overview(background_tasks: BackgroundTasks):
    """
    Serve the latest cached multi-asset market snapshot without making inline
    upstream provider requests.
    If the cache is cold, asynchronously enqueue background warming.
    """
    try:
        data = get_market_overview()
        if data.get("market_status") == "unavailable" and not data.get("is_stale"):
            background_tasks.add_task(refresh_market_overview)
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
    except InstrumentUnavailableError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("Error serving stock overview for %s", symbol)
        raise HTTPException(
            status_code=502,
            detail=f"Unable to retrieve overview for {symbol} from the data providers.",
        ) from e


@app.get("/api/stocks/{symbol:path}/history")
def api_stock_history(
    symbol: str,
    timeframe: str = Query("max", pattern="(?i)^(1d|5d|1mo|3mo|6mo|1y|2y|5y|max|ytd|all)$"),
    interval: str = Query("1d", pattern="(?i)^(1m|2m|5m|15m|30m|60m|90m|1h|1d|1wk|1mo)$"),
):
    """
    Get OHLCV candlestick bars, volume, calculated indicators (EMA, SMA, BB, RSI, MACD),
    and rule-based technical observations. Formatted for TradingView Lightweight Charts.
    """
    try:
        clean_tf = (timeframe or "max").lower().replace("all", "max")
        clean_int = (interval or "1d").lower()
        data = get_stock_history(symbol, timeframe=clean_tf, interval=clean_int)
        return data
    except Exception as e:
        logger.error(f"Error serving stock history for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch history for {symbol}.")


@app.get("/api/market/candles")
def api_market_candles(
    symbol: str = Query(..., description="Asset ticker symbol (e.g. TCS.NS, AAPL, BTC-USD)"),
    interval: str = Query("1m", pattern="(?i)^(1m|2m|5m|15m|30m|60m|90m|1h|1d|1wk|1mo)$"),
    range: str = Query("1d", pattern="(?i)^(1d|5d|1mo|3mo|6mo|1y|2y|5y|max|ytd|all)$"),
):
    """
    Get canonical market candles (OHLCV + volume + indicators) with genuine intraday support.
    """
    try:
        clean_int = (interval or "1m").lower()
        clean_range = (range or "1d").lower().replace("all", "max")
        data = get_market_candles(symbol=symbol, interval=clean_int, range_param=clean_range)
        return data
    except Exception as e:
        logger.error(f"Error serving candles for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch market candles for {symbol}.")


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


class PortfolioPosition(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    weight: float = Field(default=1, gt=0, le=100)


class PortfolioRiskRequest(BaseModel):
    positions: list[PortfolioPosition] = Field(default_factory=list, max_length=20)
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


@app.post("/api/analytics/portfolio-risk")
def api_portfolio_risk(body: PortfolioRiskRequest):
    """Estimate weighted historical return and risk using cached chart data only."""
    positions = [position.model_dump() for position in body.positions]
    return compute_cached_portfolio_risk(positions, period=body.period)


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
    Mara v4 Intelligence: Fundamental Relationships, Statement Quality,
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


@app.on_event("startup")
async def startup_warm_cache():
    import asyncio
    try:
        # Non-blocking background warmup on server boot
        asyncio.create_task(run_in_threadpool(refresh_market_overview))
    except Exception as exc:
        logger.warning("Startup cache warmup dispatch failed: %s", exc)


async def _refresh_and_push():
    """Background task: refresh market overview and push updates via WebSocket."""
    try:
        data = await run_in_threadpool(refresh_market_overview, lock_acquired=True)
        # Push price updates for all symbols in the refreshed data
        if data and data.get("macro"):
            for category, items in data["macro"].items():
                for item in items:
                    symbol = item.get("symbol")
                    if symbol:
                        await market_ws_manager.broadcast_price_update(symbol, item)
        # Also push hero if present
        if data and data.get("hero"):
            hero = data["hero"]
            symbol = hero.get("symbol")
            if symbol:
                await market_ws_manager.broadcast_price_update(symbol, hero)
        # Broadcast market status
        await market_ws_manager.broadcast_market_status(
            data.get("market_status", "live") if data else "unavailable",
            "Market data refreshed"
        )
        logger.info("Market overview refreshed and WebSocket updates pushed")
    except Exception as e:
        logger.error(f"Error in refresh and push: {e}")


@app.post("/api/markets/refresh", status_code=status.HTTP_202_ACCEPTED)
def api_refresh_market_overview(
    background_tasks: BackgroundTasks,
):
    """Queue an overview refresh without exposing the internal secret, protected by distributed cooldown."""
    if not cache.acquire_lock("market_overview_refresh_cooldown", ttl=30):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait before requesting another market refresh.")
    if not cache.acquire_lock("market_overview_refresh", ttl=180):
        cache.release_lock("market_overview_refresh_cooldown")
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="A market refresh is already running.")
    background_tasks.add_task(_refresh_and_push)
    return {"status": "accepted", "message": "Market overview refresh started."}


async def _warm_all_caches_and_push():
    """Background task: warm all caches and push updates via WebSocket."""
    try:
        data = await run_in_threadpool(warm_all_caches)
        # warm_all_caches doesn't return the data, so we need to fetch it
        from backend.services.data_pipeline import get_market_overview
        overview = await run_in_threadpool(get_market_overview, refresh=False)
        if overview and overview.get("macro"):
            for category, items in overview["macro"].items():
                for item in items:
                    symbol = item.get("symbol")
                    if symbol:
                        await market_ws_manager.broadcast_price_update(symbol, item)
        if overview and overview.get("hero"):
            hero = overview["hero"]
            symbol = hero.get("symbol")
            if symbol:
                await market_ws_manager.broadcast_price_update(symbol, hero)
        await market_ws_manager.broadcast_market_status(
            overview.get("market_status", "live") if overview else "unavailable",
            "Scheduled cache warming complete"
        )
        logger.info("Scheduled cache warming complete and WebSocket updates pushed")
    except Exception as e:
        logger.error(f"Error in warm all caches and push: {e}")


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
    background_tasks.add_task(_warm_all_caches_and_push)
    return {
        "status": "accepted",
        "message": "Scheduled cache warming dispatched in background.",
    }


# ---------------------------------------------------------------------------
# Static SPA Frontend Serving (Zero-Configuration Local & Production Hosting)
# ---------------------------------------------------------------------------
DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.isdir(DIST_DIR):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("internal/"):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
