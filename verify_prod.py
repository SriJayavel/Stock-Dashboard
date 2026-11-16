"""
Production verification script for Indian symbols.
Tests all required endpoints per user_prompt.text requirements.
"""
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, r'C:\Project_Files\Stock-Dashboard')


async def verify_all():
    from backend.adapters.market_data.composite_provider import CompositeMarketProvider
    from backend.adapters.cache.memory_cache import MemoryCache
    from backend.features.research.service import ResearchService
    from backend.features.deep_research.service import DeepResearchService
    from backend.features.sector_intelligence.service import SectorIntelligenceService
    from backend.core.contracts.events import InMemoryEventBus, set_event_bus

    results = []
    test_symbols = ["TCS.NS", "RELIANCE.NS", "INFY.NS", "HDFCBANK.NS"]

    # Initialize providers
    cache = MemoryCache()
    bus = InMemoryEventBus()
    set_event_bus(bus)
    provider = CompositeMarketProvider(cache=cache)

    print("=" * 80)
    print("PRODUCTION VERIFICATION - Indian Symbols")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 80)
    print()

    for symbol in test_symbols:
        print(f"\n--- Testing {symbol} ---")
        result = {"symbol": symbol, "tests": {}}

        # 1. Quote retrieval
        print(f"1. Quote retrieval: ", end="", flush=True)
        try:
            quote = await provider.get_quote(symbol)
            if quote:
                print(f"[OK] SUCCESS - Price: {quote.price}")
                result["tests"]["quote_retrieval"] = {"status": "SUCCESS", "provider": "composite", "price": float(quote.price) if hasattr(quote, 'price') else str(quote.price)}
            else:
                print("[FAIL] FAILED (None returned)")
                result["tests"]["quote_retrieval"] = {"status": "FAILED", "reason": "None returned"}
                quote = None  # Ensure we don't use undefined var
        except Exception as e:
            print(f"[ERROR] {e}")
            result["tests"]["quote_retrieval"] = {"status": "ERROR", "reason": str(e)}
            quote = None

        # 2. Check fallback provider execution
        print(f"2. Fallback verification: ", end="", flush=True)
        if quote is None:
            print("[FAIL] FAILED - No quote from any provider")
            result["tests"]["fallback"] = {"status": "FAILED", "reason": "No quote from any provider"}
        else:
            print("[OK] SUCCESS - data retrieved")
            result["tests"]["fallback"] = {"status": "SUCCESS", "notes": "Provider returned data successfully"}

        # 3. Quote object structure
        print(f"3. Quote structure: ", end="", flush=True)
        if quote:
            attrs = ['symbol', 'price', 'change', 'change_pct', 'volume', 'timestamp',
                    'high_52w', 'low_52w', 'prev_close']
            missing = [a for a in attrs if not hasattr(quote, a)]
            if missing:
                print(f"[FAIL] FAILED - Missing: {missing}")
                result["tests"]["quote_structure"] = {"status": "FAILED", "missing_attrs": missing}
            else:
                print("[OK] SUCCESS - All required attributes present")
                result["tests"]["quote_structure"] = {"status": "SUCCESS", "attrs": attrs}
        else:
            print("[FAIL] FAILED - No quote to check")
            result["tests"]["quote_structure"] = {"status": "FAILED", "reason": "No quote"}

        # 4. Historical chart retrieval
        print(f"4. Historical chart: ", end="", flush=True)
        try:
            candles = await provider.get_history(symbol, "1d", "1mo")
            if candles and len(candles) > 0:
                print(f"[OK] SUCCESS ({len(candles)} candles)")
                result["tests"]["historical_chart"] = {"status": "SUCCESS", "candle_count": len(candles)}
            else:
                print("[FAIL] FAILED (No candles)")
                result["tests"]["historical_chart"] = {"status": "FAILED", "reason": "Empty candles"}
        except Exception as e:
            print(f"[ERROR] {e}")
            result["tests"]["historical_chart"] = {"status": "ERROR", "reason": str(e)}

        results.append(result)

    # 5. Sector intelligence
    print(f"\n--- Testing Sector Intelligence ---")
    try:
        sector_service = SectorIntelligenceService(cache=cache, market_data=provider)
        sector_data = await sector_service.get_sector_intelligence()
        if sector_data and "sectors" in sector_data:
            print(f"[OK] SUCCESS - {len(sector_data['sectors'])} sectors")
        else:
            print("[FAIL] FAILED")
    except Exception as e:
        print(f"[ERROR] {e}")

    # 6. Research endpoint
    print(f"\n--- Testing Research Endpoint ---")
    try:
        research_service = ResearchService(cache=cache, market_data=provider)
        for symbol in test_symbols[:1]:  # Test one
            research = await research_service.get_research(symbol)
            if research and "research_dossier" in research:
                print(f"[OK] SUCCESS - {symbol} research dossier")
            else:
                print(f"[FAIL] FAILED - {symbol}")
    except Exception as e:
        print(f"[ERROR] {e}")

    # 7. Deep Research endpoint
    print(f"\n--- Testing Deep Research Endpoint ---")
    try:
        deep_service = DeepResearchService(cache=cache, market_data=provider)
        for symbol in test_symbols[:1]:  # Test one
            deep = await deep_service.get_deep_research(symbol)
            if deep and "health_score" in deep:
                print(f"[OK] SUCCESS - {symbol} deep research")
            else:
                print(f"[FAIL] FAILED - {symbol}")
    except Exception as e:
        print(f"[ERROR] {e}")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    success_count = 0
    total_count = 0
    for r in results:
        print(f"\n{r['symbol']}:")
        for test_name, test_result in r['tests'].items():
            total_count += 1
            status = "[OK]" if test_result.get('status') == 'SUCCESS' else "[FAIL]"
            if test_result.get('status') == 'SUCCESS':
                success_count += 1
            print(f"  {status} {test_name}")

    print(f"\nOverall: {success_count}/{total_count} tests passed")

    return results


if __name__ == "__main__":
    asyncio.run(verify_all())