"""Relationship Intelligence Feature - Protocol Contracts"""
from abc import ABC, abstractmethod
from typing import Dict, Any

class RelationshipIntelligenceServiceProtocol(ABC):
    @abstractmethod
    async def get_v4_intelligence(self, symbol: str) -> Dict[str, Any]:
        ...
    @abstractmethod
    async def get_macro_explorer(self, symbol: str) -> Dict[str, Any]:
        ...
    @abstractmethod
    async def parse_query(self, query: str, symbol: str) -> Dict[str, Any]:
        ...