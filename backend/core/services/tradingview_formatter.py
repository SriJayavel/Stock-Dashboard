"""
TradingView Lightweight Charts Formatter
Converts raw OHLCV DataFrames into TradingView-compatible JSON payloads.
Pure formatting logic - no I/O, no external dependencies.
"""

import datetime
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional


def format_currency(currency: str) -> str:
    """Get currency symbol for display."""
    symbols = {
        "INR": "₹",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
        "CAD": "CA$",
        "AUD": "A$",
        "CHF": "CHF",
    }
    return symbols.get(currency.upper(), f"{currency} ")


def format_market_cap(mcap: Optional[float], currency: str) -> str:
    """Format market cap for display with appropriate units."""
    if not mcap or mcap <= 0:
        return "—"
    curr_sym = format_currency(currency)
    if currency == "INR":
        cr_val = mcap / 1e7
        return f"₹{cr_val:,.1f} Cr"
    if mcap >= 1e12:
        return f"{curr_sym}{mcap/1e12:.2f}T"
    if mcap >= 1e9:
        return f"{curr_sym}{mcap/1e9:.2f}B"
    return f"{curr_sym}{mcap/1e6:.1f}M"


def _get_fast_info_val(fast: Any, *keys: str) -> Optional[float]:
    """Safely extract numeric metrics from yfinance fast_info."""
    if not fast:
        return None
    for k in keys:
        try:
            val = getattr(fast, k, None)
            if val is not None:
                return float(val)
        except Exception:
            pass
        if hasattr(fast, "get"):
            try:
                val = fast.get(k)
                if val is not None:
                    return float(val)
            except Exception:
                pass
    return None


def format_price(value: float, symbol: str) -> float:
    """Format price with appropriate decimal places based on asset type."""
    decimals = 4 if ("=X" in symbol or "-USD" in symbol) else 2
    return round(value, decimals)


def format_change(value: float, symbol: str) -> float:
    """Format price change with appropriate decimal places."""
    decimals = 4 if ("=X" in symbol or "-USD" in symbol) else 2
    return round(value, decimals)


def format_volume(volume: float) -> int:
    """Format volume as integer."""
    return int(volume) if volume else 0


def build_candle_data(
    df: pd.DataFrame,
    symbol: str,
    is_intraday: bool = False,
) -> List[Dict[str, Any]]:
    """
    Build TradingView Lightweight Charts candle data from DataFrame.
    Returns list of {time, open, high, low, close, volume, time_str}.
    """
    candles = []
    for _, row in df.iterrows():
        raw_dt = row["Date"]
        if is_intraday:
            time_val = int(raw_dt.timestamp())
            time_str = raw_dt.strftime("%Y-%m-%d %H:%M:%S")
        else:
            time_val = raw_dt.strftime("%Y-%m-%d")
            time_str = time_val

        c_open = format_price(float(row["Open"]), symbol)
        c_high = format_price(float(row["High"]), symbol)
        c_low = format_price(float(row["Low"]), symbol)
        c_close = format_price(float(row["Close"]), symbol)
        c_vol = format_volume(row.get("Volume", 0))

        candles.append({
            "time": time_val,
            "time_str": time_str,
            "open": c_open,
            "high": c_high,
            "low": c_low,
            "close": c_close,
            "volume": c_vol,
        })
    return candles


def build_volume_series(candles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build volume series with up/down coloring."""
    volume_series = []
    for candle in candles:
        is_up = candle["close"] >= candle["open"]
        volume_series.append({
            "time": candle["time"],
            "value": candle["volume"],
            "color": "rgba(16, 185, 129, 0.45)" if is_up else "rgba(239, 68, 68, 0.45)",
        })
    return volume_series


def build_indicator_series(
    df: pd.DataFrame,
    candles: List[Dict[str, Any]],
    is_intraday: bool,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Build all indicator series from DataFrame aligned with candles.
    Returns dict with sma_20, sma_50, sma_200, ema_50, ema_200, bb_upper, bb_middle, bb_lower, rsi, macd.
    """
    # Create a map from candle time to index for alignment
    time_to_idx = {c["time"]: i for i, c in enumerate(candles)}

    sma_20 = []
    sma_50 = []
    sma_200 = []
    ema_50 = []
    ema_200 = []
    bb_upper = []
    bb_middle = []
    bb_lower = []
    rsi_series = []
    macd_series = []

    for _, row in df.iterrows():
        raw_dt = row["Date"]
        if is_intraday:
            time_val = int(raw_dt.timestamp())
        else:
            time_val = raw_dt.strftime("%Y-%m-%d")

        # Only include if we have a matching candle (display window)
        if time_val not in time_to_idx:
            continue

        # SMAs
        if not np.isnan(row.get("SMA_20", np.nan)):
            sma_20.append({"time": time_val, "value": round(float(row["SMA_20"]), 2)})
        if not np.isnan(row.get("SMA_50", np.nan)):
            sma_50.append({"time": time_val, "value": round(float(row["SMA_50"]), 2)})
        if not np.isnan(row.get("SMA_200", np.nan)):
            sma_200.append({"time": time_val, "value": round(float(row["SMA_200"]), 2)})

        # EMAs
        if not np.isnan(row.get("EMA_50", np.nan)):
            ema_50.append({"time": time_val, "value": round(float(row["EMA_50"]), 2)})
        if not np.isnan(row.get("EMA_200", np.nan)):
            ema_200.append({"time": time_val, "value": round(float(row["EMA_200"]), 2)})

        # Bollinger Bands
        if not np.isnan(row.get("BB_Upper", np.nan)):
            bb_upper.append({"time": time_val, "value": round(float(row["BB_Upper"]), 2)})
            bb_middle.append({"time": time_val, "value": round(float(row["BB_Middle"]), 2)})
            bb_lower.append({"time": time_val, "value": round(float(row["BB_Lower"]), 2)})

        # RSI
        if not np.isnan(row.get("RSI", np.nan)):
            rsi_series.append({"time": time_val, "value": round(float(row["RSI"]), 2)})

        # MACD
        if not np.isnan(row.get("MACD", np.nan)) and not np.isnan(row.get("MACD_Signal", np.nan)):
            macd_series.append({
                "time": time_val,
                "macd": round(float(row["MACD"]), 2),
                "signal": round(float(row["MACD_Signal"]), 2),
                "hist": round(float(row["MACD_Hist"]), 2),
            })

    return {
        "sma_20": sma_20,
        "sma_50": sma_50,
        "sma_200": sma_200,
        "ema_50": ema_50,
        "ema_200": ema_200,
        "bb_upper": bb_upper,
        "bb_middle": bb_middle,
        "bb_lower": bb_lower,
        "rsi": rsi_series,
        "macd": macd_series,
    }


def build_latest_quote(candles: List[Dict[str, Any]], symbol: str) -> Optional[Dict[str, Any]]:
    """Build latest quote from last candle."""
    if not candles:
        return None

    latest_c = candles[-1]
    prev_close = candles[-2]["close"] if len(candles) > 1 else latest_c["open"]
    chg = format_change(latest_c["close"] - prev_close, symbol)
    chg_pct = round((chg / prev_close) * 100, 2) if prev_close else 0.0

    return {
        "current_price": latest_c["close"],
        "change": chg,
        "change_pct": chg_pct,
        "high": latest_c["high"],
        "low": latest_c["low"],
        "open": latest_c["open"],
        "volume": latest_c["volume"],
        "time": latest_c["time"],
        "time_str": latest_c.get("time_str"),
    }


def build_technical_snapshot(
    df: pd.DataFrame,
    interval: str,
    symbol: str,
) -> Dict[str, Any]:
    """
    Build technical snapshot with trend context and returns.
    """
    latest = df.iloc[-1]
    close = float(latest["Close"]) if pd.notna(latest.get("Close")) else None

    def _snapshot_return(lookback: int) -> Optional[float]:
        if close is None or len(df) <= lookback:
            return None
        prior = float(df.iloc[-(lookback + 1)]["Close"])
        return round((close / prior - 1) * 100, 2) if prior > 0 else None

    sma_50_val = float(latest["SMA_50"]) if pd.notna(latest.get("SMA_50")) else None
    sma_200_val = float(latest["SMA_200"]) if pd.notna(latest.get("SMA_200")) else None

    if close is None or sma_50_val is None:
        trend_context = "Insufficient history"
        trend_basis = "Not enough observations for the 50 day average"
    elif sma_200_val is not None and close > sma_50_val and sma_50_val > sma_200_val:
        trend_context = "Above key averages"
        trend_basis = "Close > SMA 50 > SMA 200"
    elif sma_200_val is not None and close < sma_50_val and sma_50_val < sma_200_val:
        trend_context = "Below key averages"
        trend_basis = "Close < SMA 50 < SMA 200"
    else:
        trend_context = "Mixed structure"
        trend_basis = "Close and available 50/200 day averages are not fully aligned"

    return_windows = {"1d": (21, 63, 252), "1wk": (4, 13, 52), "1mo": (1, 3, 12)}
    one_month_bars, three_month_bars, one_year_bars = return_windows.get(interval, return_windows.get("1d", (21, 63, 252)))

    trailing = df.tail(one_year_bars)["Close"].astype(float)
    drawdown = ((trailing / trailing.cummax()) - 1).min() * 100 if not trailing.empty else None

    return {
        "trend_context": trend_context,
        "trend_basis": trend_basis,
        "return_1m_pct": _snapshot_return(one_month_bars),
        "return_3m_pct": _snapshot_return(three_month_bars),
        "rsi_14": round(float(latest["RSI"]), 2) if pd.notna(latest.get("RSI")) else None,
        "max_drawdown_1y_pct": round(float(drawdown), 2) if drawdown is not None else None,
        "methodology": f"Calculations use available {interval} observations. Trend context compares the latest close with moving averages. Historical context only; not a forecast.",
    }


def build_lightweight_charts_payload(
    df: pd.DataFrame,
    symbol: str,
    timeframe: str,
    interval: str,
    exchange: str,
    exchange_timezone: str,
    currency: str,
    market_status: str,
    freshness: str,
    observations: List[Dict[str, Any]],
    data_source: str = "Yahoo Finance",
    range_note: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build complete TradingView Lightweight Charts payload.
    """
    is_intraday = interval in ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]

    candles = build_candle_data(df, symbol, is_intraday)
    volume = build_volume_series(candles)
    indicators = build_indicator_series(df, candles, is_intraday)
    latest_quote = build_latest_quote(candles, symbol)
    technical_snapshot = build_technical_snapshot(df, interval, symbol)

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "interval": interval,
        "candles": candles,
        "volume": volume,
        "indicators": indicators,
        "observations": observations,
        "technical_snapshot": technical_snapshot,
        "exchange": exchange,
        "exchange_timezone": exchange_timezone,
        "currency": currency,
        "session": market_status,
        "market_status": market_status,
        "freshness": freshness,
        "source": data_source,
        "data_source": data_source,
        "last_updated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "range_note": range_note,
        "latest_quote": latest_quote,
    }


def get_range_note(interval: str) -> Optional[str]:
    """Get range note for specific intervals."""
    if interval == "1m":
        return "1m history limited to 7-day provider retention window"
    return None


def calculate_dynamic_ttl(
    is_intraday: bool,
    session: str,
    default_history_ttl: int,
) -> int:
    """
    Calculate dynamic cache TTL based on market state.
    - 15s when market is open for intraday
    - 300s when market is closed for intraday
    - default_history_ttl for daily
    """
    if is_intraday:
        return 15 if session in ["OPEN", "PRE_MARKET"] else 300
    return default_history_ttl