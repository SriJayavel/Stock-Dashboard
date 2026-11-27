"""On-demand, symbol-attributed headlines from a configured news provider."""

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import re
from time import monotonic
from urllib.parse import urlsplit

import httpx
from cachetools import TTLCache

from backend.config import settings

# httpx's INFO request log contains the URL query, including the provider token.
logging.getLogger("httpx").addFilter(lambda record: "api.marketaux.com" not in record.getMessage())

_cache = TTLCache(maxsize=256, ttl=900)
_request_lock = asyncio.Lock()
_cooldown_until = 0.0

_catalysts = (
    (r"\b(earnings|quarterly results|financial results)\b", "Earnings"),
    (r"\b(guidance|outlook)\b", "Guidance"),
    (r"\b(contracts?|deals?|acqui\w*|merger|partnership)\b", "Deal / Contract"),
    (r"\b(ceo|cfo|board appointment)\b", "Management"),
    (r"\b(regulat\w*|lawsuit|antitrust)\b", "Regulatory"),
)


def _normalize_items(payload, symbol):
    items, seen = [], set()
    for story in payload["data"]:
        if not any(entity.get("symbol") == symbol for entity in story.get("entities", [])):
            continue
        title, link, publisher, date = (story.get(key) for key in ("title", "url", "source", "published_at"))
        if not all(isinstance(value, str) and value.strip() for value in (title, link, publisher, date)):
            continue
        try:
            url = urlsplit(link)
        except ValueError:
            continue
        if url.scheme not in {"https", "http"} or not url.hostname or url.username or url.password or link in seen:
            continue
        seen.add(link)
        catalyst = next((label for keyword, label in _catalysts if re.search(keyword, title, re.I)), "Company coverage")
        items.append({
            "title": title,
            "link": link,
            "publisher": publisher,
            "published_date": date,
            "source_type": "Publisher report",
            "impact_area": catalyst,
            "why_it_matters": f"The publisher coverage mentions {symbol}. Compare its timestamp with the price timeline.",
        })
    return items


async def get_attributed_news(symbol: str):
    global _cooldown_until
    token = settings.MARKETAUX_API_TOKEN.get_secret_value().strip()
    if not token:
        return {"news_status": "not_configured", "news_events": []}

    async with _request_lock:
        if symbol in _cache:
            return _cache[symbol]
        unavailable = {"news_status": "unavailable", "news_events": []}
        if monotonic() < _cooldown_until:
            return unavailable
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get("https://api.marketaux.com/v1/news/all", params={
                    "api_token": token,
                    "symbols": symbol,
                    "filter_entities": "true",
                    "must_have_entities": "true",
                    "published_after": cutoff.strftime("%Y-%m-%dT%H:%M:%S"),
                })
                if response.status_code == 429:
                    _cooldown_until = monotonic() + 300
                    return unavailable
                response.raise_for_status()
                items = _normalize_items(response.json(), symbol)
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            _cooldown_until = monotonic() + 30
            return unavailable
        result = {"news_status": "ready", "news_events": items[:8]}
        _cache[symbol] = result
        return result
