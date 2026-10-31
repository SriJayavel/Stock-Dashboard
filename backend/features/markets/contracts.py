"""
Markets Feature - Protocol Contracts
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class MarketServiceProtocol(ABC):
    """Protocol for market data services."""

    @abstractmethod
    async def get_overview(self, refresh: bool = False) -> Dict[str, Any]:
        """Get market overview with hero index and macro categories."""
        ...

    @abstractmethod
    async def refresh(self) -> Dict[str, Any]:
        """Force refresh market overview."""
        ...