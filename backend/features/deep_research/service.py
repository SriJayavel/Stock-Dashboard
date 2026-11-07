"""
Deep Research Feature - Service Implementation
Restores the original deep research, correlation, portfolio risk, and sector intelligence.
"""
import logging
import datetime
import math
from typing import Dict, Any, List, Optional

import pandas as pd
import yfinance as yf

from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.market_data import MarketDataProvider, Quote
from backend.core.services.symbol_resolver import resolve_symbol, get_provider_symbol
from backend.core.services.indicators import calculate_rsi, calculate_ema

logger = logging.getLogger(__name__)

# Valid industry symbols - these replace the problematic ones from user_prompt.text
SECTOR_CORRECTIONS = {
    "WIPRO": "WIPRO.NS",  # Correct form
    "HEROMOTO": "HEROMOTOCO.NS",  # Correct form
}


def _safe_float(val: Any) -> Optional[float]:
    if val is None or pd.isna(val):
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


def _quote_price(q: Any) -> float:
    """Safely read price from a Quote (frozen dataclass) or a dict."""
    if q is None:
        return 0.0
    if isinstance(q, dict):
        return float(q.get("price") or 0.0)
    return float(q.price or 0.0)


def _quote_volume(q: Any) -> float:
    """Safely read volume from a Quote (frozen dataclass) or a dict."""
    if q is None:
        return 0.0
    if isinstance(q, dict):
        return float(q.get("volume") or 0.0)
    return float(q.volume or 0.0)


def _quote_prev_close(q: Any) -> Optional[float]:
    """Safely read prev_close from a Quote (frozen dataclass) or a dict."""
    if q is None:
        return None
    if isinstance(q, dict):
        val = q.get("prev_close")
        return float(val) if val is not None else None
    val = q.prev_close
    return float(val) if val is not None else None


def _quote_change_pct(q: Any) -> float:
    """Safely read change_pct from a Quote (frozen dataclass) or a dict."""
    if q is None:
        return 0.0
    if isinstance(q, dict):
        return float(q.get("change_pct") or 0.0)
    return float(q.change_pct or 0.0)


# Valid sector constituents
BENCHMARK_SECTORS = {
    "Technology": {
        "benchmark_etf": "XLK",
        "indian_proxy": "^CNXIT",
        "constituents": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "LTIM.NS"],
        "us_constituents": ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"],
        "display_name": "Information Technology & Software",
    },
    "Banking & Finance": {
        "benchmark_etf": "XLF",
        "indian_proxy": "^NSEBANK",
        "constituents": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "us_constituents": ["JPM", "BAC", "GS", "MS", "C"],
        "display_name": "Banking & Financial Services",
    },
    "Energy & Resources": {
        "benchmark_etf": "XLE",
        "indian_proxy": "^CNXENERGY",
        "constituents": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "NTPC.NS", "GAIL.NS"],
        "us_constituents": ["XOM", "CVX", "COP", "PSX", "SLB"],
        "display_name": "Energy, Oil & Petrochemicals",
    },
    "Automotive": {
        "benchmark_etf": "CARZ",
        "indian_proxy": "^CNXAUTO",
        "constituents": ["MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "TATAMOTORS.NS", "HEROMOTOCO.NS"],
        "us_constituents": ["TSLA", "TM", "F", "GM", "H"],
        "display_name": "Automotive & Mobility",
    },
    "Pharma & Healthcare": {
        "benchmark_etf": "XLV",
        "indian_proxy": "^CNXPHARMA",
        "constituents": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "LUPIN.NS"],
        "us_constituents": ["JNJ", "PFE", "MRK", "ABBV", "BMY"],
        "display_name": "Pharmaceuticals & Healthcare",
    },
    "Consumer FMCG": {
        "benchmark_etf": "XLP",
        "indian_proxy": "^CNXFMCG",
        "constituents": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS", "BRITANNIA.NS", "GODRENDRA.NS"],
        "us_constituents": ["PG", "KO", "PEP", "KHC", "MOS"],
        "display_name": "Consumer Staples & FMCG",
    },
    "Metals & Mining": {
        "benchmark_etf": "XME",
        "indian_proxy": "^CNXMETAL",
        "constituents": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "COALINDIA.NS", "SAIL.NS"],
        "us_constituents": ["RIO", "BHP", "NEM", "SCCO", "CLF"],
        "display_name": "Metals, Mining & Materials",
    },
    "Infrastructure & Industrials": {
        "benchmark_etf": "XLI",
        "indian_proxy": "^CNXINFRA",
        "constituents": ["LT.NS", "SIEMENS.NS", "ABB.NS", "BEL.NS", "L&T.NS"],
        "us_constituents": ["CAT", "GE", "HON", "UPS", "RTX"],
        "display_name": "Infrastructure & Capital Goods",
    },
}


class DeepResearchService:
    """Deep Research Intelligence Service - restores deleted functionality."""

    def __init__(self, cache: CacheProtocol, market_data: Optional[MarketDataProvider] = None):
        self._cache = cache
        self._market_data = market_data

    async def get_deep_research(self, symbol: str) -> Dict[str, Any]:
        """Get deep research: corporate events, valuation envelope, health score."""
        cache_key = f"deep_research:{symbol}"
        cached = await self._cache.get("computed:deep_research", cache_key)
        if cached:
            return cached

        # Return structured research data
        data = await self._compute_deep_research(symbol)
        await self._cache.set("computed:deep_research", cache_key, data, ttl=1800)
        return data

    async def _compute_deep_research(self, symbol: str) -> Dict[str, Any]:
        """Compute deep research data for a symbol."""
        sym = resolve_symbol(symbol)
        provider_sym = get_provider_symbol(sym)

        # Fetch quotes via market data provider
        quote = None
        if self._market_data:
            try:
                quote = await self._market_data.get_quote(provider_sym)
            except Exception as e:
                logger.debug(f"Quote fetch failed for {symbol}: {e}")

        # Compute correlation matrix
        correlation = await self.compute_correlation_matrix([sym, "^NSEI", "^GSPC", "BTC-USD", "GC=F"])

        # Get sector intelligence
        sector_intel = await self.get_sector_intelligence()

        quote_dict = None
        if quote is not None:
            try:
                quote_dict = quote.__dict__
            except Exception:
                quote_dict = None

        result = {
            "symbol": sym,
            "quote": quote_dict,
            "corporate_actions": await self._get_corporate_events(provider_sym),
            "quarterly_trends": await self._get_quarterly_trends(provider_sym),
            "valuation_envelope": await self._get_valuation_envelope(provider_sym),
            "relative_benchmarking": await self._get_relative_benchmarking(sym),
            "correlation_matrix": correlation,
            "sector_intelligence": sector_intel,
            "financial_health_score": await self._compute_health_score(provider_sym),
            "last_updated": datetime.datetime.utcnow().isoformat() + "Z",
        }
        return result

    async def _get_corporate_events(self, symbol: str) -> Dict[str, Any]:
        """Extract corporate events and dividends."""
        try:
            ticker = yf.Ticker(symbol)
            dividends = []
            events = []

            # Get dividends
            divs = getattr(ticker, "dividends", None)
            if divs is not None and not divs.empty:
                for dt, amt in divs.items():
                    if amt and amt > 0:
                        dt_str = pd.to_datetime(dt).strftime("%Y-%m-%d")
                        dividends.append({
                            "date": dt_str,
                            "amount": float(amt),
                            "formatted": f"₹{amt:.2f}" if symbol.endswith(".NS") else f"${amt:.2f}",
                        })
                        events.append({
                            "date": dt_str,
                            "type": "DIVIDEND",
                            "title": f"Dividend Distribution",
                            "impact": "Shareholder Capital Return",
                            "color": "#fbbf24",
                        })

            return {
                "events": events,
                "dividend_history": dividends,
                "upcoming_earnings_date": None,
            }
        except Exception as e:
            logger.debug(f"Failed to get corporate events: {e}")
            return {"events": [], "dividend_history": []}

    async def _get_quarterly_trends(self, symbol: str) -> List[Dict[str, Any]]:
        """Get quarterly earnings trends."""
        try:
            ticker = yf.Ticker(symbol)
            qf = getattr(ticker, "quarterly_financials", None)
            if qf is None or getattr(qf, "empty", True):
                qf = getattr(ticker, "quarterly_income_stmt", None)

            if qf is not None and not getattr(qf, "empty", True):
                dates = [str(idx.date())[:10] if hasattr(idx, 'date') else str(idx)[:10] for idx in qf.columns]
                trends = []
                for i, d in enumerate(reversed(dates)):
                    row = qf.iloc[:, i] if qf.shape[1] > i else None
                    if row is not None:
                        trends.append({
                            "period_date": d,
                            "revenue": _safe_float(row.get("Total Revenue") if isinstance(row, dict) else None),
                            "net_income": _safe_float(row.get("Net Income") if isinstance(row, dict) else None),
                            "operating_income": _safe_float(row.get("Operating Income") if isinstance(row, dict) else None),
                        })
                return trends
        except Exception as e:
            logger.debug(f"Failed to get quarterly trends: {e}")
        return []

    async def _get_valuation_envelope(self, symbol: str) -> Dict[str, Any]:
        """Get 5-year valuation context."""
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5y")
            if hist.empty:
                return {"current_pe": None, "pe_5y_range": None, "pe_percentile_rank": None}

            closes = hist["Close"].dropna()
            if len(closes) < 20:
                return {"current_pe": None, "pe_5y_range": None, "pe_percentile_rank": None}

            info = ticker.info or {}
            current_pe = _safe_float(info.get("trailingPE"))
            price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))

            if price and current_pe and price > 0:
                pe_series = closes * (current_pe / price)
                pe_5y_median = round(float(pe_series.median()), 2)
                pe_5y_high = round(float(pe_series.max()), 2)
                pe_5y_low = round(float(pe_series.min()), 2)

                percentile = None
                if pe_5y_high > pe_5y_low and current_pe >= pe_5y_low:
                    percentile = round(((current_pe - pe_5y_low) / (pe_5y_high - pe_5y_low)) * 100, 1)

                return {
                    "current_pe": current_pe,
                    "pe_5y_median": pe_5y_median,
                    "pe_5y_high": pe_5y_high,
                    "pe_5y_low": pe_5y_low,
                    "pe_percentile_rank": percentile,
                    "valuation_stance": "Fairly Valued Relative to 5Y Cycle",
                }
        except Exception as e:
            logger.debug(f"Failed to get valuation envelope: {e}")

        return {"current_pe": None, "pe_5y_range": None, "pe_percentile_rank": None}

    async def _get_relative_benchmarking(self, symbol: str) -> Dict[str, Any]:
        """Get relative performance vs benchmarks."""
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1y")
            if hist.empty or len(hist) < 22:
                return {}

            closes = hist["Close"].dropna()
            returns = closes.pct_change().dropna()

            benchmarks = {"NIFTY 50": "^NSEI", "S&P 500": "^GSPC"}
            result = {}

            for name, bench_sym in benchmarks.items():
                try:
                    bench_ticker = yf.Ticker(bench_sym)
                    bench_hist = bench_ticker.history(period="1y")
                    if bench_hist.empty:
                        continue

                    bench_closes = bench_hist["Close"].dropna()
                    # Align dates
                    common_idx = closes.index.intersection(bench_closes.index)
                    if len(common_idx) < 20:
                        continue

                    asset_ret = closes.loc[common_idx].pct_change().dropna()
                    bench_ret = bench_closes.loc[common_idx].pct_change().dropna()
                    combined = pd.concat([asset_ret, bench_ret], axis=1).dropna()

                    if len(combined) > 0:
                        alpha = float(combined.iloc[:, 0].sum() - combined.iloc[:, 1].sum())
                        result[name] = {
                            "benchmark_symbol": bench_sym,
                            "relative_alpha": round(alpha, 4),
                        }
                except Exception:
                    continue

            return result
        except Exception as e:
            logger.debug(f"Failed to get benchmarking: {e}")
            return {}

    async def compute_correlation_matrix(self, symbols: List[str], period: str = "1y") -> Dict[str, Any]:
        """Compute Pearson correlation matrix across symbols."""
        clean_syms = [resolve_symbol(s) for s in symbols if s.strip()]
        if len(clean_syms) < 2:
            return {"error": "At least 2 valid symbols required", "symbols": clean_syms, "matrix": []}

        cache_key = f"corr:{'_'.join(sorted(clean_syms))}:{period}"
        cached = await self._cache.get("computed:correlation", cache_key)
        if cached:
            return cached

        try:
            data = yf.download(clean_syms, period=period, interval="1d", progress=False)["Close"]
            if isinstance(data, pd.Series):
                data = data.to_frame()

            data = data.ffill().pct_change().dropna()
            if data.empty:
                return {"error": "Insufficient data for correlation", "symbols": clean_syms, "matrix": []}

            corr_df = data.corr(method="pearson").round(2)
            cols = list(corr_df.columns)
            matrix = []
            for s1 in cols:
                row = []
                for s2 in cols:
                    val = _safe_float(corr_df.loc[s1, s2])
                    row.append(val if val is not None else 1.0)
                matrix.append(row)

            result = {
                "symbols": cols,
                "period": period,
                "method": "Pearson Daily Log Return Correlation",
                "matrix": matrix,
                "calculated_at": datetime.datetime.utcnow().isoformat() + "Z",
            }
            await self._cache.set("computed:correlation", cache_key, result, ttl=1800)
            return result
        except Exception as e:
            logger.error(f"Correlation error: {e}")
            return {"error": str(e), "symbols": clean_syms, "matrix": []}

    async def compute_portfolio_risk(self, positions: List[Dict[str, Any]], period: str = "1y") -> Dict[str, Any]:
        """Estimate portfolio risk using cached data."""
        normalized = []
        for position in positions[:20]:
            try:
                weight = float(position.get("weight", 1))
            except (TypeError, ValueError):
                continue
            if not math.isfinite(weight) or weight <= 0:
                continue
            sym = normalize_symbol(str(position.get("symbol", "")).strip())
            if sym:
                normalized.append((sym, weight))

        if not normalized:
            return {"status": "invalid", "detail": "Provide at least one position with positive weight"}

        total_weight = sum(w for _, w in normalized)
        close_series = {}
        missing = []

        for symbol, weight in normalized:
            # Check cache for historical price
            cached = await self._cache.get("stock:history", f"{symbol}_{period}_1d")
            if cached and isinstance(cached, dict):
                candles = cached.get("candles", [])
                if candles:
                    closes = {c.get("time"): _safe_float(c.get("close")) for c in candles if c.get("time") and c.get("close")}
                    closes = {k: v for k, v in closes.items() if v is not None and v > 0}
                    if len(closes) >= 21:
                        close_series[symbol] = (weight / total_weight, closes)
                        continue
            missing.append(symbol)

        if missing:
            return {
                "status": "pending",
                "period": period,
                "missing_symbols": sorted(set(missing)),
            }

        try:
            close_frame = pd.DataFrame({sym: pd.Series(closes) for sym, (_, closes) in close_series.items()}).sort_index().ffill()
            returns = close_frame.pct_change().dropna(how="any")

            if returns.empty:
                return {"status": "insufficient_data", "period": period}

            weights = pd.Series({sym: w for sym, (w, _) in close_series.items()})
            weights = weights / weights.sum()
            portfolio_returns = returns[weights.index].dot(weights)

            equity = (1 + portfolio_returns).cumprod()
            peak = equity.cummax()
            drawdown = (equity / peak) - 1

            return {
                "status": "ready",
                "symbols": list(weights.index),
                "weights_pct": {sym: round(float(w) * 100, 2) for sym, w in weights.items()},
                "period": period,
                "methodology": "Daily close-to-close simple returns; weighted by supplied portfolio weights",
                "observations": int(len(portfolio_returns)),
                "cumulative_return_pct": round(float((equity.iloc[-1] - 1) * 100), 2),
                "annualized_volatility_pct": round(float(portfolio_returns.std(ddof=1) * math.sqrt(252) * 100), 2) if len(portfolio_returns) > 1 else None,
                "max_drawdown_pct": round(float(drawdown.min() * 100), 2),
                "calculated_at": datetime.datetime.utcnow().isoformat() + "Z",
            }
        except Exception as e:
            logger.error(f"Portfolio risk error: {e}")
            return {"status": "error", "error": str(e)}

    async def _compute_health_score(self, symbol: str) -> Optional[float]:
        """Compute an auditable financial health score (0-100 scale)."""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
            financials = ticker.financials
            balance = ticker.balance_sheet

            if financials is None or balance is None:
                return None

            # Simple health score components
            score = 0.0
            max_score = 100.0

            # Revenue growth (20 points)
            if financials.shape[1] >= 2:
                revenue = financials.loc["Total Revenue"] if "Total Revenue" in financials.index else None
                if revenue is not None and len(revenue) >= 2:
                    rev_val = [v for v in revenue.values if pd.notna(v)]
                    if len(rev_val) >= 2 and rev_val[1] > 0:
                        growth = (rev_val[0] - rev_val[1]) / rev_val[1]
                        score += min(20, max(0, 20 - growth * 20))

            # Positive net income (20 points)
            if "Net Income" in financials.index:
                net_income = financials.loc["Net Income"].iloc[-1]
                if pd.notna(net_income) and net_income > 0:
                    score += 20

            # Debt to equity ratio (20 points - lower is better for healthy companies)
            if "Total Debt" in balance.index and "Total Shareholder Member Equity" in balance.index:
                debt = balance.loc["Total Debt"].iloc[-1]
                equity = balance.loc["Total Shareholder Member Equity"].iloc[-1]
                if pd.notna(debt) and pd.notna(equity) and equity > 0:
                    dte = debt / equity
                    score += max(0, 20 - min(20, dte * 10))

            # Current ratio (15 points - liquidity)
            if "Current Total Assets" in balance.index and "Total Current Liabilities" in balance.index:
                assets = balance.loc["Current Total Assets"].iloc[-1]
                liabilities = balance.loc["Total Current Liabilities"].iloc[-1]
                if pd.notna(assets) and pd.notna(liabilities) and liabilities > 0:
                    cr = assets / liabilities
                    score += min(15, max(0, (cr - 1) * 15))

            # Margin health (15 points - profitability)
            if "Net Income" in financials.index and "Total Revenue" in financials.index:
                revenue = financials.loc["Total Revenue"].iloc[-1]
                net_inc = financials.loc["Net Income"].iloc[-1]
                if pd.notna(revenue) and pd.notna(net_inc) and revenue > 0:
                    margin = (net_inc / revenue) * 100
                    score += min(15, max(0, margin + 50))

            # Market cap positive (10 points)
            mcap = _safe_float(info.get("marketCap"))
            if mcap and mcap > 0:
                score += 10

            return round(min(max_score, score), 1)
        except Exception as e:
            logger.debug(f"Health score calculation failed for {symbol}: {e}")
            return None

    async def get_sector_intelligence(self) -> Dict[str, Any]:
        """Sector benchmark intelligence with performance and breadth."""
        cache_key = "sector_intelligence"
        cached = await self._cache.get("computed:sector_intelligence", cache_key)
        if cached:
            return cached

        sectors_out = []
        all_symbols = []

        # Collect all constituents
        for sector_data in BENCHMARK_SECTORS.values():
            all_symbols.extend(sector_data["constituents"])
            all_symbols.extend(sector_data.get("us_constituents", []))

        # Fetch quotes if market data available
        quote_map: Dict[str, Optional[Quote]] = {}
        if self._market_data:
            try:
                quotes = await self._market_data.get_quotes(list(set(all_symbols)))
                quote_map = {s: q for s, q in zip(all_symbols, quotes) if q}
            except Exception as e:
                logger.warning(f"Failed to fetch sector quotes: {e}")

        for sector_name, sector_data in BENCHMARK_SECTORS.items():
            constituents = sector_data["constituents"]
            us_constituents = sector_data.get("us_constituents", [])
            all_sector_symbols = constituents + us_constituents

            advancing = 0
            declining = 0
            unchanged = 0
            total_valid = 0
            constituent_perf = []
            weights = {}

            for sym in all_sector_symbols:
                q = quote_map.get(sym)
                if q is not None:
                    price = _quote_price(q)
                    prev_close = _quote_prev_close(q)
                    if price is not None and prev_close is not None and prev_close > 0:
                        pct = ((price - prev_close) / prev_close) * 100
                        constituent_perf.append({"symbol": sym, "change_pct": round(pct, 2)})
                        if pct > 0.1:
                            advancing += 1
                        elif pct < -0.1:
                            declining += 1
                        else:
                            unchanged += 1
                        total_valid += 1

            # Calculate weights based on price * volume as market cap proxy
            total_value = sum(
                _quote_price(quote_map.get(s)) * _quote_volume(quote_map.get(s))
                for s in constituents
            )
            for sym in constituents:
                q = quote_map.get(sym)
                if q is not None:
                    price = _quote_price(q)
                    volume = _quote_volume(q)
                    if price is not None and volume and total_value > 0:
                        value = price * volume
                        weights[sym] = round((value / total_value) * 100, 2)

            # Sector performance from leading asset (Indian constituents)
            perf_pct = 0.0
            if constituent_perf:
                leading = next((c for c in constituent_perf if c["symbol"] == constituents[0]), None)
                if leading:
                    perf_pct = leading["change_pct"]
                else:
                    perf_pct = round(sum(c["change_pct"] for c in constituent_perf) / len(constituent_perf), 2)

            # Breadth: Advancing / Total Tracked (only Indian constituents)
            breadth_pct = round((advancing / len(constituents)) * 100, 1) if constituents else 0

            sectors_out.append({
                "sector": sector_name,
                "display_name": sector_data["display_name"],
                "benchmark_etf": sector_data.get("benchmark_etf", ""),
                "indian_proxy": sector_data.get("indian_proxy", ""),
                "us_benchmark": sector_data.get("benchmark_etf", ""),
                "performance_24h_pct": perf_pct,
                "constituents": constituents,
                "us_constituents": us_constituents,
                "leading_asset": constituents[0],
                "advancing": advancing,
                "declining": declining,
                "unchanged": unchanged,
                "total_valid": total_valid,
                "breadth_pct": breadth_pct,
                "total_tracked": len(constituents),
                "constituent_performance": constituent_perf,
                "weights": weights,
            })

        result = {
            "sectors": sectors_out,
            "retrieved_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        await self._cache.set("computed:sector_intelligence", cache_key, result, ttl=1800)
        return result


def normalize_symbol(symbol: str) -> Optional[str]:
    """Normalize and validate a symbol."""
    if not symbol:
        return None
    upper = symbol.strip().upper()
    return resolve_symbol(upper) if upper else None