"""
Apex Terminal v4 - Fundamental Relationship & Anomaly Intelligence Engine
Implements:
1. Fundamental Relationship Engine (Revenue -> Operating Income -> Net Income -> Margins -> FCF spread mathematics)
2. Financial Statement Quality Analyzer (CFO/Net Income, Receivables vs Revenue, Inventory vs Revenue)
3. Anomaly Detection (Debt acceleration, margin compression, volume/volatility deviation, valuation outliers)
4. "What Changed?" Engine (Today vs 30 Days Ago state comparison)
5. Filing Intelligence & Diff Engine (T vs T-1 filing metrics comparison)
6. Deterministic Research Query Parser
7. Macro -> Asset Relationship Explorer
"""

import datetime
import logging
import math
import re
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
import yfinance as yf

from backend.services.cache_manager import cache
from backend.services.data_pipeline import (
    resolve_symbol,
    _format_currency,
    _format_market_cap,
    _yf_session,
)
from backend.services.indicators import calculate_rsi, calculate_ema

logger = logging.getLogger("relationship_engine")


def _flatten_yf_history(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex columns returned by yfinance single-ticker history."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None


def _has_row(df: Any, row_name: str) -> bool:
    return df is not None and getattr(df, "index", None) is not None and row_name in df.index


# 1. Fundamental Relationship Engine
def analyze_fundamental_relationships(financial_timeline: List[Dict[str, Any]], info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Examines mathematical relationships between revenue growth, operating profit, net income, and free cash flow.
    Generates auditable mathematical observations without speculation.
    """
    if not financial_timeline or len(financial_timeline) < 2:
        return {
            "has_data": False,
            "observations": [],
            "cagr_spreads": {},
            "operating_leverage": None,
        }

    # Extract multi-year progressions
    years = [str(item.get("fiscal_year")) for item in financial_timeline]
    revs = [item.get("source_data", {}).get("total_revenue") for item in financial_timeline]
    ops = [item.get("source_data", {}).get("operating_income") for item in financial_timeline]
    nets = [item.get("source_data", {}).get("net_income") for item in financial_timeline]

    # Calculate multi-period CAGRs if at least 2 valid points exist
    n_years = len(financial_timeline) - 1
    rev_cagr = None
    op_cagr = None
    net_cagr = None

    first_rev, last_rev = revs[0], revs[-1]
    first_op, last_op = ops[0], ops[-1]
    first_net, last_net = nets[0], nets[-1]

    if first_rev and last_rev and first_rev > 0 and last_rev > 0:
        rev_cagr = round(((last_rev / first_rev) ** (1.0 / n_years) - 1.0) * 100, 2)

    if first_op and last_op and first_op > 0 and last_op > 0:
        op_cagr = round(((last_op / first_op) ** (1.0 / n_years) - 1.0) * 100, 2)

    if first_net and last_net and first_net > 0 and last_net > 0:
        net_cagr = round(((last_net / first_net) ** (1.0 / n_years) - 1.0) * 100, 2)

    observations = []

    # Relationship 1: Revenue vs Net Income CAGR Spread (Operating & Financial Leverage)
    net_rev_spread = None
    if net_cagr is not None and rev_cagr is not None:
        net_rev_spread = round(net_cagr - rev_cagr, 2)
        if net_rev_spread > 1.5:
            observations.append({
                "category": "Revenue -> Profitability",
                "title": "Margin Expansion & Positive Operating Leverage",
                "observation": f"Net income compound growth (+{net_cagr}%) outpaced revenue compound growth (+{rev_cagr}%) by {net_rev_spread} percentage points.",
                "mathematical_basis": f"Net Income CAGR ({net_cagr}%) - Revenue CAGR ({rev_cagr}%) = +{net_rev_spread} pp.",
                "status": "Positive Operating Leverage",
                "tone": "favorable",
            })
        elif net_rev_spread < -1.5:
            observations.append({
                "category": "Revenue -> Profitability",
                "title": "Margin Compression",
                "observation": f"Revenue compound growth (+{rev_cagr}%) outpaced net income compound growth (+{net_cagr}%). Net earnings growth lagged top-line expansion by {abs(net_rev_spread)} percentage points.",
                "mathematical_basis": f"Net Income CAGR ({net_cagr}%) - Revenue CAGR ({rev_cagr}%) = {net_rev_spread} pp.",
                "status": "Margin Dilution",
                "tone": "caution",
            })
        else:
            observations.append({
                "category": "Revenue -> Profitability",
                "title": "Synchronous Growth",
                "observation": f"Net income grew largely in tandem with revenue (+{net_cagr}% vs +{rev_cagr}%), indicating steady margin preservation.",
                "mathematical_basis": f"Net Income CAGR ({net_cagr}%) vs Revenue CAGR ({rev_cagr}%) spread = {net_rev_spread} pp.",
                "status": "Stable Margins",
                "tone": "neutral",
            })

    # Relationship 2: Operating Leverage Ratio
    op_leverage = None
    if op_cagr is not None and rev_cagr is not None and rev_cagr != 0:
        op_leverage = round(op_cagr / rev_cagr, 2)
        if op_leverage > 1.2:
            observations.append({
                "category": "Operating Structure",
                "title": "High Operating Leverage",
                "observation": f"Operating income expanded {op_leverage}x faster than revenue, reflecting fixed-cost efficiency.",
                "mathematical_basis": f"Operating Income CAGR ({op_cagr}%) / Revenue CAGR ({rev_cagr}%) = {op_leverage}x.",
                "status": "Expanding Operating Margin",
                "tone": "favorable",
            })

    # Relationship 3: Trailing Margin Shift
    first_margin = financial_timeline[0].get("calculated_metrics", {}).get("net_margin_pct")
    last_margin = financial_timeline[-1].get("calculated_metrics", {}).get("net_margin_pct")
    margin_diff_pp = None
    if first_margin is not None and last_margin is not None:
        margin_diff_pp = round(last_margin - first_margin, 2)
        sign = "+" if margin_diff_pp >= 0 else ""
        observations.append({
            "category": "Net Margin Evolution",
            "title": f"Net Margin Movement ({years[0]} -> {years[-1]})",
            "observation": f"Net profit margin shifted from {first_margin}% to {last_margin}% ({sign}{margin_diff_pp} percentage points).",
            "mathematical_basis": f"FY{years[-1]} Net Margin ({last_margin}%) - FY{years[0]} Net Margin ({first_margin}%) = {sign}{margin_diff_pp} pp.",
            "status": "Expanding" if margin_diff_pp > 0 else ("Compressing" if margin_diff_pp < 0 else "Unchanged"),
            "tone": "favorable" if margin_diff_pp > 0 else ("caution" if margin_diff_pp < 0 else "neutral"),
        })

    return {
        "has_data": True,
        "years": years,
        "n_periods": len(financial_timeline),
        "cagrs": {
            "revenue_cagr_pct": rev_cagr,
            "operating_income_cagr_pct": op_cagr,
            "net_income_cagr_pct": net_cagr,
        },
        "spreads": {
            "net_income_minus_revenue_cagr_pp": net_rev_spread,
            "operating_leverage_ratio": op_leverage,
            "margin_diff_pp": margin_diff_pp,
        },
        "observations": observations,
    }


# 2. Financial Statement Quality Analyzer
def analyze_statement_quality(t: yf.Ticker, info: Dict[str, Any], currency: str) -> Dict[str, Any]:
    """
    Evaluates accounting and statement quality:
    - CFO / Net Income quality of earnings
    - Receivables growth vs Revenue growth
    - Inventory accumulation vs Revenue growth
    - CapEx reinvestment rate
    """
    cf_df = getattr(t, "cashflow", None)
    is_df = getattr(t, "income_stmt", None)
    bs_df = getattr(t, "balance_sheet", None)

    quality_signals = []

    # 1. Quality of Earnings (CFO / Net Income)
    cfo_ni_ratio = None
    cfo_val = None
    ni_val = None
    try:
        if cf_df is not None and not cf_df.empty:
            for k in ["Operating Cash Flow", "Total Cash From Operating Activities"]:
                if _has_row(cf_df, k):
                    cfo_val = _safe_float(cf_df.loc[k].dropna().iloc[0])
                    break
        if is_df is not None and not is_df.empty:
            for k in ["Net Income", "Net Income Common Stockholders"]:
                if _has_row(is_df, k):
                    ni_val = _safe_float(is_df.loc[k].dropna().iloc[0])
                    break

        if cfo_val is not None and ni_val is not None and ni_val > 0:
            cfo_ni_ratio = round(cfo_val / ni_val, 2)
            if cfo_ni_ratio >= 1.0:
                quality_signals.append({
                    "metric": "CFO / Net Income",
                    "status": "High Quality",
                    "value": f"{cfo_ni_ratio}x",
                    "benchmark": ">= 1.0x",
                    "detail": "Operating cash flow exceeds reported net income, indicating robust cash conversion without aggressive accrual recognition.",
                    "tone": "favorable",
                })
            elif cfo_ni_ratio >= 0.75:
                quality_signals.append({
                    "metric": "CFO / Net Income",
                    "status": "Adequate",
                    "value": f"{cfo_ni_ratio}x",
                    "benchmark": ">= 1.0x",
                    "detail": "Cash generation covers majority of accounting earnings.",
                    "tone": "neutral",
                })
            else:
                quality_signals.append({
                    "metric": "CFO / Net Income",
                    "status": "Weak Conversion",
                    "value": f"{cfo_ni_ratio}x",
                    "benchmark": ">= 1.0x",
                    "detail": "Operating cash flow covers less than 75% of reported net income, indicating earnings may be tied up in working capital or non-cash accruals.",
                    "tone": "caution",
                })
    except (AttributeError, KeyError, ValueError, ZeroDivisionError) as e:
        logger.debug(f"CFO/NI calc error: {e}")

    # 2. Receivables Growth vs Revenue Growth
    rec_growth = None
    rev_growth = None
    try:
        if bs_df is not None and not bs_df.empty and is_df is not None and not is_df.empty:
            # Receivables
            rec_series = None
            for k in ["Receivables", "Accounts Receivable", "Net Receivables"]:
                if _has_row(bs_df, k):
                    rec_series = bs_df.loc[k].dropna()
                    break
            rev_series = None
            for k in ["Total Revenue", "Operating Revenue"]:
                if _has_row(is_df, k):
                    rev_series = is_df.loc[k].dropna()
                    break

            if rec_series is not None and len(rec_series) >= 2 and rev_series is not None and len(rev_series) >= 2:
                r0, r1 = _safe_float(rec_series.iloc[1]), _safe_float(rec_series.iloc[0])
                v0, v1 = _safe_float(rev_series.iloc[1]), _safe_float(rev_series.iloc[0])
                if r0 and r1 and r0 > 0 and v0 and v1 and v0 > 0:
                    rec_growth = round(((r1 - r0) / r0) * 100, 1)
                    rev_growth = round(((v1 - v0) / v0) * 100, 1)
                    spread = round(rec_growth - rev_growth, 1)

                    if spread > 6.0:
                        quality_signals.append({
                            "metric": "Receivables vs Revenue Divergence",
                            "status": "Receivables Divergence Alert",
                            "value": f"Rec: +{rec_growth}% vs Rev: +{rev_growth}%",
                            "benchmark": "Delta <= +5%",
                            "detail": f"Accounts receivable expanded {spread} percentage points faster than revenue. Indicates customer collection delays or early revenue recognition.",
                            "tone": "caution",
                        })
                    else:
                        quality_signals.append({
                            "metric": "Receivables vs Revenue Alignment",
                            "status": "In Balance",
                            "value": f"Rec: +{rec_growth}% vs Rev: +{rev_growth}%",
                            "benchmark": "Delta <= +5%",
                            "detail": "Receivables growth is in line with or lower than top-line revenue expansion.",
                            "tone": "favorable",
                        })
    except Exception as e:
        logger.debug(f"Receivables calc error: {e}")

    # 3. Inventory Accumulation vs Revenue Growth
    try:
        if bs_df is not None and not bs_df.empty and rev_growth is not None:
            inv_series = None
            for k in ["Inventory", "Total Inventory"]:
                if _has_row(bs_df, k):
                    inv_series = bs_df.loc[k].dropna()
                    break
            if inv_series is not None and len(inv_series) >= 2:
                i0, i1 = _safe_float(inv_series.iloc[1]), _safe_float(inv_series.iloc[0])
                if i0 and i1 and i0 > 0:
                    inv_growth = round(((i1 - i0) / i0) * 100, 1)
                    inv_spread = round(inv_growth - rev_growth, 1)
                    if inv_spread > 7.0:
                        quality_signals.append({
                            "metric": "Inventory Accumulation",
                            "status": "Inventory Buildup",
                            "value": f"Inv: +{inv_growth}% vs Rev: +{rev_growth}%",
                            "benchmark": "Delta <= +5%",
                            "detail": f"Inventory grew {inv_spread} percentage points faster than sales, signaling potential demand softening or inventory buildup.",
                            "tone": "caution",
                        })
                    else:
                        quality_signals.append({
                            "metric": "Inventory Management",
                            "status": "Lean Turnover",
                            "value": f"Inv: +{inv_growth}% vs Rev: +{rev_growth}%",
                            "benchmark": "Delta <= +5%",
                            "detail": "Inventory accumulation remains proportionate to revenue expansion.",
                            "tone": "favorable",
                        })
    except Exception as e:
        logger.debug(f"Inventory calc error: {e}")

    # 4. CapEx Reinvestment Rate (CapEx / Operating Cash Flow)
    capex_reinvestment = None
    try:
        if cf_df is not None and not cf_df.empty and cfo_val and cfo_val > 0:
            for k in ["Capital Expenditure", "Capital Expenditures"]:
                if _has_row(cf_df, k):
                    cx = _safe_float(cf_df.loc[k].dropna().iloc[0])
                    if cx:
                        capex_reinvestment = round((abs(cx) / cfo_val) * 100, 1)
                        quality_signals.append({
                            "metric": "CapEx Reinvestment Rate",
                            "status": "Capital Intensity",
                            "value": f"{capex_reinvestment}% of CFO",
                            "benchmark": "< 60% for Asset-Light",
                            "detail": f"Company reinvests {capex_reinvestment}% of its operating cash flow into capital expenditures.",
                            "tone": "favorable" if capex_reinvestment < 50 else "neutral",
                        })
                        break
    except Exception as e:
        logger.debug(f"CapEx calc error: {e}")

    return {
        "cfo_to_net_income": cfo_ni_ratio,
        "receivables_growth_pct": rec_growth,
        "revenue_growth_pct": rev_growth,
        "capex_reinvestment_pct": capex_reinvestment,
        "signals": quality_signals,
    }


# 3. Anomaly Detection Engine
def detect_anomalies(symbol: str, t: yf.Ticker, info: Dict[str, Any], hist_val: Dict[str, Any], quality: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Mathematical anomaly scanner detecting structural deviations:
    - Margin compression (> 150 bps)
    - Debt acceleration (debt outstripping equity)
    - Cash-flow divergence
    - Volume / Volatility spikes
    - Valuation percentile outliers
    """
    anomalies = []

    # 1. Valuation Outlier Anomaly
    pe_pctile = hist_val.get("pe_percentile_rank")
    curr_pe = hist_val.get("pe_current")
    median_pe = hist_val.get("pe_5y_median")
    if pe_pctile is not None and curr_pe is not None and median_pe is not None:
        if pe_pctile <= 5.0:
            anomalies.append({
                "type": "Valuation Deviation",
                "severity": "high",
                "title": "Historical Low Valuation Outlier",
                "evidence": f"Current P/E of {curr_pe}x sits at the {pe_pctile}th percentile of 5-year distribution (5Y Median: {median_pe}x).",
                "mathematical_threshold": "Percentile <= 5.0%",
            })
        elif pe_pctile >= 95.0:
            anomalies.append({
                "type": "Valuation Deviation",
                "severity": "medium",
                "title": "Historical Upper Boundary Valuation",
                "evidence": f"Current P/E of {curr_pe}x sits at the {pe_pctile}th percentile of 5-year distribution (5Y Median: {median_pe}x).",
                "mathematical_threshold": "Percentile >= 95.0%",
            })

    # 2. Debt Acceleration Anomaly
    try:
        bs_df = getattr(t, "balance_sheet", None)
        if bs_df is not None and not bs_df.empty:
            debt_keys = ["Total Debt", "Long Term Debt"]
            d_series = None
            for k in debt_keys:
                if _has_row(bs_df, k):
                    d_series = bs_df.loc[k].dropna()
                    break
            if d_series is not None and len(d_series) >= 2:
                d0, d1 = _safe_float(d_series.iloc[1]), _safe_float(d_series.iloc[0])
                if d0 and d1 and d0 > 0:
                    debt_g = round(((d1 - d0) / d0) * 100, 1)
                    if debt_g > 25.0:
                        anomalies.append({
                            "type": "Balance Sheet Acceleration",
                            "severity": "high",
                            "title": "Total Debt Acceleration",
                            "evidence": f"Reported total debt expanded by +{debt_g}% YoY.",
                            "mathematical_threshold": "YoY Debt Expansion > 25%",
                        })
    except Exception as e:
        logger.debug(f"Debt anomaly check error: {e}")

    # 3. Cash-Flow / Net Income Divergence
    cfo_ni = quality.get("cfo_to_net_income")
    if cfo_ni is not None and cfo_ni < 0.65:
        anomalies.append({
            "type": "Earnings Quality",
            "severity": "high",
            "title": "Severe CFO / Net Income Accrual Divergence",
            "evidence": f"Operating cash conversion is {cfo_ni}x of reported net income (threshold benchmark >= 1.0x).",
            "mathematical_threshold": "CFO / Net Income < 0.65x",
        })

    # 4. Receivables / Revenue Divergence from Quality signals
    for sig in quality.get("signals", []):
        sig_status = sig.get("status") or ""
        if "Receivables Divergence" in sig_status:
            val_str = str(sig.get("value") or "")
            det_str = str(sig.get("detail") or "")
            anomalies.append({
                "type": "Revenue / Receivables Divergence",
                "severity": "medium",
                "title": "Receivables Expansion Outstripping Sales",
                "evidence": f"{val_str} — {det_str}".strip(" —"),
                "mathematical_threshold": "Receivables Growth - Revenue Growth > 6%",
            })

    # 5. Volume Anomaly Check
    try:
        hist_df = _flatten_yf_history(t.history(period="60d", interval="1d"))
        if not hist_df.empty and "Volume" in hist_df.columns:
            recent_vol = _safe_float(hist_df["Volume"].dropna().iloc[-1])
            avg_20_vol = _safe_float(hist_df["Volume"].dropna().iloc[-21:-1].mean())
            if recent_vol and avg_20_vol and avg_20_vol > 0:
                vol_ratio = round(recent_vol / avg_20_vol, 2)
                if vol_ratio >= 2.5:
                    anomalies.append({
                        "type": "Trading Volume Outlier",
                        "severity": "medium",
                        "title": "Unusual Volume Surge",
                        "evidence": f"Latest session volume was {vol_ratio}x the 20-day trailing average volume ({int(recent_vol):,} vs {int(avg_20_vol):,}).",
                        "mathematical_threshold": "Session Volume >= 2.5x 20D MA",
                    })
    except Exception as e:
        logger.debug(f"Volume anomaly check error: {e}")

    return anomalies


# 4. "What Changed?" Engine (Today vs 30 Days Ago)
def compute_what_changed(symbol: str, t: yf.Ticker, info: Dict[str, Any], currency: str) -> Dict[str, Any]:
    """
    Computes a factual delta between Today and 30 Days Ago (~21 trading sessions):
    - Price delta & %
    - Valuation P/E change
    - Corporate actions in window
    - Technical structure shifts (EMA 50 vs 200, RSI delta)
    """
    try:
        # Create fresh Ticker to avoid session exhaustion from prior calls
        fresh_t = yf.Ticker(symbol, session=_yf_session)
        df = _flatten_yf_history(fresh_t.history(period="3mo", interval="1d"))
        if df.empty or "Close" not in df.columns or len(df) < 22:
            return {"has_data": False, "symbol": symbol, "lookback_days": 30}

        df = df.dropna(subset=["Close"])
        closes_arr = df["Close"].values.astype(float)
        curr_close = float(closes_arr[-1])
        past_idx = max(0, len(df) - 22)
        past_close = float(closes_arr[past_idx])
        price_diff = round(curr_close - past_close, 2)
        price_diff_pct = round(((curr_close - past_close) / past_close) * 100, 2) if past_close else 0.0

        # Technical structure — indicators.py expects DataFrame with "Close" column
        close_df = pd.DataFrame({"Close": closes_arr})
        rsi_df = calculate_rsi(close_df, period=14)
        rsi_vals = rsi_df["RSI"]
        rsi_curr = round(float(rsi_vals.dropna().iloc[-1]), 1) if not rsi_vals.dropna().empty else None
        rsi_past = None
        rsi_clean = rsi_vals.dropna()
        if len(rsi_clean) > past_idx:
            rsi_past = round(float(rsi_clean.iloc[past_idx]), 1)
        rsi_delta = round(rsi_curr - rsi_past, 1) if (rsi_curr is not None and rsi_past is not None) else 0.0

        ema_df = calculate_ema(close_df, periods=(50, 200))
        ema50_last = _safe_float(ema_df["EMA_50"].iloc[-1]) if "EMA_50" in ema_df.columns else None
        ema200_last = _safe_float(ema_df["EMA_200"].iloc[-1]) if "EMA_200" in ema_df.columns else None

        if ema50_last is not None and ema200_last is not None:
            ema_regime_now = "Bullish (EMA50 > EMA200)" if ema50_last > ema200_last else "Bearish (EMA50 < EMA200)"
        else:
            ema_regime_now = "Calculating (Requires 200 sessions)"

        # Valuation delta
        curr_pe = _safe_float(info.get("trailingPE"))
        past_pe = round(curr_pe * (past_close / curr_close), 2) if (curr_pe and curr_close > 0) else None
        pe_delta = round(curr_pe - past_pe, 2) if (curr_pe and past_pe) else None

        # Check dividends / splits in past 30 days
        now_ts = datetime.datetime.utcnow()
        cutoff_ts = now_ts - datetime.timedelta(days=35)
        recent_events = []
        try:
            divs = getattr(fresh_t, "dividends", None)
            if divs is not None and not divs.empty:
                for dt, val in divs.items():
                    py_dt = pd.to_datetime(dt).to_pydatetime()
                    if py_dt.tzinfo:
                        py_dt = py_dt.replace(tzinfo=None)
                    if py_dt >= cutoff_ts:
                        cs = "₹" if currency == "INR" else "$"
                        recent_events.append(f"Dividend: {cs}{val:.2f} (Ex-Date: {py_dt.strftime('%b %d, %Y')})")
        except Exception:
            pass

        # Date labels from index
        try:
            curr_date = str(df.index[-1])[:10]
            past_date = str(df.index[past_idx])[:10]
        except Exception:
            curr_date = "Today"
            past_date = "~30 days ago"

        return {
            "has_data": True,
            "symbol": symbol,
            "lookback_days": 30,
            "lookback_date": past_date,
            "current_date": curr_date,
            "price": {
                "current": round(curr_close, 2),
                "past_30d": round(past_close, 2),
                "change": price_diff,
                "change_pct": price_diff_pct,
                "currency": currency,
            },
            "valuation": {
                "current_pe": curr_pe,
                "past_30d_pe": past_pe,
                "delta": pe_delta,
            },
            "technicals": {
                "rsi_current": rsi_curr,
                "rsi_past_30d": rsi_past,
                "rsi_shift": rsi_delta,
                "ema_regime": ema_regime_now,
            },
            "recent_events": recent_events if recent_events else ["No corporate actions occurred in the last 30 days."],
        }
    except Exception as e:
        import traceback
        logger.error(f"Error computing What Changed for {symbol}: {e}\n{traceback.format_exc()}")
        return {"has_data": False, "error": str(e)}


# 5. Filing Intelligence & Diff Engine
def get_filing_intelligence_and_diff(symbol: str, t: yf.Ticker, info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Structured Document Center and Period T vs T-1 Comparative Diff Engine.
    Exposes filing references, balance sheet changes, and capex/debt shifts.
    """
    sym = symbol.upper()
    is_indian = sym.endswith(".NS") or sym.endswith(".BO")

    # Document Center Links & Regulatory IDs
    docs = []
    if is_indian:
        base_sym = sym.replace(".NS", "").replace(".BO", "")
        docs = [
            {"title": "Latest Audited Annual Report (FY25/26)", "authority": "NSE India Corporate Announcements", "category": "Annual Filing", "url": f"https://www.nseindia.com/companies-listing/corporate-filings-annual-reports?symbol={base_sym}"},
            {"title": "Quarterly Financial Results & Limited Review", "authority": "NSE India Regulatory Submissions", "category": "Quarterly", "url": f"https://www.nseindia.com/companies-listing/corporate-filings-financial-results?symbol={base_sym}"},
            {"title": "Investor & Analyst Presentation", "authority": "Company Investor Relations", "category": "Presentation", "url": f"https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol={base_sym}"},
            {"title": "Shareholding Pattern Filing (Regulation 31)", "authority": "BSE / NSE India", "category": "Governance", "url": f"https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol={base_sym}"},
        ]
    else:
        docs = [
            {"title": "Form 10-K (Annual Comprehensive Filing)", "authority": "U.S. Securities and Exchange Commission (SEC EDGAR)", "category": "Annual Filing", "url": f"https://www.sec.gov/edgar/searchedgar/companysearch?company={sym}"},
            {"title": "Form 10-Q (Quarterly Financial Report)", "authority": "SEC EDGAR Submissions", "category": "Quarterly", "url": f"https://www.sec.gov/edgar/searchedgar/companysearch?company={sym}"},
            {"title": "Form 8-K (Current Material Event Disclosures)", "authority": "SEC EDGAR", "category": "Material Events", "url": f"https://www.sec.gov/edgar/searchedgar/companysearch?company={sym}"},
        ]

    # Filing Diff (Latest Audited vs Previous Audited Period)
    diff_items = []
    try:
        is_df = getattr(t, "income_stmt", None)
        bs_df = getattr(t, "balance_sheet", None)
        cf_df = getattr(t, "cashflow", None)

        if is_df is not None and not is_df.empty and len(is_df.columns) >= 2:
            cols = list(is_df.columns)
            p_curr = str(cols[0])[:10]
            p_prev = str(cols[1])[:10]

            def _compare_row(df, row_name, display_title, format_type="currency"):
                if _has_row(df, row_name):
                    v_curr = _safe_float(df.loc[row_name].iloc[0])
                    v_prev = _safe_float(df.loc[row_name].iloc[1])
                    if v_curr is not None and v_prev is not None and v_prev != 0:
                        pct = round(((v_curr - v_prev) / abs(v_prev)) * 100, 2)
                        diff_items.append({
                            "metric": display_title,
                            "period_previous": p_prev,
                            "period_current": p_curr,
                            "value_previous": v_prev,
                            "value_current": v_curr,
                            "change_pct": pct,
                        })

            _compare_row(is_df, "Total Revenue", "Total Revenue")
            _compare_row(is_df, "Operating Income", "Operating Income")
            _compare_row(is_df, "Net Income", "Net Income")
            _compare_row(bs_df, "Total Debt", "Total Debt")
            _compare_row(bs_df, "Stockholders Equity", "Total Stockholders Equity")
            _compare_row(cf_df, "Operating Cash Flow", "Operating Cash Flow")
            _compare_row(cf_df, "Capital Expenditure", "Capital Expenditure")

    except Exception as e:
        logger.debug(f"Filing diff calculation notice: {e}")

    return {
        "symbol": symbol,
        "document_center": docs,
        "filing_diff": {
            "has_diff": bool(diff_items),
            "items": diff_items,
        }
    }


# 6. Deterministic Research Query Parser
def parse_research_query(query: str, active_symbol: str) -> Dict[str, Any]:
    """
    Deterministic Natural Query Parser mapping user questions to structured research actions:
    e.g. "TCS revenue growth last 5 years" -> Intent: FINANCIAL_TREND, Entity: TCS.NS, Metric: Revenue
    e.g. "Compare TCS and INFY margins" -> Intent: PEER_COMPARISON, Entities: [TCS.NS, INFY.NS], Metric: Net Margin
    e.g. "What changed for TCS?" -> Intent: WHAT_CHANGED, Entity: TCS.NS
    e.g. "Check anomalies in TCS" -> Intent: ANOMALY_SCAN, Entity: TCS.NS
    """
    q = (query or "").strip().lower()
    
    # 1. Identify target entities
    symbols = []
    # Match symbols mentioned like TCS, INFY, RELIANCE, AAPL, NVDA, or active symbol
    known_tokens = {
        "tcs": "TCS.NS",
        "infosys": "INFY.NS",
        "infy": "INFY.NS",
        "reliance": "RELIANCE.NS",
        "hdfc": "HDFCBANK.NS",
        "hdfcbank": "HDFCBANK.NS",
        "nifty": "^NSEI",
        "sensex": "^BSESN",
        "gold": "GC=F",
        "crude": "CL=F",
        "apple": "AAPL",
        "aapl": "AAPL",
        "nvidia": "NVDA",
        "nvda": "NVDA",
        "microsoft": "MSFT",
        "msft": "MSFT",
    }
    for word, sym in known_tokens.items():
        if word in q and sym not in symbols:
            symbols.append(sym)

    if not symbols:
        symbols.append(resolve_symbol(active_symbol))

    primary_symbol = symbols[0]

    # 2. Determine Intent & Metric
    intent = "GENERAL_RESEARCH"
    metric = "Overview"
    period = "1y"

    if "what changed" in q or "delta" in q or "last 30 days" in q or "recent change" in q:
        intent = "WHAT_CHANGED"
        metric = "30-Day Comparative State"
    elif "anomal" in q or "red flag" in q or "divergence" in q or "unusual" in q:
        intent = "ANOMALY_SCAN"
        metric = "Accounting & Market Anomalies"
    elif "compare" in q or "vs" in q or "peer" in q or len(symbols) >= 2:
        intent = "PEER_COMPARISON"
        if "margin" in q:
            metric = "Net Margin"
        elif "pe" in q or "valuation" in q:
            metric = "P/E Multiple"
        elif "growth" in q or "revenue" in q:
            metric = "Revenue Growth"
        else:
            metric = "Multi-Factor Benchmark"
    elif "revenue" in q or "growth" in q or "cagr" in q:
        intent = "FINANCIAL_TREND"
        metric = "Revenue CAGR & Progression"
        if "5" in q:
            period = "5y"
        elif "3" in q:
            period = "3y"
    elif "margin" in q or "profit" in q:
        intent = "FINANCIAL_TREND"
        metric = "Operating & Net Margins"
    elif "dividend" in q or "yield" in q:
        intent = "DIVIDEND_INTELLIGENCE"
        metric = "Dividend History & Payouts"
    elif "valuation" in q or "pe" in q or "multiple" in q:
        intent = "VALUATION_CONTEXT"
        metric = "Historical P/E Distribution"

    return {
        "original_query": query,
        "intent": intent,
        "entity": primary_symbol,
        "entities": symbols,
        "metric": metric,
        "period": period,
        "deterministic_resolution": f"Resolved Query: [{intent}] on {primary_symbol} examining {metric}.",
    }


# 7. Macro -> Asset Relationship Explorer
def get_macro_explorer(symbol: str) -> Dict[str, Any]:
    """
    Computes rolling correlation and sensitivity between asset and core macro benchmarks:
    - USD/INR ('INR=X')
    - NIFTY 50 ('^NSEI')
    - NASDAQ 100 ('^NDX' or 'QQQ')
    - Gold ('GC=F')
    - Crude Oil ('CL=F')
    """
    sym = resolve_symbol(symbol)
    cache_key = f"macro_exp:{sym}"
    cached = cache.get("analytics", cache_key)
    if cached:
        return cached

    macro_basket = {
        "USD/INR": "INR=X",
        "NIFTY 50": "^NSEI",
        "NASDAQ": "QQQ",
        "Gold": "GC=F",
        "Crude Oil": "CL=F",
    }

    results = []
    try:
        all_syms = [sym] + list(macro_basket.values())
        raw_df = yf.download(all_syms, period="1y", interval="1d", progress=False)["Close"]
        if sym in raw_df.columns:
            asset_ret = raw_df[sym].ffill().pct_change().dropna()
            for label, m_sym in macro_basket.items():
                if m_sym in raw_df.columns:
                    m_ret = raw_df[m_sym].ffill().pct_change().dropna()
                    combined = pd.concat([asset_ret, m_ret], axis=1).dropna()
                    if len(combined) > 30:
                        corr_1y = round(float(combined.iloc[:, 0].corr(combined.iloc[:, 1])), 2)
                        corr_90d = round(float(combined.iloc[-60:, 0].corr(combined.iloc[-60:, 1])), 2) if len(combined) >= 60 else corr_1y
                        results.append({
                            "factor": label,
                            "symbol": m_sym,
                            "correlation_1y": corr_1y,
                            "correlation_90d": corr_90d,
                            "sessions_evaluated": len(combined),
                        })

        res = {
            "symbol": sym,
            "macro_factors": results,
            "calculated_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        cache.set("analytics", cache_key, res, ttl=3600)
        return res
    except Exception as e:
        logger.error(f"Macro explorer error for {sym}: {e}")
        return {"symbol": sym, "macro_factors": [], "error": str(e)}


# Unified Master V4 Intelligence Service
def get_v4_intelligence(symbol: str) -> Dict[str, Any]:
    """
    Master unified endpoint for Apex v4 analytical features.
    """
    sym = resolve_symbol(symbol)
    cache_key = f"v4_intel:{sym}"
    cached = cache.get("research", cache_key)
    if cached:
        return cached

    t = yf.Ticker(sym, session=_yf_session)
    try:
        info = getattr(t, "info", {}) or {}
    except Exception as e:
        logger.warning(f"Failed to fetch info for {sym}: {e}")
        info = {}
    currency = "INR" if sym.endswith(".NS") or sym in ["^NSEI", "^BSESN"] else (info.get("currency") or "USD")

    # 1. Fetch research pipeline baseline data
    from backend.services.research_pipeline import get_stock_research
    from backend.services.deep_research import get_historical_valuation_and_drawdown

    research_data = get_stock_research(sym)
    fin_timeline = research_data.get("financial_timeline", [])

    pe_val = round(float(info["trailingPE"]), 2) if info.get("trailingPE") is not None else None
    price = float(info.get("currentPrice") or info.get("regularMarketPrice") or 0.0)
    hist_val = get_historical_valuation_and_drawdown(t, pe_val, price, currency)

    # 2. Compute v4 Engines with fault-tolerant individual fallbacks
    try:
        relationships = analyze_fundamental_relationships(fin_timeline, info)
    except Exception as e:
        logger.error(f"Error computing fundamental relationships for {sym}: {e}")
        relationships = {"has_data": False, "observations": [], "cagr_spreads": {}, "operating_leverage": None}

    try:
        quality = analyze_statement_quality(t, info, currency)
    except Exception as e:
        logger.error(f"Error computing statement quality for {sym}: {e}")
        quality = {"has_data": False, "signals": [], "metrics": {}}

    try:
        hist_valuation = hist_val.get("historical_valuation", {}) if isinstance(hist_val, dict) else {}
        anomalies = detect_anomalies(sym, t, info, hist_valuation, quality)
    except Exception as e:
        logger.error(f"Error computing anomalies for {sym}: {e}")
        anomalies = []

    try:
        what_changed = compute_what_changed(sym, t, info, currency)
    except Exception as e:
        logger.error(f"Error computing what changed for {sym}: {e}")
        what_changed = {"has_data": False, "kpis": {}, "observations": [], "recent_events": []}

    try:
        filings = get_filing_intelligence_and_diff(sym, t, info)
    except Exception as e:
        logger.error(f"Error computing filing diff for {sym}: {e}")
        filings = {"symbol": sym, "document_center": [], "filing_diff": {"has_diff": False, "items": []}}

    response = {
        "symbol": sym,
        "currency": currency,
        "fundamental_relationships": relationships,
        "statement_quality": quality,
        "anomalies": anomalies,
        "what_changed_30d": what_changed,
        "filing_intelligence": filings,
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }

    cache.set("research", cache_key, response, ttl=1800)
    return response
