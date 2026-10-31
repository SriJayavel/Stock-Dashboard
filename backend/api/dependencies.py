"""
Dependency Injection Container.
Wires all adapters to contracts, manages lifecycle.
"""
import logging
from typing import Optional, Any
from contextlib import asynccontextmanager

from backend.core.contracts.cache import CacheProtocol, LockProtocol, CacheNamespaces
from backend.core.contracts.market_data import MarketDataProvider
from backend.core.contracts.auth import AuthProvider
from backend.core.contracts.events import EventBusProtocol, InMemoryEventBus, set_event_bus

from backend.adapters.cache.memory_cache import MemoryCache, get_memory_cache
from backend.adapters.cache.redis_cache import RedisCache, HybridCache
from backend.adapters.market_data.yfinance_provider import YFinanceProvider
from backend.adapters.market_data.nse_provider import NSEProvider
from backend.adapters.market_data.composite_provider import CompositeMarketProvider

# Feature services
from backend.features.stocks.service import StockService
from backend.features.markets.service import MarketService
from backend.features.screener.service import ScreenerService
from backend.features.research.service import ResearchService
from backend.features.deep_research.service import DeepResearchService
from backend.features.relationship_intelligence.service import RelationshipIntelligenceService
from backend.features.cache_warmer.service import CacheWarmerService
from backend.config import settings

logger = logging.getLogger("di")


class Container:
    """Dependency injection container."""

    def __init__(self):
        self._cache: Optional[CacheProtocol] = None
        self._market_data: Optional[MarketDataProvider] = None
        self._auth: Optional[AuthProvider] = None
        self._event_bus: Optional[EventBusProtocol] = None

        # Feature services
        self._stock_service: Optional[StockService] = None
        self._market_service: Optional[MarketService] = None
        self._screener_service: Optional[ScreenerService] = None
        self._research_service: Optional[ResearchService] = None
        self._deep_research_service: Optional[DeepResearchService] = None
        self._relationship_intelligence_service: Optional[RelationshipIntelligenceService] = None
        self._cache_warmer_service: Optional[CacheWarmerService] = None

        self._initialized = False

    # --- Cache ---

    def cache(self) -> CacheProtocol:
        if self._cache is None:
            self._cache = self._create_cache()
        return self._cache

    def _create_cache(self) -> CacheProtocol:
        # L1 Memory cache
        l1 = get_memory_cache()

        # L2 Redis if configured
        l2 = None
        if settings.REDIS_URL:
            try:
                l2 = RedisCache()
                # Note: connect() must be called at startup
            except Exception as e:
                logger.warning(f"Redis cache unavailable: {e}")

        if l2:
            return HybridCache(l1, l2)
        return l1

    # --- Market Data ---

    def market_data(self) -> MarketDataProvider:
        if self._market_data is None:
            self._market_data = CompositeMarketProvider(
                cache=self.cache(),
                yfinance=YFinanceProvider(),
                nse=NSEProvider(),
            )
        return self._market_data

    # --- Auth ---

    def auth(self) -> AuthProvider:
        if self._auth is None:
            self._auth = self._create_auth()
        return self._auth

    def _create_auth(self) -> AuthProvider:
        # Import here to avoid circular deps
        if settings.SUPABASE_URL and settings.SUPABASE_KEY:
            from backend.adapters.auth.supabase_auth import SupabaseAuthProvider
            return SupabaseAuthProvider()

        # Dev fallback
        from backend.adapters.auth.dev_auth import DevAuthProvider
        return DevAuthProvider()

    # --- Events ---

    def event_bus(self) -> EventBusProtocol:
        if self._event_bus is None:
            self._event_bus = InMemoryEventBus()
            set_event_bus(self._event_bus)
        return self._event_bus

    # --- Feature Services ---

    def stock_service(self) -> StockService:
        if self._stock_service is None:
            self._stock_service = StockService(
                market_data=self.market_data(),
                cache=self.cache(),
                event_bus=self.event_bus(),
            )
        return self._stock_service

    def market_service(self) -> MarketService:
        if self._market_service is None:
            self._market_service = MarketService(
                market_data=self.market_data(),
                cache=self.cache(),
            )
        return self._market_service

    def screener_service(self) -> ScreenerService:
        if self._screener_service is None:
            self._screener_service = ScreenerService(
                cache=self.cache(),
            )
        return self._screener_service

    def research_service(self) -> ResearchService:
        if self._research_service is None:
            self._research_service = ResearchService(
                market_data=self.market_data(),
                cache=self.cache(),
            )
        return self._research_service

    def deep_research_service(self) -> DeepResearchService:
        if self._deep_research_service is None:
            self._deep_research_service = DeepResearchService(
                cache=self.cache(),
            )
        return self._deep_research_service

    def relationship_intelligence_service(self) -> RelationshipIntelligenceService:
        if self._relationship_intelligence_service is None:
            self._relationship_intelligence_service = RelationshipIntelligenceService(
                cache=self.cache(),
            )
        return self._relationship_intelligence_service

    def cache_warmer_service(self) -> CacheWarmerService:
        if self._cache_warmer_service is None:
            self._cache_warmer_service = CacheWarmerService(
                cache=self.cache(),
                market_data=self.market_data(),
                lock=self.cache(),  # CacheProtocol extends LockProtocol
            )
        return self._cache_warmer_service

    # --- Lifecycle ---

    async def startup(self) -> None:
        """Initialize all adapters."""
        if self._initialized:
            return

        logger.info("Starting up dependency container...")

        # Connect Redis if configured
        if settings.REDIS_URL and isinstance(self.cache(), HybridCache):
            try:
                # Find the Redis cache in hybrid
                hybrid = self.cache()
                # Note: would need to expose L2 for connection
                pass
            except Exception as e:
                logger.warning(f"Redis connection failed: {e}")

        # Verify market data
        healthy = await self.market_data().health_check()
        if not healthy:
            logger.warning("Market data provider health check failed")

        self._initialized = True
        logger.info("Dependency container ready")

    async def shutdown(self) -> None:
        """Clean up resources."""
        logger.info("Shutting down dependency container...")

        if self._market_data:
            await self._market_data.close()

        if self._auth:
            await self._auth.close()

        if self._cache and hasattr(self._cache, 'close'):
            await self._cache.close()

        self._initialized = False
        logger.info("Shutdown complete")

    def reset(self) -> None:
        """Reset for testing."""
        self._cache = None
        self._market_data = None
        self._auth = None
        self._event_bus = None
        self._initialized = False


# Global container instance
_container: Optional[Container] = None


def get_container() -> Container:
    """Get the global container."""
    global _container
    if _container is None:
        _container = Container()
    return _container


def set_container(container: Container) -> None:
    """Set container (for testing)."""
    global _container
    _container = container


# FastAPI dependency providers
async def get_cache_dep() -> CacheProtocol:
    return get_container().cache()


async def get_market_data_dep() -> MarketDataProvider:
    return get_container().market_data()


async def get_auth_dep() -> AuthProvider:
    return get_container().auth()


async def get_event_bus_dep() -> EventBusProtocol:
    return get_container().event_bus()


async def get_stock_service_dep() -> StockService:
    return get_container().stock_service()


async def get_market_service_dep() -> MarketService:
    return get_container().market_service()


async def get_screener_service_dep() -> ScreenerService:
    return get_container().screener_service()


async def get_research_service_dep() -> ResearchService:
    return get_container().research_service()


async def get_deep_research_service_dep() -> DeepResearchService:
    return get_container().deep_research_service()


async def get_relationship_intelligence_service_dep() -> RelationshipIntelligenceService:
    return get_container().relationship_intelligence_service()


async def get_cache_warmer_service_dep() -> CacheWarmerService:
    return get_container().cache_warmer_service()


# Lifespan context manager for FastAPI
@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan handler."""
    container = get_container()
    await container.startup()
    yield
    await container.shutdown()