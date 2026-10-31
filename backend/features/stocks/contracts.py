"""
Stocks Feature - Protocol Contracts
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from backend.core.contracts.market_data import Quote, Candle, AssetInfo
from backend.core.contracts.cache import CacheProtocol


class StockServiceProtocol(ABC):
    """Protocol for stock data services."""

    @abstractmethod
    async def get_overview(self, symbol: str) -> Dict[str, Any]:
        """Get comprehensive stock overview."""
        ...

    @abstractmethod
    async def get_history(
        self,
        symbol: str,
        timeframe: str = "max",
        interval: str = "1d",
    ) -> Dict[str, Any]:
        """Get historical OHLCV data with indicators."""
        ...

    @abstractmethod
    async def get_batch_overview(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """Get batch stock overview (cache-only)."""
        ...

    @abstractmethod
    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search assets by query."""
        ...

    @abstractmethod
    async def get_popular_universe(self) -> List[Dict[str, Any]]:
        """Get popular universe for discovery."""
        ...