"""
Sector Intelligence Feature - Service Implementation
Restores the original sector intelligence functionality.
"""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider, Quote
from backend.core.services.symbol_resolver import resolve_symbol

logger = logging.getLogger(__name__)


class SectorIntelligenceService:
    """Sector Benchmark Intelligence Service."""

    def __init__(self, cache: CacheProtocol, market_data: Optional[MarketDataProvider] = None):
        self._cache = cache
        self._market_data = market_data

    async def get_sector_intelligence(self) -> Dict[str, Any]:
        """Get sector benchmark intelligence with performance and breadth."""
        cache_key = "sector_intelligence"
        cached = await self._cache.get("computed:sector_intelligence", cache_key)
        if cached:
            return cached

        result = await self._compute_sector_intelligence()
        await self._cache.set("computed:sector_intelligence", cache_key, result, ttl=1800)
        return result

    async def _compute_sector_intelligence(self) -> Dict[str, Any]:
        """Compute sector intelligence data."""
        from backend.features.deep_research.service import BENCHMARK_SECTORS

        all_symbols = []
        for sector_data in BENCHMARK_SECTORS.values():
            all_symbols.extend(sector_data["constituents"])
            all_symbols.extend(sector_data.get("us_constituents", []))

        # Fetch quotes if market data available
        quote_map: Dict[str, Quote] = {}
        if self._market_data:
            try:
                quotes = await self._market_data.get_quotes(list(set(all_symbols)))
                quote_map = {s: q for s, q in zip(all_symbols, quotes) if q}
            except Exception as e:
                logger.debug(f"Quote fetch failed: {e}")

        sectors_out = []
        for sector_name, sector_data in BENCHMARK_SECTORS.items():
            constituents = sector_data["constituents"]
            us_constituents = sector_data.get("us_constituents", [])
            all_sector_symbols = constituents + us_constituents

            advancing = 0
            declining = 0
            unchanged = 0
            constituent_perf = []

            for sym in all_sector_symbols:
                q = quote_map.get(sym)
                if q and q.price is not None and q.prev_close is not None and q.prev_close > 0:
                    pct = ((q.price - q.prev_close) / q.prev_close) * 100
                    constituent_perf.append({"symbol": sym, "change_pct": round(pct, 2)})
                    if pct > 0.1:
                        advancing += 1
                    elif pct < -0.1:
                        declining += 1
                    else:
                        unchanged += 1

            # Sector performance from leading asset
            perf_pct = 0.0
            if constituent_perf:
                leading = next((c for c in constituent_perf if c["symbol"] == constituents[0]), None)
                if leading:
                    perf_pct = leading["change_pct"]
                else:
                    perf_pct = round(sum(c["change_pct"] for c in constituent_perf) / len(constituent_perf), 2)

            # Breadth: Advancing / Total Tracked
            total_tracked = len(constituents)
            breadth_pct = round((advancing / total_tracked) * 100, 1) if total_tracked else 0

            sectors_out.append({
                "sector": sector_name,
                "display_name": sector_data["display_name"],
                "benchmark_etf": sector_data["benchmark_etf"],
                "indian_proxy": sector_data["indian_proxy"],
                "us_constituents": us_constituents,
                "performance_24h_pct": perf_pct,
                "advancing": advancing,
                "declining": declining,
                "unchanged": unchanged,
                "total_constituents": total_tracked,
                "breadth_pct": breadth_pct,
                "breadth": f"{advancing}/{total_tracked}",
                "leading_asset": constituents[0],
                "constituent_performance": constituent_perf,
            })

        result = {
            "sectors": sectors_out,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
        }
        return result


def create_sector_intelligence_service(cache: CacheProtocol, market_data: Optional[MarketDataProvider] = None) -> SectorIntelligenceService:
    """Factory function for SectorIntelligenceService."""
    return SectorIntelligenceService(cache=cache, market_data=market_data)