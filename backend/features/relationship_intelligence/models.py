"""Relationship Intelligence Feature - Models"""
from typing import Dict, Any, Optional
from pydantic import BaseModel

class V4IntelligenceResponse(BaseModel):
    symbol: str
    data: Dict[str, Any] = {}
    last_updated: Optional[str] = None

class MacroExplorerResponse(BaseModel):
    symbol: str
    data: Dict[str, Any] = {}
    last_updated: Optional[str] = None

class QueryParseResponse(BaseModel):
    query: str
    parsed: Dict[str, Any] = {}