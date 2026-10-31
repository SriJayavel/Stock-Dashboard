"""
Markets Feature - Pydantic Models
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class MarketOverviewResponse(BaseModel):
    """Market overview response."""
    hero: Optional[Dict[str, Any]] = None
    macro: Dict[str, List[Dict[str, Any]]] = {}
    trending: List[Dict[str, Any]] = []
    market_status: str
    feed_health: Dict[str, str] = {}
    last_attempted_at: Optional[str] = None
    last_successful_update: Optional[str] = None
    last_updated: Optional[str] = None
    is_stale: bool = False

class RefreshResponse(BaseModel):
    """Refresh response."""
    status: str
    message: str