"""Screener Feature - Protocol Contracts"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any

class ScreenerServiceProtocol(ABC):
    @abstractmethod
    async def get_snapshot(self, universe: str = "us_mega_caps") -> Dict[str, Any]:
        ...
    @abstractmethod
    async def get_universes(self) -> List[str]:
        ...