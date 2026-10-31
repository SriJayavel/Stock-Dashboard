"""Screener Feature - Models"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class ScreenerSnapshotResponse(BaseModel):
    universe: str
    items: List[Dict[str, Any]] = []
    last_updated: Optional[str] = None