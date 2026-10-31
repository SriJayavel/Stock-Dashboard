"""
Stocks Feature - Pydantic Models
API request/response DTOs.
"""

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime


class StockOverviewResponse(BaseModel):
    """Stock overview response."""
    symbol: str
    name: str
    asset_type: str
    current_price: float
    prev_close: float
    change: float
    change_pct: float
    currency: str
    currency_symbol: str
    market_cap: Optional[float] = None
    market_cap_str: str
    sector: str
    industry: str
    summary: str
    website: str
    pe_trailing: Optional[float] = None
    pe_forward: Optional[float] = None
    pb_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    peg_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    profit_margin: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    target_mean: Optional[float] = None
    recommendation: str
    volume: int
    avg_volume: int
    exchange: str
    exchange_timezone: str
    data_source: str
    is_stale: bool = False
    last_updated: str
    provider_symbol: Optional[str] = None


class StockHistoryResponse(BaseModel):
    """Stock history response."""
    symbol: str
    timeframe: str
    interval: str
    candles: List[Dict[str, Any]]
    volume: List[Dict[str, Any]]
    indicators: Dict[str, List[Dict[str, Any]]]
    observations: List[Dict[str, Any]]
    technical_snapshot: Dict[str, Any]
    exchange: str
    exchange_timezone: str
    currency: str
    market_status: str
    freshness: str
    data_source: str
    last_updated: str
    range_note: Optional[str] = None
    latest_quote: Optional[Dict[str, Any]] = None


class BatchStockOverviewRequest(BaseModel):
    """Batch stock overview request."""
    symbols: List[str] = Field(..., max_length=50)


class BatchStockOverviewResponse(BaseModel):
    """Batch stock overview response."""
    results: List[Dict[str, Any]]


class SearchRequest(BaseModel):
    """Search request."""
    q: str = Field(..., min_length=1, max_length=100)


class SearchResponse(BaseModel):
    """Search response."""
    results: List[Dict[str, Any]]