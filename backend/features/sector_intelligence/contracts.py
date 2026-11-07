"""Sector Intelligence Feature - Protocol Contracts"""
from abc import ABC, abstractmethod
from typing import Dict, Any


class SectorIntelligenceServiceProtocol(ABC):
    @abstractmethod
    async def get_sector_intelligence(self) -> Dict[str, Any]:
        ...