"""
New Apex Financial Terminal - Main Application Factory.
Uses clean architecture with dependency injection and auto-discovery.
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, FileResponse
from starlette.staticfiles import StaticFiles

from backend.config import settings
from backend.api.dependencies import (
    get_container,
    lifespan,
    get_cache_warmer_service_dep,
)
from backend.api.routes import markets, stocks, analytics, research, websocket
from backend.core.contracts.events import get_event_bus

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    app = FastAPI(
        title="Mara Stock Dashboard API",
        description="High-frequency financial market terminal and analytics engine.",
        version="3.0.0",
        lifespan=lifespan,
    )

    # HTTP Compression
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_origin_regex=r"^https://.*\.vercel\.app$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Auth middleware (thin, delegates to auth provider)
    @app.middleware("http")
    async def auth_middleware(request, call_next):
        path = request.url.path

        # Public paths
        public_prefixes = [
            "/api/health",
            "/api/markets/overview",
            "/api/markets/candles",
            "/api/stocks/batch",
            "/api/search",
            "/api/screener",
            "/ws/markets",
        ]
        public_patterns = [
            ("/api/stocks/", "/overview"),
            ("/api/stocks/", "/history"),
        ]

        is_public = any(path.startswith(p) for p in public_prefixes)
        if not is_public and path.startswith("/api/"):
            for prefix, suffix in public_patterns:
                if path.startswith(prefix) and path.endswith(suffix):
                    is_public = True
                    break

        if request.method != "OPTIONS" and path.startswith("/api/") and not is_public:
            # Dev mode bypass
            if settings.ENVIRONMENT != "production" and (not settings.SUPABASE_URL or not settings.SUPABASE_KEY):
                request.state.mara_user = {"id": "guest_dev", "email": "dev@mara.internal", "roles": ["admin"]}
                return await call_next(request)

            # Verify token via auth provider
            auth = get_container().auth()
            auth_header = request.headers.get("authorization", "")
            scheme, _, credential = auth_header.partition(" ")

            if scheme.lower() != "bearer" or not credential:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Sign in to Mara to access this data."},
                    headers={"WWW-Authenticate": "Bearer"},
                )

            try:
                user = await auth.verify_token(credential)
                request.state.mara_user = user
            except ValueError as e:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": str(e)},
                    headers={"WWW-Authenticate": "Bearer"},
                )

        return await call_next(request)

    # Internal secret verification
    def verify_internal_secret(x_internal_secret: str = None):
        if not x_internal_secret or x_internal_secret != settings.INTERNAL_REFRESH_SECRET:
            logger.warning("Unauthorized internal endpoint access")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing internal secret",
            )
        return True

    # Register API routes
    app.include_router(markets.router)
    app.include_router(stocks.router)
    app.include_router(analytics.router)
    app.include_router(research.router)
    app.include_router(websocket.router)

    # Health check
    @app.get("/api/health")
    async def health_check():
        container = get_container()
        cache = container.cache()
        market_data = container.market_data()

        # Check cache
        cache_status = "ok"
        try:
            await cache.set("health", "test", "ok", ttl=1)
            result = await cache.get("health", "test")
            if result != "ok":
                cache_status = "fail"
        except Exception:
            cache_status = "fail"

        # Check market data
        market_healthy = await market_data.health_check()

        overall = "healthy" if (cache_status == "ok" and market_healthy) else "degraded"

        return {
            "status": overall,
            "service": "Mara Stock Dashboard API",
            "version": "3.0.0",
            "environment": settings.ENVIRONMENT,
            "dependencies": {
                "cache": cache_status,
                "market_data": "ok" if market_healthy else "degraded",
            },
        }

    # Internal cache refresh endpoint
    @app.post("/internal/refresh-cache", status_code=status.HTTP_202_ACCEPTED)
    async def refresh_cache(
        background_tasks,
        authorized: bool = Depends(verify_internal_secret),
        cache_warmer = Depends(get_cache_warmer_service_dep),
    ):
        """External cron endpoint - returns immediately, warms cache in background."""
        from backend.core.contracts.events import emit_cache_warmed, EventTypes, DomainEvent

        async def _warm_and_emit():
            try:
                await cache_warmer.warm_all_caches()
                # Emit cache warmed events for each namespace
                for ns in [
                    "market:overview", "stock:overview", "stock:history",
                    "computed:indicators", "computed:screener", "computed:research"
                ]:
                    await emit_cache_warmed(ns, [])
            except Exception as e:
                logger.error(f"Scheduled cache warming failed: {e}")

        background_tasks.add_task(_warm_and_emit)
        logger.info("Scheduled cache warming dispatched")
        return {"status": "accepted", "message": "Cache warming dispatched"}

    # Serve frontend SPA
    DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

    if os.path.isdir(DIST_DIR):
        assets_dir = os.path.join(DIST_DIR, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/") or full_path.startswith("internal/") or full_path.startswith("ws/"):
                raise HTTPException(status_code=404, detail="Not Found")
            target_file = os.path.join(DIST_DIR, full_path)
            if full_path and os.path.isfile(target_file):
                return FileResponse(target_file)
            return FileResponse(os.path.join(DIST_DIR, "index.html"))

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main_new:app", host="0.0.0.0", port=port, reload=True)