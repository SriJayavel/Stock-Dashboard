"""
High-performance Plotly interactive financial charts.
Configured with a sleek dark terminal theme, multi-pane subplots (Price, Volume, RSI, MACD),
and smooth crosshairs.
"""

import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np


def create_terminal_chart(
    df: pd.DataFrame,
    symbol: str,
    company_name: str,
    chart_type: str = "Candlestick",
    show_ema: bool = True,
    show_bb: bool = False,
    show_volume: bool = True,
    show_rsi: bool = False,
    show_macd: bool = False,
) -> go.Figure:
    """
    Build a multi-panel financial chart with Plotly.
    Panels dynamically configure based on enabled indicators.
    """
    if df.empty or "Close" not in df.columns:
        fig = go.Figure()
        fig.add_annotation(
            text="No historical price data available.",
            showarrow=False,
            font=dict(size=16, color="#94a3b8"),
        )
        fig.update_layout(template="plotly_dark", height=400)
        return fig

    # Determine rows and row heights
    rows = 1
    row_heights = [0.65]

    has_volume = show_volume and "Volume" in df.columns and df["Volume"].sum() > 0
    has_rsi = show_rsi and "RSI" in df.columns
    has_macd = show_macd and "MACD" in df.columns

    if has_volume:
        rows += 1
        row_heights.append(0.15)
    if has_rsi:
        rows += 1
        row_heights.append(0.20)
    if has_macd:
        rows += 1
        row_heights.append(0.20)

    # Normalize row heights
    total_h = sum(row_heights)
    row_heights = [h / total_h for h in row_heights]

    fig = make_subplots(
        rows=rows,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.03,
        row_heights=row_heights,
    )

    current_row = 1

    # 1. Main Price Panel
    if chart_type == "Candlestick" and "Open" in df.columns:
        fig.add_trace(
            go.Candlestick(
                x=df["Date"],
                open=df["Open"],
                high=df["High"],
                low=df["Low"],
                close=df["Close"],
                name="Price",
                increasing_line_color="#10b981",  # Vibrant Emerald
                decreasing_line_color="#ef4444",  # Vibrant Red
                increasing_fillcolor="#10b981",
                decreasing_fillcolor="#ef4444",
            ),
            row=current_row,
            col=1,
        )
    else:
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["Close"],
                mode="lines",
                name="Close Price",
                line=dict(color="#00e5ff", width=2),  # Vibrant Cyan
                fill="tozeroy",
                fillcolor="rgba(0, 229, 255, 0.05)",
            ),
            row=current_row,
            col=1,
        )

    # Bollinger Bands Overlays
    if show_bb and "BB_Upper" in df.columns:
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["BB_Upper"],
                mode="lines",
                line=dict(color="rgba(148, 163, 184, 0.4)", width=1),
                name="Upper BB (20,2)",
            ),
            row=current_row,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["BB_Lower"],
                mode="lines",
                line=dict(color="rgba(148, 163, 184, 0.4)", width=1),
                fill="tonexty",
                fillcolor="rgba(148, 163, 184, 0.08)",
                name="Lower BB (20,2)",
            ),
            row=current_row,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["BB_Middle"],
                mode="lines",
                line=dict(color="#fbbf24", width=1, dash="dot"),
                name="BB Middle (SMA 20)",
            ),
            row=current_row,
            col=1,
        )

    # EMA Overlays
    if show_ema:
        if "EMA_20" in df.columns:
            fig.add_trace(
                go.Scatter(
                    x=df["Date"],
                    y=df["EMA_20"],
                    mode="lines",
                    line=dict(color="#38bdf8", width=1.3),
                    name="EMA 20",
                ),
                row=current_row,
                col=1,
            )
        if "EMA_50" in df.columns:
            fig.add_trace(
                go.Scatter(
                    x=df["Date"],
                    y=df["EMA_50"],
                    mode="lines",
                    line=dict(color="#f59e0b", width=1.4),
                    name="EMA 50",
                ),
                row=current_row,
                col=1,
            )
        if "EMA_200" in df.columns:
            fig.add_trace(
                go.Scatter(
                    x=df["Date"],
                    y=df["EMA_200"],
                    mode="lines",
                    line=dict(color="#ec4899", width=1.6),
                    name="EMA 200",
                ),
                row=current_row,
                col=1,
            )

    # 2. Volume Panel
    if has_volume:
        current_row += 1
        vol_colors = [
            "#10b981" if c >= o else "#ef4444"
            for c, o in zip(df["Close"], df["Open"] if "Open" in df.columns else df["Close"])
        ]
        fig.add_trace(
            go.Bar(
                x=df["Date"],
                y=df["Volume"],
                name="Volume",
                marker_color=vol_colors,
                opacity=0.7,
            ),
            row=current_row,
            col=1,
        )

    # 3. RSI Panel
    if has_rsi:
        current_row += 1
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["RSI"],
                mode="lines",
                name="RSI (14)",
                line=dict(color="#a855f7", width=1.8),
            ),
            row=current_row,
            col=1,
        )
        # Overbought / Oversold threshold lines
        fig.add_hline(y=70, line=dict(color="#ef4444", width=1, dash="dash"), row=current_row, col=1)
        fig.add_hline(y=30, line=dict(color="#10b981", width=1, dash="dash"), row=current_row, col=1)
        fig.add_hrect(
            y0=30, y1=70, fillcolor="rgba(168, 85, 247, 0.05)", line_width=0, row=current_row, col=1
        )

    # 4. MACD Panel
    if has_macd:
        current_row += 1
        hist_colors = ["#10b981" if val >= 0 else "#ef4444" for val in df["MACD_Hist"]]
        fig.add_trace(
            go.Bar(
                x=df["Date"],
                y=df["MACD_Hist"],
                name="MACD Hist",
                marker_color=hist_colors,
                opacity=0.6,
            ),
            row=current_row,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["MACD"],
                mode="lines",
                name="MACD",
                line=dict(color="#00e5ff", width=1.5),
            ),
            row=current_row,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["MACD_Signal"],
                mode="lines",
                name="Signal",
                line=dict(color="#fb923c", width=1.3),
            ),
            row=current_row,
            col=1,
        )
        fig.add_hline(y=0, line=dict(color="#475569", width=1), row=current_row, col=1)

    # Layout styling
    chart_height = 520 + (120 if has_rsi else 0) + (120 if has_macd else 0)

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#0b0e14",
        plot_bgcolor="#0b0e14",
        height=chart_height,
        margin=dict(l=40, r=40, t=30, b=20),
        xaxis_rangeslider_visible=False,
        hovermode="x unified",
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            font=dict(size=11, color="#94a3b8"),
        ),
    )

    fig.update_xaxes(
        showgrid=True,
        gridwidth=1,
        gridcolor="#1e293b",
        spikemode="across",
        spikesnap="cursor",
        spikethickness=1,
        spikecolor="#64748b",
    )
    fig.update_yaxes(
        showgrid=True,
        gridwidth=1,
        gridcolor="#1e293b",
        spikemode="across",
        spikesnap="cursor",
        spikethickness=1,
        spikecolor="#64748b",
    )

    return fig


def create_financials_trend_chart(income_df: pd.DataFrame) -> go.Figure:
    """
    Create a 4-year trend chart of Total Revenue and Net Income.
    """
    if income_df is None or income_df.empty:
        fig = go.Figure()
        fig.add_annotation(text="Financial statements not available for trend visualization.", showarrow=False)
        fig.update_layout(template="plotly_dark", height=300)
        return fig

    try:
        # yfinance columns are dates (e.g., 2024-03-31)
        years = [str(col)[:10] for col in income_df.columns[::-1]]

        rev_row = None
        for key in ["Total Revenue", "Operating Revenue", "Revenue"]:
            if key in income_df.index:
                rev_row = income_df.loc[key].values[::-1]
                break

        net_row = None
        for key in ["Net Income", "Net Income Common Stockholders", "Net Income Continuous Operations"]:
            if key in income_df.index:
                net_row = income_df.loc[key].values[::-1]
                break

        fig = go.Figure()
        if rev_row is not None:
            # Convert to Crores
            rev_cr = [v / 1e7 if v and not np.isnan(v) else 0 for v in rev_row]
            fig.add_trace(
                go.Bar(
                    x=years,
                    y=rev_cr,
                    name="Revenue (₹ Cr)",
                    marker_color="#00e5ff",
                )
            )

        if net_row is not None:
            net_cr = [v / 1e7 if v and not np.isnan(v) else 0 for v in net_row]
            fig.add_trace(
                go.Bar(
                    x=years,
                    y=net_cr,
                    name="Net Income (₹ Cr)",
                    marker_color="#10b981",
                )
            )

        fig.update_layout(
            template="plotly_dark",
            barmode="group",
            paper_bgcolor="#111620",
            plot_bgcolor="#111620",
            height=320,
            margin=dict(l=40, r=40, t=30, b=30),
            legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
            xaxis=dict(gridcolor="#1e293b"),
            yaxis=dict(gridcolor="#1e293b"),
        )
        return fig
    except Exception:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", height=300)
        return fig
