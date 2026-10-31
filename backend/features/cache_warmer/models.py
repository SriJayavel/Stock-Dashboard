"""Cache Warmer Feature - Models"""
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from datetime import datetime


class WarmCacheResponse(BaseModel):
    status: str
    warmed_symbols: int = 0
    warmed_market: bool = False
    errors: List[str] = []
    duration_seconds: float = 0.0
    started_at: datetime
    completed_at: datetime


class WarmSymbolResponse(BaseModel):
    symbol: str
    status: str
    overview_cached: bool = False
    history_cached: bool = False
    error: Optional[str] = None


class WarmMarketResponse(BaseModel):
    status: str
    market_overview_cached: bool = False
    error: Optional[str] = None


class WarmStatusResponse(BaseModel):
    is_warming: bool
    last_warmed_at: Optional[datetime] = None
    next_scheduled: Optional[datetime] = None
    total_symbols_warmed: int = 0
    cache_health: Dict[str, Any] = {}