"""Cache Warmer Feature - Protocol Contracts"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List


class CacheWarmerServiceProtocol(ABC):
    @abstractmethod
    async def warm_all_caches(self) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def warm_symbol_cache(self, symbol: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def warm_market_cache(self) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def get_warm_status(self) -> Dict[str, Any]:
        ...