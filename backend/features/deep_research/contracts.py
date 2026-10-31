"""Deep Research Feature - Protocol Contracts"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List


class DeepResearchServiceProtocol(ABC):
    @abstractmethod
    async def get_deep_research(self, symbol: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def compute_correlation_matrix(self, symbols: List[str], period: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def compute_portfolio_risk(self, positions: List[Dict[str, Any]], period: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def get_sector_intelligence(self) -> Dict[str, Any]:
        ...