"""
Mathematical calculations for technical indicators.
Pure functions that operate on pandas DataFrames without side-effects.
"""

import pandas as pd
import numpy as np


def calculate_sma(df: pd.DataFrame, periods=(20, 50, 200)) -> pd.DataFrame:
    """Calculate Simple Moving Averages."""
    df = df.copy()
    for period in periods:
        if len(df) >= period:
            df[f"SMA_{period}"] = df["Close"].rolling(window=period).mean()
        else:
            df[f"SMA_{period}"] = np.nan
    return df


def calculate_ema(df: pd.DataFrame, periods=(12, 20, 26, 50, 200)) -> pd.DataFrame:
    """Calculate Exponential Moving Averages."""
    df = df.copy()
    for period in periods:
        if len(df) >= period:
            df[f"EMA_{period}"] = df["Close"].ewm(span=period, adjust=False).mean()
        else:
            df[f"EMA_{period}"] = np.nan
    return df


def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Calculate Relative Strength Index (RSI)."""
    df = df.copy()
    if len(df) < period + 1:
        df["RSI"] = np.nan
        return df

    delta = df["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -1 * delta.clip(upper=0)

    # Wilder's Smoothing
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    df["RSI"] = 100 - (100 / (1 + rs))
    df["RSI"] = df["RSI"].fillna(50.0)
    return df


def calculate_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """Calculate Moving Average Convergence Divergence (MACD)."""
    df = df.copy()
    if len(df) < slow + signal:
        df["MACD"] = np.nan
        df["MACD_Signal"] = np.nan
        df["MACD_Hist"] = np.nan
        return df

    ema_fast = df["Close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["Close"].ewm(span=slow, adjust=False).mean()

    df["MACD"] = ema_fast - ema_slow
    df["MACD_Signal"] = df["MACD"].ewm(span=signal, adjust=False).mean()
    df["MACD_Hist"] = df["MACD"] - df["MACD_Signal"]
    return df


def calculate_bollinger_bands(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    """Calculate Bollinger Bands (Upper, Middle, Lower)."""
    df = df.copy()
    if len(df) < period:
        df["BB_Middle"] = np.nan
        df["BB_Upper"] = np.nan
        df["BB_Lower"] = np.nan
        return df

    df["BB_Middle"] = df["Close"].rolling(window=period).mean()
    rolling_std = df["Close"].rolling(window=period).std()
    df["BB_Upper"] = df["BB_Middle"] + (rolling_std * std_dev)
    df["BB_Lower"] = df["BB_Middle"] - (rolling_std * std_dev)
    return df


def apply_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Apply standard suite of technical indicators."""
    df = calculate_sma(df, (20, 50, 200))
    df = calculate_ema(df, (12, 20, 26, 50, 200))
    df = calculate_rsi(df, 14)
    df = calculate_macd(df, 12, 26, 9)
    df = calculate_bollinger_bands(df, 20, 2.0)
    return df


def generate_technical_observations(df: pd.DataFrame) -> list[dict]:
    """
    Generate neutral, objective technical observations based on calculated indicators.
    Follows strict 'Analysis Only' rule: no buy/sell advice.
    """
    if df.empty or len(df) < 20:
        return []

    observations = []
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    current_price = latest["Close"]

    # 1. RSI Observation
    if not np.isnan(latest.get("RSI", np.nan)):
        rsi_val = latest["RSI"]
        if rsi_val >= 70:
            observations.append({
                "type": "Momentum",
                "indicator": "RSI (14)",
                "value": f"{rsi_val:.1f}",
                "status": "Overbought Zone",
                "detail": "RSI is above 70, indicating extended upward momentum.",
                "color": "#ef4444"
            })
        elif rsi_val <= 30:
            observations.append({
                "type": "Momentum",
                "indicator": "RSI (14)",
                "value": f"{rsi_val:.1f}",
                "status": "Oversold Zone",
                "detail": "RSI is below 30, indicating extended downward momentum.",
                "color": "#10b981"
            })
        else:
            observations.append({
                "type": "Momentum",
                "indicator": "RSI (14)",
                "value": f"{rsi_val:.1f}",
                "status": "Neutral Range",
                "detail": "RSI is within the standard 30–70 consolidation range.",
                "color": "#64748b"
            })

    # 2. MACD Observation
    if not np.isnan(latest.get("MACD", np.nan)) and not np.isnan(latest.get("MACD_Signal", np.nan)):
        macd_val = latest["MACD"]
        sig_val = latest["MACD_Signal"]
        prev_macd = prev.get("MACD", macd_val)
        prev_sig = prev.get("MACD_Signal", sig_val)

        if macd_val > sig_val and prev_macd <= prev_sig:
            observations.append({
                "type": "Trend Signal",
                "indicator": "MACD",
                "value": f"{macd_val:.2f}",
                "status": "Bullish Crossover",
                "detail": "MACD line crossed above the signal line recently.",
                "color": "#10b981"
            })
        elif macd_val < sig_val and prev_macd >= prev_sig:
            observations.append({
                "type": "Trend Signal",
                "indicator": "MACD",
                "value": f"{macd_val:.2f}",
                "status": "Bearish Crossover",
                "detail": "MACD line crossed below the signal line recently.",
                "color": "#ef4444"
            })
        else:
            status_text = "Above Signal (Positive Momentum)" if macd_val > sig_val else "Below Signal (Negative Momentum)"
            observations.append({
                "type": "Trend",
                "indicator": "MACD",
                "value": f"{macd_val:.2f}",
                "status": status_text,
                "detail": f"MACD is currently {'above' if macd_val > sig_val else 'below'} the 9-day signal line.",
                "color": "#10b981" if macd_val > sig_val else "#f59e0b"
            })

    # 3. Moving Average Trend (50 vs 200 EMA)
    if "EMA_50" in df.columns and "EMA_200" in df.columns and not np.isnan(latest["EMA_200"]):
        ema50 = latest["EMA_50"]
        ema200 = latest["EMA_200"]
        if ema50 > ema200:
            observations.append({
                "type": "Major Trend",
                "indicator": "50 / 200 EMA",
                "value": f"EMA50: {ema50:.1f} | EMA200: {ema200:.1f}",
                "status": "Golden Cross Alignment",
                "detail": "Medium-term 50 EMA is trading above long-term 200 EMA.",
                "color": "#10b981"
            })
        else:
            observations.append({
                "type": "Major Trend",
                "indicator": "50 / 200 EMA",
                "value": f"EMA50: {ema50:.1f} | EMA200: {ema200:.1f}",
                "status": "Death Cross Alignment",
                "detail": "Medium-term 50 EMA is trading below long-term 200 EMA.",
                "color": "#ef4444"
            })

    # 4. Bollinger Bands Observation
    if "BB_Upper" in df.columns and not np.isnan(latest["BB_Upper"]):
        bb_up = latest["BB_Upper"]
        bb_low = latest["BB_Lower"]
        if current_price >= bb_up:
            observations.append({
                "type": "Volatility",
                "indicator": "Bollinger Bands",
                "value": f"Upper: {bb_up:.1f}",
                "status": "Testing Upper Band",
                "detail": "Price is testing or exceeding the 2-std upper band.",
                "color": "#f59e0b"
            })
        elif current_price <= bb_low:
            observations.append({
                "type": "Volatility",
                "indicator": "Bollinger Bands",
                "value": f"Lower: {bb_low:.1f}",
                "status": "Testing Lower Band",
                "detail": "Price is testing or below the 2-std lower band.",
                "color": "#f59e0b"
            })
        else:
            observations.append({
                "type": "Volatility",
                "indicator": "Bollinger Bands",
                "value": f"Range: {bb_low:.1f} - {bb_up:.1f}",
                "status": "Within Normal Bands",
                "detail": "Price is consolidating within standard volatility envelopes.",
                "color": "#64748b"
            })

    return observations
