/**
 * TradingView Lightweight Charts Engine
 * Provides multi-series candlestick rendering, volume bars, EMA 50/200,
 * Bollinger Bands, RSI, and MACD sub-panes.
 */

import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';

export class TerminalChart {
  constructor(containerElement, tooltipElement) {
    this.container = containerElement;
    this.tooltip = tooltipElement;
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.ema50Series = null;
    this.ema200Series = null;
    this.bbUpperSeries = null;
    this.bbMiddleSeries = null;
    this.bbLowerSeries = null;
    this.rsiChart = null;
    this.rsiSeries = null;
    this.macdChart = null;
    this.macdSeries = null;
    this.macdSignalSeries = null;
    this.macdHistSeries = null;

    this.activeIndicators = {
      ema50: true,
      ema200: true,
      bollinger: false,
      rsi: false,
      macd: false,
    };

    this.chartType = 'candles';
    this.crosshairEnabled = true;
    this.scaleMode = 'normal';
    this.lastBar = null;
    this.currentData = null;
    this.initChart();
  }

  initChart() {
    this.container.innerHTML = '';

    const width = this.container.clientWidth || 800;
    const height = 480;

    this.chart = createChart(this.container, {
      width: width,
      height: height,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#8a8a8a',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#333333',
          width: 1,
          style: 3,
          labelBackgroundColor: '#141414',
        },
        horzLine: {
          color: '#333333',
          width: 1,
          style: 3,
          labelBackgroundColor: '#141414',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // 1. Candlestick Series (Restrained Terminal Palette: #3ecf8e gain & #f0655a loss)
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#3ecf8e',
      downColor: '#f0655a',
      borderVisible: false,
      wickUpColor: '#3ecf8e',
      wickDownColor: '#f0655a',
    });

    // 1b. Line Series (Alternative Chart View)
    this.lineSeries = this.chart.addLineSeries({
      color: '#e8b34e',
      lineWidth: 2,
      visible: false,
    });

    // 1c. Area Series (Alternative Chart View)
    this.areaSeries = this.chart.addAreaSeries({
      topColor: 'rgba(232, 179, 78, 0.25)',
      bottomColor: 'rgba(232, 179, 78, 0.01)',
      lineColor: '#e8b34e',
      lineWidth: 2,
      visible: false,
    });

    // 2. Volume Series (integrated bottom overlay)
    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay pane
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // 3. EMA Overlays (Restrained)
    this.ema50Series = this.chart.addLineSeries({
      color: '#e8b34e', // Accent amber
      lineWidth: 1.5,
      title: 'EMA 50',
    });

    this.ema200Series = this.chart.addLineSeries({
      color: '#71717a', // Subtle neutral
      lineWidth: 1.5,
      title: 'EMA 200',
    });

    // 4. Bollinger Bands Overlays
    this.bbUpperSeries = this.chart.addLineSeries({
      color: 'rgba(160, 160, 160, 0.35)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: 'BB Upper',
    });

    this.bbMiddleSeries = this.chart.addLineSeries({
      color: 'rgba(160, 160, 160, 0.2)',
      lineWidth: 1,
      title: 'BB Middle',
    });

    this.bbLowerSeries = this.chart.addLineSeries({
      color: 'rgba(160, 160, 160, 0.35)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: 'BB Lower',
    });

    // Tooltip Crosshair Listener
    this.chart.subscribeCrosshairMove((param) => {
      this.updateTooltip(param);
    });

    // Responsive Auto-resize watching container pixel dimensions
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      if (this.chart && width > 0) {
        this.chart.applyOptions({
          width: Math.floor(width),
          height: height > 0 ? Math.floor(height) : 480,
        });
      }
    });
    resizeObserver.observe(this.container);
  }

  resize(width, height) {
    if (!this.chart || !this.container) return;
    const w = width ?? this.container.clientWidth;
    const h = height ?? this.container.clientHeight;
    if (w > 0 && h > 0) {
      this.chart.applyOptions({
        width: Math.floor(w),
        height: Math.floor(h),
      });
      this.chart.timeScale().fitContent();
    }
  }

  setData(data) {
    if (!data || !data.candles || data.candles.length === 0) return;
    this.currentData = data;

    // Apply Candles, Line, Area & Volume
    this.candleSeries.setData(data.candles);
    const lineData = data.candles.map((c) => ({ time: c.time, value: c.close }));
    this.lineSeries.setData(lineData);
    this.areaSeries.setData(lineData);

    if (data.volume) {
      this.volumeSeries.setData(data.volume);
    }

    // Apply EMA 50 / 200
    if (data.indicators?.ema_50) {
      this.ema50Series.setData(this.activeIndicators.ema50 ? data.indicators.ema_50 : []);
    }
    if (data.indicators?.ema_200) {
      this.ema200Series.setData(this.activeIndicators.ema200 ? data.indicators.ema_200 : []);
    }

    // Apply Bollinger Bands
    if (data.indicators?.bb_upper && this.activeIndicators.bollinger) {
      this.bbUpperSeries.setData(data.indicators.bb_upper);
      this.bbMiddleSeries.setData(data.indicators.bb_middle);
      this.bbLowerSeries.setData(data.indicators.bb_lower);
    } else {
      this.bbUpperSeries.setData([]);
      this.bbMiddleSeries.setData([]);
      this.bbLowerSeries.setData([]);
    }

    // Fit content smoothly
    this.chart.timeScale().fitContent();

    // Preserve active scale mode across data updates (e.g. timeframe / symbol switches)
    if (this.scaleMode && this.scaleMode !== 'normal') {
      this.setScaleMode(this.scaleMode);
    }

    // Set initial tooltip and corner legend to latest bar
    const lastBar = data.candles[data.candles.length - 1];
    if (lastBar) {
      this.lastBar = lastBar;
      this.renderTooltip(lastBar);
      this.renderCornerLegend(lastBar);
    }
  }

  setChartType(type) {
    this.chartType = type;
    if (this.candleSeries) this.candleSeries.applyOptions({ visible: type === 'candles' });
    if (this.lineSeries) this.lineSeries.applyOptions({ visible: type === 'line' });
    if (this.areaSeries) this.areaSeries.applyOptions({ visible: type === 'area' });
  }

  toggleCrosshair() {
    this.crosshairEnabled = !this.crosshairEnabled;
    this.chart.applyOptions({
      crosshair: {
        mode: this.crosshairEnabled ? CrosshairMode.Normal : CrosshairMode.Hidden,
      },
    });
    return this.crosshairEnabled;
  }

  setScaleMode(mode) {
    // Native Lightweight Charts enum: Normal = 0, Logarithmic = 1, Percentage = 2
    let modeVal = PriceScaleMode.Normal;
    if (mode === 'log') {
      modeVal = PriceScaleMode.Logarithmic;
    } else if (mode === 'pct') {
      modeVal = PriceScaleMode.Percentage;
    }

    this.scaleMode = mode;
    if (this.chart) {
      this.chart.applyOptions({
        rightPriceScale: {
          mode: modeVal,
        },
      });
      try {
        this.chart.priceScale('right').applyOptions({
          mode: modeVal,
        });
      } catch (e) {
        console.warn('priceScale applyOptions fallback:', e);
      }
    }
    return this.scaleMode;
  }

  toggleIndicator(indicatorName, isEnabled) {
    this.activeIndicators[indicatorName] = isEnabled;
    if (this.currentData) {
      if (indicatorName === 'ema50') {
        this.ema50Series.setData(isEnabled ? this.currentData.indicators?.ema_50 || [] : []);
      } else if (indicatorName === 'ema200') {
        this.ema200Series.setData(isEnabled ? this.currentData.indicators?.ema_200 || [] : []);
      } else if (indicatorName === 'bollinger') {
        if (isEnabled) {
          this.bbUpperSeries.setData(this.currentData.indicators?.bb_upper || []);
          this.bbMiddleSeries.setData(this.currentData.indicators?.bb_middle || []);
          this.bbLowerSeries.setData(this.currentData.indicators?.bb_lower || []);
        } else {
          this.bbUpperSeries.setData([]);
          this.bbMiddleSeries.setData([]);
          this.bbLowerSeries.setData([]);
        }
      }
    }

    // Immediately update corner legend so disabled indicator values vanish instantly
    if (this.lastBar) {
      this.renderCornerLegend(this.lastBar);
    } else {
      const ema50Container = document.getElementById('tv-leg-ema50');
      const ema200Container = document.getElementById('tv-leg-ema200');
      const bbContainer = document.getElementById('tv-leg-bb');
      if (ema50Container) ema50Container.style.display = this.activeIndicators.ema50 ? 'inline-block' : 'none';
      if (ema200Container) ema200Container.style.display = this.activeIndicators.ema200 ? 'inline-block' : 'none';
      if (bbContainer) bbContainer.style.display = this.activeIndicators.bollinger ? 'inline-block' : 'none';
    }
  }

  setEventMarkers(markers = []) {
    if (!this.candleSeries) return;
    try {
      // Ensure markers are sorted ascending by time as required by Lightweight Charts
      const sorted = [...markers].sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
      this.candleSeries.setMarkers(sorted);
    } catch (e) {
      console.warn('Failed to set chart markers:', e);
    }
  }

  updateTooltip(param) {
    if (!param || !param.time || !param.seriesData) {
      if (this.lastBar) {
        this.renderTooltip(this.lastBar);
        this.renderCornerLegend(this.lastBar);
      }
      return;
    }
    const bar = param.seriesData.get(this.candleSeries) || param.seriesData.get(this.lineSeries);
    if (bar) {
      this.renderTooltip(bar);
      const ema50Val = this.activeIndicators.ema50 ? param.seriesData.get(this.ema50Series)?.value : null;
      const ema200Val = this.activeIndicators.ema200 ? param.seriesData.get(this.ema200Series)?.value : null;
      const bbUpperVal = this.activeIndicators.bollinger ? param.seriesData.get(this.bbUpperSeries)?.value : null;
      const bbLowerVal = this.activeIndicators.bollinger ? param.seriesData.get(this.bbLowerSeries)?.value : null;
      this.renderCornerLegend(bar, {
        ema50: ema50Val,
        ema200: ema200Val,
        bbUpper: bbUpperVal,
        bbLower: bbLowerVal,
      });
    }
  }

  renderTooltip(bar) {
    if (!this.tooltip || !bar) return;
    const open = bar.open ?? bar.value ?? 0;
    const close = bar.close ?? bar.value ?? 0;
    const isUp = close >= open;
    const change = close - open;
    const changePct = open ? (change / open) * 100 : 0;
    const priceColor = isUp ? '#3ecf8e' : '#f0655a';

    this.tooltip.innerHTML = `
      <div class="chart-legend-row">
        <span class="legend-time">${bar.time}</span>
        <span class="legend-item"><span class="lbl">O:</span> <span class="val">${open.toFixed(2)}</span></span>
        <span class="legend-item"><span class="lbl">H:</span> <span class="val">${(bar.high ?? open).toFixed(2)}</span></span>
        <span class="legend-item"><span class="lbl">L:</span> <span class="val">${(bar.low ?? open).toFixed(2)}</span></span>
        <span class="legend-item"><span class="lbl">C:</span> <span class="val" style="color: ${priceColor}; font-weight: 600;">${close.toFixed(2)}</span></span>
        <span class="legend-item" style="color: ${priceColor}; font-weight: 600;">
          ${isUp ? '▲ +' : '▼ '}${changePct.toFixed(2)}%
        </span>
      </div>
    `;
  }

  renderCornerLegend(bar, indValues = {}) {
    if (!bar) return;
    const openEl = document.getElementById('tv-leg-open');
    const highEl = document.getElementById('tv-leg-high');
    const lowEl = document.getElementById('tv-leg-low');
    const closeEl = document.getElementById('tv-leg-close');
    const chgEl = document.getElementById('tv-leg-change');

    const open = bar.open ?? bar.value ?? 0;
    const high = bar.high ?? bar.value ?? 0;
    const low = bar.low ?? bar.value ?? 0;
    const close = bar.close ?? bar.value ?? 0;

    const isUp = close >= open;
    const diff = close - open;
    const pct = open ? (diff / open) * 100 : 0;
    const color = isUp ? 'var(--gain)' : 'var(--loss)';

    if (openEl) openEl.textContent = open.toFixed(2);
    if (highEl) highEl.textContent = high.toFixed(2);
    if (lowEl) lowEl.textContent = low.toFixed(2);
    if (closeEl) {
      closeEl.textContent = close.toFixed(2);
      closeEl.style.color = color;
    }
    if (chgEl) {
      chgEl.textContent = `${isUp ? '+' : ''}${diff.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
      chgEl.style.color = color;
    }

    // Active Indicator Values in Legend (Hide immediately when toggled off)
    const ema50Container = document.getElementById('tv-leg-ema50');
    const ema200Container = document.getElementById('tv-leg-ema200');
    const bbContainer = document.getElementById('tv-leg-bb');

    const ema50ValEl = document.querySelector('#tv-leg-ema50 .val');
    const ema200ValEl = document.querySelector('#tv-leg-ema200 .val');
    const bbValEl = document.querySelector('#tv-leg-bb .val');

    if (ema50Container) {
      ema50Container.style.display = this.activeIndicators.ema50 ? 'inline-block' : 'none';
      if (ema50ValEl && this.activeIndicators.ema50) {
        const v = indValues.ema50 ?? this.getLatestIndicatorVal(this.currentData?.indicators?.ema_50);
        ema50ValEl.textContent = v != null ? Number(v).toFixed(2) : '—';
      }
    }

    if (ema200Container) {
      ema200Container.style.display = this.activeIndicators.ema200 ? 'inline-block' : 'none';
      if (ema200ValEl && this.activeIndicators.ema200) {
        const v = indValues.ema200 ?? this.getLatestIndicatorVal(this.currentData?.indicators?.ema_200);
        ema200ValEl.textContent = v != null ? Number(v).toFixed(2) : '—';
      }
    }

    if (bbContainer) {
      bbContainer.style.display = this.activeIndicators.bollinger ? 'inline-block' : 'none';
      if (bbValEl && this.activeIndicators.bollinger) {
        const u = indValues.bbUpper ?? this.getLatestIndicatorVal(this.currentData?.indicators?.bb_upper);
        const l = indValues.bbLower ?? this.getLatestIndicatorVal(this.currentData?.indicators?.bb_lower);
        bbValEl.textContent = u != null && l != null ? `${Number(l).toFixed(1)} – ${Number(u).toFixed(1)}` : '—';
      }
    }
  }

  resetCornerLegend(symbol = '', timeframe = '1y') {
    const symEl = document.getElementById('tv-leg-sym');
    const intEl = document.getElementById('tv-leg-interval');
    const openEl = document.getElementById('tv-leg-open');
    const highEl = document.getElementById('tv-leg-high');
    const lowEl = document.getElementById('tv-leg-low');
    const closeEl = document.getElementById('tv-leg-close');
    const chgEl = document.getElementById('tv-leg-change');

    if (symEl && symbol) symEl.textContent = symbol;
    if (intEl && timeframe) intEl.textContent = timeframe.toUpperCase();
    if (openEl) openEl.textContent = '—';
    if (highEl) highEl.textContent = '—';
    if (lowEl) lowEl.textContent = '—';
    if (closeEl) {
      closeEl.textContent = '—';
      closeEl.style.color = 'inherit';
    }
    if (chgEl) {
      chgEl.textContent = '—';
      chgEl.style.color = 'inherit';
    }

    const ema50ValEl = document.querySelector('#tv-leg-ema50 .val');
    const ema200ValEl = document.querySelector('#tv-leg-ema200 .val');
    const bbValEl = document.querySelector('#tv-leg-bb .val');
    if (ema50ValEl) ema50ValEl.textContent = '—';
    if (ema200ValEl) ema200ValEl.textContent = '—';
    if (bbValEl) bbValEl.textContent = '—';

    if (this.tooltip) {
      this.tooltip.innerHTML = '';
    }
    this.lastBar = null;
  }

  getLatestIndicatorVal(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[arr.length - 1]?.value ?? null;
  }
}
