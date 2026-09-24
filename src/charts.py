"""
TradingView-Caliber Interactive Charting Suite.
Provides:
1. Native TradingView Advanced Real-Time Chart embed (interactive drawing tools, indicators, live scale).
2. Pro-grade dark Plotly Chart styled to match TradingView pixel-for-pixel (right-hand price scale, TV colors).
"""

import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np


def get_tradingview_symbol(symbol: str) -> str:
    """Map global ticker to TradingView symbol syntax."""
    s = str(symbol).strip().upper()
    if s.endswith(".NS"):
        clean = s.replace(".NS", "")
        return f"BSE:{clean}"
    if s.endswith(".BO"):
        clean = s.replace(".BO", "")
        return f"BSE:{clean}"
    if s in {"^NSEI", "NIFTY"}:
        return "BSE:SENSEX"
    if s in {"^BSESN", "SENSEX"}:
        return "BSE:SENSEX"
    if s in {"^GSPC", "SP500"}:
        return "FOREXCOM:SPXUSD"
    if s in {"^IXIC", "NASDAQ"}:
        return "NASDAQ:NDX"
    if s in {"^FTSE", "FTSE"}:
        return "TVC:UKX"
    if s in {"^N225", "N225", "NIKKEI"}:
        return "TVC:NI225"
    if s in {"^GDAXI", "DAX"}:
        return "XETR:DAX"
    if s in {"^HSI", "HSI"}:
        return "HSI:HSI"
    if s in {"^FCHI", "CAC40"}:
        return "TVC:PX1"
    if s == "EURUSD=X":
        return "FX:EURUSD"
    if s == "GBPUSD=X":
        return "FX:GBPUSD"
    if s == "USDJPY=X":
        return "FX:USDJPY"
    if s == "USDINR=X":
        return "FX_IDC:USDINR"
    if s == "BTC-USD":
        return "BINANCE:BTCUSDT"
    if s == "ETH-USD":
        return "BINANCE:ETHUSDT"
    if s == "SOL-USD":
        return "BINANCE:SOLUSDT"
    if s == "GC=F":
        return "TVC:GOLD"
    if s == "SI=F":
        return "TVC:SILVER"
    if s == "CL=F":
        return "TVC:USOIL"
    if s == "NG=F":
        return "TVC:NATGAS"
    if s == "HG=F":
        return "TVC:COPPER"
    if s in {"AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "INTC", "QCOM", "AVGO", "ARM", "NFLX", "ASML", "QQQ"}:
        return f"NASDAQ:{s}"
    if s in {"TSM", "BABA", "TM", "SAP", "SONY", "NVO", "SHEL", "AZN", "BRK-B", "JPM", "V", "WMT", "PLTR", "SPY"}:
        return f"NYSE:{s}"
    return s


def get_tradingview_widget_html(symbol: str, theme: str = "dark") -> str:
    """
    Generate official TradingView Advanced Real-Time Chart HTML embed.
    Includes full TradingView tools, multi-timeframes, technical indicators, and dark/light theme.
    """
    tv_symbol = get_tradingview_symbol(symbol)
    tv_theme = "light" if theme == "light" else "dark"
    bg_color = "#ffffff" if tv_theme == "light" else "#131722"
    container_id = f"tv_{symbol.replace('.', '_').replace('^', '').replace('-', '_')}_{abs(hash(symbol)) % 10000}"
    html_code = f"""
    <!DOCTYPE html>
    <html style="height:100%; margin:0; padding:0; background:{bg_color};">
    <head>
      <meta charset="utf-8">
      <style>
        * {{ margin:0; padding:0; box-sizing:border-box; }}
        body {{ height:100%; background:{bg_color}; overflow:hidden; }}
        .tradingview-widget-container {{ height:100%; width:100%; }}
      </style>
    </head>
    <body>
      <div class="tradingview-widget-container">
        <div id="{container_id}" style="height:100%; width:100%;"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
        <script type="text/javascript">
        new TradingView.widget({{
          "autosize": true,
          "symbol": "{tv_symbol}",
          "interval": "D",
          "timezone": "exchange",
          "theme": "{tv_theme}",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#131722",
          "enable_publishing": false,
          "hide_top_toolbar": false,
          "hide_legend": false,
          "save_image": true,
          "hide_side_toolbar": false,
          "allow_symbol_change": true,
          "container_id": "{container_id}",
          "studies": [
            "MASimple@tv-basicstudies",
            "RSI@tv-basicstudies"
          ]
        }});
        </script>
      </div>
    </body>
    </html>
    """
    return html_code


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
    theme: str = "dark",
) -> go.Figure:
    """
    Build a TradingView-styled Plotly chart with right-hand price scale,
    TradingView exact dark/light palette, and crisp candle geometry.
    """
    if df.empty or "Close" not in df.columns:
        fig = go.Figure()
        fig.add_annotation(
            text="No historical price data available.",
            showarrow=False,
            font=dict(size=14, color="#64748b"),
        )
        fig.update_layout(template="plotly_dark", height=420, paper_bgcolor="#131722", plot_bgcolor="#131722")
        return fig

    # Filter to requested window if padding cutoff exists
    if "_cutoff" in df.columns and not df["_cutoff"].isna().all():
        cutoff_val = df["_cutoff"].iloc[0]
        visible_df = df[df["Date"] >= cutoff_val].copy()
        if len(visible_df) >= 5:
            df = visible_df

    # Configure subplots
    rows = 1
    row_heights = [0.68]

    has_volume = show_volume and "Volume" in df.columns and df["Volume"].sum() > 0
    has_rsi = show_rsi and "RSI" in df.columns
    has_macd = show_macd and "MACD" in df.columns

    if has_volume:
        rows += 1
        row_heights.append(0.14)
    if has_rsi:
        rows += 1
        row_heights.append(0.18)
    if has_macd:
        rows += 1
        row_heights.append(0.18)

    total_h = sum(row_heights)
    row_heights = [h / total_h for h in row_heights]

    fig = make_subplots(
        rows=rows,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.02,
        row_heights=row_heights,
    )

    current_row = 1

    # 1. Main Price Panel (TradingView Exact Palette: #089981 Green / #f23645 Red)
    if chart_type == "Candlestick" and "Open" in df.columns:
        fig.add_trace(
            go.Candlestick(
                x=df["Date"],
                open=df["Open"],
                high=df["High"],
                low=df["Low"],
                close=df["Close"],
                name="OHLC",
                increasing_line_color="#089981",
                decreasing_line_color="#f23645",
                increasing_fillcolor="#089981",
                decreasing_fillcolor="#f23645",
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
                name="Price",
                line=dict(color="#2962ff", width=2),  # TradingView Royal Blue
                fill="tozeroy",
                fillcolor="rgba(41, 98, 255, 0.05)",
            ),
            row=current_row,
            col=1,
        )

    # Bollinger Bands
    if show_bb and "BB_Upper" in df.columns:
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["BB_Upper"],
                mode="lines",
                line=dict(color="rgba(148, 163, 184, 0.3)", width=1),
                name="BB Upper",
            ),
            row=current_row,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["BB_Lower"],
                mode="lines",
                line=dict(color="rgba(148, 163, 184, 0.3)", width=1),
                fill="tonexty",
                fillcolor="rgba(148, 163, 184, 0.04)",
                name="BB Lower",
            ),
            row=current_row,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["BB_Middle"],
                mode="lines",
                line=dict(color="#f59e0b", width=1, dash="dot"),
                name="BB Mid (20)",
            ),
            row=current_row,
            col=1,
        )

    # EMAs (TradingView Standard Colors: Blue 20, Orange 50, Purple 200)
    if show_ema:
        if "EMA_20" in df.columns:
            fig.add_trace(
                go.Scatter(
                    x=df["Date"],
                    y=df["EMA_20"],
                    mode="lines",
                    line=dict(color="#2962ff", width=1.3),
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
                    line=dict(color="#ff9800", width=1.4),
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
                    line=dict(color="#9c27b0", width=1.6),
                    name="EMA 200",
                ),
                row=current_row,
                col=1,
            )

    # 2. Volume Panel
    if has_volume:
        current_row += 1
        vol_colors = [
            "#089981" if c >= o else "#f23645"
            for c, o in zip(df["Close"], df["Open"] if "Open" in df.columns else df["Close"])
        ]
        fig.add_trace(
            go.Bar(
                x=df["Date"],
                y=df["Volume"],
                name="Vol",
                marker_color=vol_colors,
                opacity=0.6,
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
                line=dict(color="#7e57c2", width=1.6),
            ),
            row=current_row,
            col=1,
        )
        fig.add_hline(y=70, line=dict(color="#f23645", width=1, dash="dash"), row=current_row, col=1)
        fig.add_hline(y=30, line=dict(color="#089981", width=1, dash="dash"), row=current_row, col=1)
        fig.add_hrect(
            y0=30, y1=70, fillcolor="rgba(126, 87, 194, 0.05)", line_width=0, row=current_row, col=1
        )

    # 4. MACD Panel
    if has_macd:
        current_row += 1
        hist_colors = ["#089981" if val >= 0 else "#f23645" for val in df["MACD_Hist"]]
        fig.add_trace(
            go.Bar(
                x=df["Date"],
                y=df["MACD_Hist"],
                name="Hist",
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
                line=dict(color="#2962ff", width=1.4),
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
                line=dict(color="#ff9800", width=1.2),
            ),
            row=current_row,
            col=1,
        )
        fig.add_hline(y=0, line=dict(color="#2a2e39", width=1), row=current_row, col=1)

    chart_height = 520 + (110 if has_rsi else 0) + (110 if has_macd else 0)

    is_dark = theme == "dark"
    bg = "#131722" if is_dark else "#ffffff"
    grid = "#1e222d" if is_dark else "#f0f3fa"
    spike = "#363c4e" if is_dark else "#d1d4dc"
    txt_col = "#787b86" if is_dark else "#64748b"

    # TradingView Exact Chart Layout: Right-Side Y-Axis, Clean Margins
    fig.update_layout(
        template="plotly_dark" if is_dark else "plotly_white",
        paper_bgcolor=bg,
        plot_bgcolor=bg,
        height=chart_height,
        margin=dict(l=15, r=60, t=25, b=20),
        xaxis_rangeslider_visible=False,
        hovermode="x unified",
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.01,
            xanchor="left",
            x=0,
            font=dict(size=11, color=txt_col),
        ),
    )

    # Right-side Y-axes just like TradingView!
    fig.update_xaxes(
        showgrid=True,
        gridwidth=1,
        gridcolor=grid,
        spikemode="across",
        spikesnap="cursor",
        spikethickness=1,
        spikecolor=spike,
    )
    fig.update_yaxes(
        side="right",
        showgrid=True,
        gridwidth=1,
        gridcolor=grid,
        spikemode="across",
        spikesnap="cursor",
        spikethickness=1,
        spikecolor=spike,
    )

    return fig


def create_financials_trend_chart(income_df: pd.DataFrame) -> go.Figure:
    """Create trend chart of Total Revenue vs Net Income."""
    if income_df is None or income_df.empty:
        fig = go.Figure()
        fig.add_annotation(text="Financial statements not available for trend visualization.", showarrow=False)
        fig.update_layout(template="plotly_dark", height=280, paper_bgcolor="#131722", plot_bgcolor="#131722")
        return fig

    try:
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
            rev_cr = [v / 1e7 if v and not np.isnan(v) else 0 for v in rev_row]
            fig.add_trace(go.Bar(x=years, y=rev_cr, name="Revenue", marker_color="#2962ff"))

        if net_row is not None:
            net_cr = [v / 1e7 if v and not np.isnan(v) else 0 for v in net_row]
            fig.add_trace(go.Bar(x=years, y=net_cr, name="Net Income", marker_color="#089981"))

        fig.update_layout(
            template="plotly_dark",
            barmode="group",
            paper_bgcolor="#131722",
            plot_bgcolor="#131722",
            height=300,
            margin=dict(l=20, r=40, t=25, b=25),
            legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
            xaxis=dict(gridcolor="#1e222d"),
            yaxis=dict(side="right", gridcolor="#1e222d"),
        )
        return fig
    except Exception:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", height=280, paper_bgcolor="#131722", plot_bgcolor="#131722")
        return fig


def create_hero_index_area_chart(
    df: pd.DataFrame,
    change_pct: float = 0.0,
    theme: str = "dark",
    height: int = 340,
) -> go.Figure:
    """
    Build a TradingView-styled Hero Index Area Chart with smooth gradient fill.
    Matches the large Nifty 50 / S&P 500 hero overview widget.
    """
    is_dark = theme == "dark"
    bg = "#131722" if is_dark else "#ffffff"
    grid = "#1e222d" if is_dark else "#f0f3fa"
    txt = "#787b86" if is_dark else "#64748b"

    line_col = "#089981" if change_pct >= 0 else "#f23645"
    fill_col = "rgba(8, 153, 129, 0.12)" if change_pct >= 0 else "rgba(242, 54, 69, 0.12)"

    fig = go.Figure()

    if df.empty or "Close" not in df.columns:
        fig.add_annotation(text="Index chart data unavailable", showarrow=False, font=dict(color=txt, size=12))
        fig.update_layout(template="plotly_dark" if is_dark else "plotly_white", paper_bgcolor=bg, plot_bgcolor=bg, height=height)
        return fig

    # If datetime index or column
    x_vals = df["Date"] if "Date" in df.columns else df.index

    fig.add_trace(
        go.Scatter(
            x=x_vals,
            y=df["Close"],
            mode="lines",
            line=dict(color=line_col, width=2.4),
            fill="tozeroy",
            fillcolor=fill_col,
            hoverinfo="x+y",
            hovertemplate="<b>%{y:,.2f}</b><br>%{x}<extra></extra>",
            name="Index Price",
        )
    )

    fig.update_layout(
        template="plotly_dark" if is_dark else "plotly_white",
        paper_bgcolor=bg,
        plot_bgcolor=bg,
        height=height,
        margin=dict(l=10, r=55, t=10, b=25),
        showlegend=False,
        hovermode="x",
        xaxis=dict(
            showgrid=True,
            gridcolor=grid,
            gridwidth=1,
            tickfont=dict(size=10, color=txt),
            zeroline=False,
        ),
        yaxis=dict(
            side="right",
            showgrid=True,
            gridcolor=grid,
            gridwidth=1,
            tickfont=dict(size=10, color=txt),
            zeroline=False,
            autorange=True,
        ),
    )
    return fig


def create_sparkline_area_chart(
    dates,
    values,
    change_pct: float = 0.0,
    color: str = None,
    theme: str = "dark",
    height: int = 90,
) -> go.Figure:
    """
    Compact sparkline area chart for multi-asset overview cards
    (Crypto market cap, USD/INR, 10Y Yield).
    """
    is_dark = theme == "dark"
    bg = "#1e222d" if is_dark else "#ffffff"

    if color:
        stroke = color
        fill = f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.12)" if color.startswith("#") and len(color) == 7 else "rgba(41, 98, 255, 0.12)"
    elif change_pct >= 0:
        stroke = "#089981"
        fill = "rgba(8, 153, 129, 0.12)"
    else:
        stroke = "#f23645"
        fill = "rgba(242, 54, 69, 0.12)"

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=values,
            mode="lines",
            line=dict(color=stroke, width=2.0),
            fill="tozeroy",
            fillcolor=fill,
            hoverinfo="y",
            hovertemplate="<b>%{y:,.2f}</b><extra></extra>",
        )
    )
    fig.update_layout(
        template="plotly_dark" if is_dark else "plotly_white",
        paper_bgcolor=bg,
        plot_bgcolor=bg,
        height=height,
        margin=dict(l=0, r=0, t=2, b=2),
        xaxis=dict(visible=False, showgrid=False),
        yaxis=dict(visible=False, showgrid=False),
        hovermode="x",
    )
    return fig


def create_macro_inflation_chart(
    months: list[str],
    values: list[float],
    theme: str = "dark",
    height: int = 120,
) -> go.Figure:
    """
    Bar chart showing historical annual inflation rates by month.
    Matches TradingView's India Annual Inflation Rate widget.
    """
    is_dark = theme == "dark"
    bg = "#1e222d" if is_dark else "#ffffff"
    bar_col = "#2962ff"
    txt_col = "#787b86" if is_dark else "#64748b"

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=months,
            y=values,
            marker_color=bar_col,
            marker_line_width=0,
            text=[f"{v:.1f}%" for v in values],
            textposition="outside",
            textfont=dict(size=9, color=txt_col),
            hoverinfo="x+y",
            hovertemplate="<b>%{x}</b>: %{y:.2f}%<extra></extra>",
        )
    )
    fig.update_layout(
        template="plotly_dark" if is_dark else "plotly_white",
        paper_bgcolor=bg,
        plot_bgcolor=bg,
        height=height,
        margin=dict(l=5, r=5, t=18, b=22),
        xaxis=dict(
            showgrid=False,
            tickfont=dict(size=9, color=txt_col),
            tickangle=0,
        ),
        yaxis=dict(
            visible=False,
            showgrid=False,
        ),
    )
    return fig


def create_trade_idea_preview_chart(
    symbol: str,
    idea_title: str,
    setup_type: str = "demand_zone",
    theme: str = "dark",
    height: int = 210,
) -> go.Figure:
    """
    Render a clean technical analysis setup preview chart for Community Trade Ideas.
    Shows price action with annotated support/resistance, demand boxes, and targets.
    """
    is_dark = theme == "dark"
    bg = "#1e222d" if is_dark else "#ffffff"
    txt_col = "#787b86" if is_dark else "#64748b"
    grid_col = "#2a2e39" if is_dark else "#f0f3fa"

    # Generate synthetic realistic price wave for the setup demonstration
    np.random.seed(abs(hash(symbol + idea_title)) % 10000)
    periods = 35
    dates = pd.date_range("2026-08-10", periods=periods, freq="D")
    
    base_price = 240.0 if "SHALBY" in symbol.upper() else 120.0 if "MUKAN" in symbol.upper() else 23000.0 if "NIFTY" in symbol.upper() else 82000.0 if "BTC" in symbol.upper() else 1500.0
    
    # Create price pattern with a pullback into demand or breakout
    trend = np.linspace(-15, 25, periods)
    noise = np.random.normal(0, 3, periods)
    if "DEMAND" in idea_title.upper():
        # Dip into demand level and bounce
        dip = np.zeros(periods)
        dip[18:26] = -12
        dip[26:] = np.linspace(-10, 15, periods - 26)
        y_vals = base_price + trend * 0.4 + dip + noise
    else:
        # Consolidation and breakout
        y_vals = base_price + np.cumsum(np.random.normal(0.4, 2, periods))

    fig = go.Figure()

    # Main candlestick / line
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=y_vals,
            mode="lines",
            line=dict(color="#2962ff", width=2.2),
            fill="tozeroy",
            fillcolor="rgba(41, 98, 255, 0.05)",
            name="Price",
            hoverinfo="x+y",
        )
    )

    # Annotation lines for support / resistance / targets
    min_y = float(np.min(y_vals))
    max_y = float(np.max(y_vals))
    demand_level = min_y + (max_y - min_y) * 0.22
    target_level = max_y + (max_y - min_y) * 0.15

    # Demand zone / Support line
    fig.add_hline(
        y=demand_level,
        line_dash="dash",
        line_color="#089981",
        annotation_text="Demand / Support",
        annotation_position="bottom right",
        annotation_font=dict(size=9, color="#089981"),
    )

    # Target line
    fig.add_hline(
        y=target_level,
        line_dash="dot",
        line_color="#2962ff",
        annotation_text="Target Level",
        annotation_position="top right",
        annotation_font=dict(size=9, color="#2962ff"),
    )

    fig.update_layout(
        template="plotly_dark" if is_dark else "plotly_white",
        paper_bgcolor=bg,
        plot_bgcolor=bg,
        height=height,
        margin=dict(l=10, r=45, t=15, b=20),
        showlegend=False,
        xaxis=dict(showgrid=True, gridcolor=grid_col, tickfont=dict(size=9, color=txt_col)),
        yaxis=dict(side="right", showgrid=True, gridcolor=grid_col, tickfont=dict(size=9, color=txt_col), autorange=True),
    )
    return fig

