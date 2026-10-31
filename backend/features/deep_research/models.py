"""Deep Research Feature - Models"""
from typing import Dict, Any, Optional
from pydantic import BaseModel

class DeepResearchResponse(BaseModel):
    symbol: str
    data: Dict[str, Any] = {}
    last_updated: Optional[str] = None