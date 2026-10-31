"""Research Feature - Protocol Contracts"""
from abc import ABC, abstractmethod
from typing import Dict, Any

class ResearchServiceProtocol(ABC):
    @abstractmethod
    async def get_research(self, symbol: str) -> Dict[str, Any]:
        ...
    @abstractmethod
    async def get_deep_research(self, symbol: str) -> Dict[str, Any]:
        ...