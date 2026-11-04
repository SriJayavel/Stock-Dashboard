"""
Research API Routes - Query parser, screener.
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.contracts.market_data import MarketDataProvider
from backend.api.dependencies import (
    get_market_data_dep,
    get_screener_service_dep,
    get_relationship_intelligence_service_dep,
)
from backend.features.screener.service import ScreenerService
from backend.features.relationship_intelligence.service import RelationshipIntelligenceService

router = APIRouter(prefix="/api", tags=["research"])


class ResearchQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language research query")
    active_symbol: str = Field("TCS.NS", description="Currently active asset symbol")


@router.post("/research/query")
async def parse_research_query(
    body: ResearchQueryRequest,
    ri_service: RelationshipIntelligenceService = Depends(get_relationship_intelligence_service_dep),
):
    """Parse natural language to structured data actions."""
    try:
        return await ri_service.parse_query(body.query, body.active_symbol)
    except Exception as e:
        raise HTTPException(500, f"Failed to parse query: {e}")


@router.get("/screener")
async def get_screener(
    universe: str = Query("us_mega_caps", description="Universe to screen"),
    screener_service: ScreenerService = Depends(get_screener_service_dep),
):
    """Multi-market screener."""
    try:
        return await screener_service.get_snapshot(universe)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch screener: {e}")


@router.get("/rss/news")
async def get_rss_news(
    symbol: str = Query(..., description="Ticker symbol (e.g., RELIANCE.NS, TCS.NS)"),
    feed: str = Query("yahoo", description="RSS feed source: yahoo, google, bse"),
):
    """Fallback RSS news endpoint for research view."""
    import httpx
    import xml.etree.ElementTree as ET
    import urllib.parse

    symbol_clean = symbol.replace("/", "").replace(".NS", "").replace(".BO", "").strip()

    # Map to appropriate feed
    feed_urls = {
        "yahoo": f"https://query1.finance.yahoo.com/v1/finance/rss/news?symbol={urllib.parse.quote(symbol)}",
        "google": f"https://news.google.com/rss/search?q={urllib.parse.quote(symbol)}+stock+OR+{urllib.parse.quote(symbol_clean)}&hl=en-US&gl=US&ceid=US:en",
        "bse": f"https://www.bseindia.com/rss.aspx?symbol={urllib.parse.quote(symbol_clean)}",
    }

    url = feed_urls.get(feed, feed_urls["yahoo"])

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(502, f"RSS feed unavailable: {resp.status_code}")

            root = ET.fromstring(resp.text)
            items = []
            for item in root.iter("{http://www.w3.org/2005/Atom}entry"):
                title_elem = item.find("{http://www.w3.org/2005/Atom}title")
                link_elem = item.find("{http://www.w3.org/2005/Atom}link")
                summary_elem = item.find("{http://www.w3.org/2005/Atom}summary")
                updated_elem = item.find("{http://www.w3.org/2005/Atom}updated")

                if title_elem is not None:
                    items.append({
                        "title": title_elem.text or "News Item",
                        "link": link_elem.get("href") if link_elem is not None else "",
                        "summary": summary_elem.text if summary_elem is not None else "",
                        "published_date": updated_elem.text if updated_elem is not None else "",
                        "publisher": "RSS Feed",
                        "impact_area": "News",
                    })

            return {"items": items[:20], "source": feed, "symbol": symbol}
    except ET.ParseError:
        raise HTTPException(502, "Failed to parse RSS feed")
    except httpx.TimeoutException:
        raise HTTPException(504, "RSS feed timeout")
    except Exception as e:
        raise HTTPException(500, f"RSS fetch error: {e}")