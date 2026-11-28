/**
 * Mara Canvas Chart - Premium Enhanced Version
 * First-party, dependency-free market chart renderer with institutional-grade features.
 * All plotted values come from the supplied OHLCV series or the project's indicator calculations.
 */
import { INDICATOR_PALETTE, computeIndicator, getIndicatorDefinition, normalizeIndicatorParams } from './indicators.js';
import { getAccountStorageKey } from './auth.js';
import { provenance } from './provenance.js';
import { ChartTools } from './chart-tools.js';

const bullColor = '#10b981';
const bearColor = '#f43f5e';
const axisDateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
});
const axisTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const compactVolume = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const signedNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4, signDisplay: 'exceptZero' });
const signedPercent = new Intl.NumberFormat('en-US', {
  style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero',
});

function formatAxisDate(time, intraday) {
  const instant = new Date(typeof time === 'number' ? (time < 1e11 ? time * 1000 : time) : time);
  if (!Number.isFinite(instant.getTime())) return dateString(time);
  return axisDateFormat.format(instant) + (intraday ? ` · ${axisTimeFormat.format(instant)} UTC` : '');
}

function drawAxisTag(ctx, label, left, top, width, ink, surface) {
  ctx.save();
  ctx.fillStyle = surface;
  ctx.fillRect(left, top, width, 18);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + width / 2, top + 9, width - 8);
  ctx.restore();
}

function getThemeColor(token, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

function drawStudySeries(ctx, points, style, color, x, y, barWidth) {
  if (style.type === 'histogram' || style.type === 'dots') {
    const baseline = y(0);
    const width = Math.max(1, Math.min(9, barWidth * 0.65));
    points.forEach((point, index) => {
      if (!Number.isFinite(point?.value)) return;
      const yy = y(point.value);
      if (!Number.isFinite(yy)) return;
      if (style.type === 'histogram') {
        if (point.value === 0) return;
        ctx.fillStyle = point.color || (point.value > 0 ? bullColor : bearColor);
        ctx.fillRect(x(index) - width / 2, Math.min(yy, baseline), width, Math.max(1, Math.abs(yy - baseline)));
      } else {
        ctx.beginPath();
        ctx.arc(x(index), yy, Math.min(3, Math.max(1.3, barWidth * 0.32)), 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        if (point.hollow) ctx.stroke();
        else ctx.fill();
      }
    });
    return;
  }

  ctx.beginPath();
  ctx.lineWidth = style.lineWidth || 1.5;
  ctx.setLineDash(style.lineStyle === 2 ? [5, 4] : style.lineStyle === 3 ? [2, 3] : []);
  let previous;
  let stroke = color;
  points.forEach((point, index) => {
    const yy = Number.isFinite(point?.value) ? y(point.value) : NaN;
    if (!Number.isFinite(yy)) {
      previous = undefined;
      return;
    }
    const xx = x(index);
    const nextColor = point.color || color;
    if (stroke !== nextColor) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.beginPath();
      if (previous) ctx.moveTo(...previous);
      stroke = nextColor;
    }
    if (previous) ctx.lineTo(xx, yy);
    else ctx.moveTo(xx, yy);
    previous = [xx, yy];
  });
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.setLineDash([]);
}

function fillStudyBand(ctx, upper, lower, x, y, color) {
  let start = 0;
  const valid = (i) => Number.isFinite(upper[i]?.value) && Number.isFinite(lower[i]?.value)
    && Number.isFinite(y(upper[i].value)) && Number.isFinite(y(lower[i].value));
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  while (start < upper.length) {
    while (start < upper.length && !valid(start)) start++;
    let end = start;
    while (end < upper.length && valid(end)) end++;
    if (end - start > 1) {
      ctx.beginPath();
      ctx.moveTo(x(start), y(upper[start].value));
      for (let i = start + 1; i < end; i++) ctx.lineTo(x(i), y(upper[i].value));
      for (let i = end - 1; i >= start; i--) ctx.lineTo(x(i), y(lower[i].value));
      ctx.closePath();
      ctx.fill();
    }
    start = end;
  }
  ctx.restore();
}

function drawVolumeProfile(ctx, profile, area, y, color) {
  const maxVolume = Math.max(...profile.volumeProfile);
  if (maxVolume <= 0) return;
  const maxWidth = (area.right - area.left) * 0.23;
  profile.volumeProfile.forEach((volume, index) => {
    if (volume <= 0) return;
    const price = profile.priceRange.min + index * profile.rowHeight;
    const top = y(price + profile.rowHeight);
    const bottom = y(price);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
    const width = volume / maxVolume * maxWidth;
    ctx.fillStyle = color;
    ctx.globalAlpha = index === profile.pocIndex ? 0.75 : 0.34;
    ctx.fillRect(area.right - width, top, width, Math.max(1, bottom - top - 1));
  });
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color;
  const midpoint = profile.priceRange.min + (profile.pocIndex + 0.5) * profile.rowHeight;
  ctx.setLineDash([4, 4]);
  for (const level of [profile.valueArea.low, midpoint, profile.valueArea.high]) {
    const yy = y(level);
    if (!Number.isFinite(yy)) continue;
    ctx.beginPath();
    ctx.moveTo(area.left, yy);
    ctx.lineTo(area.right, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

function priceTickStep(span) {
  const rawStep = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const multiple = [1, 2, 2.5, 5, 10].find((value) => value >= rawStep / magnitude) ?? 10;
  return multiple * magnitude;
}

export function resampleCandles(candles = [], interval = 'D') {
  if (['1m', '2m', '5m', '15m', '30m', '60m', '1h', '1d'].includes(interval)) return candles || [];
  const groups = new Map();
  for (const bar of candles || []) {
    const t = typeof bar.time === 'string' ? bar.time : (typeof bar.time === 'number' ? new Date(bar.time < 1e11 ? bar.time * 1000 : bar.time).toISOString().slice(0, 10) : `${bar.time?.year}-${String(bar.time?.month).padStart(2,'0')}-${String(bar.time?.day).padStart(2,'0')}`);
    const date = new Date(`${t.slice(0,10)}T00:00:00Z`);
    let key = t.slice(0,10);
    if (interval === 'W' || interval === '1wk') {
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); key = date.toISOString().slice(0,10);
    } else if (interval === 'M' || interval === '1mo') key = t.slice(0,7);
    const prev = groups.get(key);
    if (!prev) groups.set(key, { ...bar });
    else { prev.high = Math.max(prev.high, bar.high); prev.low = Math.min(prev.low, bar.low); prev.close = bar.close; prev.volume = (prev.volume || 0) + (bar.volume || 0); }
  }
  return [...groups.values()];
}

export const dateString = (time) => {
  if (typeof time === 'string') return time.slice(0, 10);
  if (typeof time === 'number') return new Date(time < 1e11 ? time * 1000 : time).toISOString().slice(0, 10);
  if (time && time.year) return `${time.year}-${String(time.month).padStart(2,'0')}-${String(time.day).padStart(2,'0')}`;
  return String(time || '');
};

export const formatTickTime = (time, isIntraday = false) => {
  if (typeof time === 'number') {
    const d = new Date(time < 1e11 ? time * 1000 : time);
    if (isIntraday) {
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return d.toISOString().slice(0, 7);
  }
  if (typeof time === 'string') {
    if (isIntraday) {
      if (time.includes('T') || time.includes(' ') || time.includes(':')) {
        const parts = time.split(/[T ]/);
        if (parts[1]) return parts[1].slice(0, 5);
      }
      return time.slice(5, 10);
    }
    return time.slice(0, 7);
  }
  if (time && time.year) return `${time.year}-${String(time.month).padStart(2,'0')}`;
  return String(time || '');
};

export const formatFullTime = (time) => {
  if (typeof time === 'number') {
    const d = new Date(time < 1e11 ? time * 1000 : time);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }
  if (typeof time === 'string') {
    return time.replace('T', ' ').slice(0, 19);
  }
  return dateString(time);
};

export class TerminalChart {
  constructor(container, tooltip, onStateChange = null) {
    this.container = container; this.tooltip = tooltip; this.onStateChange = onStateChange;
    this.activeIndicators = new Map(); this.subPanes = new Map(); this.maxSubPanes = 4; this.paletteIndex = 0;
    this.rawDailyCandles = []; this.currentCandles = []; this.markers = []; this.visibleCount = 0; this.endIndex = 0;
    this.activeInterval = localStorage.getItem(getAccountStorageKey('apex_chart_interval')) || 'D'; this.activeRange = localStorage.getItem(getAccountStorageKey('apex_chart_range')) || '1Y';
    this.chartType = localStorage.getItem(getAccountStorageKey('apex_chart_type')) || 'candles'; this.scaleMode = localStorage.getItem(getAccountStorageKey('apex_chart_scale')) || 'normal';
    this.showVolume = true;
    this.crosshairEnabled = true; this.mainRatio = 0.72; this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.className = 'apex-native-chart'; this.canvas.setAttribute('role','img'); this.canvas.setAttribute('aria-label','Interactive stock price chart');
    this.container.replaceChildren(this.canvas); this.ctx = this.canvas.getContext('2d');
    const parent = container.parentElement || container;
    this.headersContainer = parent.querySelector('#tv-subpane-headers') || this.makeLayer(parent,'tv-subpane-headers','tv-subpane-headers');
    this.splittersContainer = parent.querySelector('#tv-splitters-container') || this.makeLayer(parent,'tv-splitters-container','tv-splitters-container');
    this.cornerLegend = parent.querySelector('#tv-corner-legend');
    this.tools = new ChartTools(this);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    window.addEventListener('resize', () => this.resize());
    this.bindInteraction(); this.loadSavedIndicators(); this.resize();

    // Premium enhancements
    this.hoverEffects = new Map();
    this.tooltipTimeout = null;
  }

  makeLayer(parent,id,cls) {
    const el=document.createElement('div');
    el.id=id;
    el.className=cls;
    parent.appendChild(el);
    return el;
  }

  loadSavedIndicators() {
    let saved=[];
    try {
      saved=JSON.parse(localStorage.getItem(getAccountStorageKey('apex_indicators'))||'[]');
    } catch {}
    if (!Array.isArray(saved)||!saved.length) saved=[{id:'ema',params:{period:50},visible:true}];
    saved.forEach(x=>this.addIndicator(x.id,x.params||{},x.visible??true,false));
  }

  saveIndicatorsState() {
    try {
      localStorage.setItem(getAccountStorageKey('apex_indicators'),JSON.stringify([...this.activeIndicators.values()].map(i=>({id:i.id,params:i.params,visible:i.visible}))));
    } catch {}
  }

  getInstanceByDefId(id) {
    return [...this.activeIndicators.values()].find(x=>x.id===id)||null;
  }

  getActiveIndicatorsList() {
    return [...this.activeIndicators.values()].map(({seriesMap,...i})=>({...i,def:i.def}));
  }

  addIndicator(id, params={}, visible=true, persist=true) {
    const def=getIndicatorDefinition(id);
    if (!def || this.getInstanceByDefId(id)) return null;

    const pane=def.pane==='separate' ? [...Array(this.maxSubPanes).keys()].map(i=>i+1).find(i=>!this.subPanes.has(i)) : 0;
    if (pane===undefined) {
      this.notifyUser(`Maximum of ${this.maxSubPanes} oscillator sub-panes reached.`);
      return null;
    }

    const instanceId=`${id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const instance={instanceId,id,name:def.name,short:def.short,group:def.group,pane:def.pane,paneIndex:pane,params:normalizeIndicatorParams(def, params),color:INDICATOR_PALETTE[this.paletteIndex++%INDICATOR_PALETTE.length],visible,unavailable:false,unavailableReason:'',headerElement:null,def,values:{}};

    this.activeIndicators.set(instanceId,instance);
    if(pane) {
      this.subPanes.set(pane,instanceId);
      this.mountSubPaneHeader(instance);
    }
    this.computeAndApplyIndicator(instance,this.currentCandles);
    if (pane) this.rebalancePanes();
    else this.render();

    if(persist)this.saveIndicatorsState();
    if(this.onStateChange)this.onStateChange(this.getActiveIndicatorsList());
    return instanceId;
  }

  mountSubPaneHeader(inst) {
    const el=document.createElement('div');
    el.className='tv-subpane-header';
    el.id=`subpane-hdr-${inst.instanceId}`;

    // Premium enhancement: add hover effects and better visual hierarchy
    el.innerHTML=`
      <div class="pane-hdr-left">
        <span class="pane-hdr-title" style="color:${inst.color};font-weight:600;letter-spacing:-0.5px">${inst.name} (${Object.values(inst.params).join(', ')})</span>
        <span id="subpane-val-${inst.instanceId}" class="pane-hdr-value">—</span>
        <span id="subpane-unavail-${inst.instanceId}" style="display:none;color:#fb7185;font-size:11px"></span>
      </div>
      <div class="pane-hdr-actions">
        <button class="pane-btn-eye" aria-label="Toggle ${inst.name}" style="opacity:0.7;transition:opacity 0.2s">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button class="pane-btn-close" aria-label="Remove ${inst.name}" style="opacity:0.7;transition:opacity 0.2s">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    // Add hover effects for premium feel
    const eyeBtn = el.querySelector('.pane-btn-eye');
    const closeBtn = el.querySelector('.pane-btn-close');

    eyeBtn.onmouseenter = () => eyeBtn.style.opacity = '1';
    eyeBtn.onmouseleave = () => eyeBtn.style.opacity = '0.7';
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.7';

    eyeBtn.onclick=()=>this.toggleIndicatorVisibility(inst.instanceId);
    closeBtn.onclick=()=>this.removeIndicator(inst.instanceId);
    this.headersContainer.appendChild(el);
    inst.headerElement=el;
  }

  removeIndicator(id) {
    const i=this.activeIndicators.get(id);
    if(!i)return;
    i.headerElement?.remove();
    this.activeIndicators.delete(id);
    this.subPanes.delete(i.paneIndex);
    let n=1;
    for(const [key,value] of [...this.subPanes].sort((a,b)=>a[0]-b[0])) {
      this.subPanes.delete(key);
      this.subPanes.set(n,value);
      const inst=this.activeIndicators.get(value);
      if(inst){
        inst.paneIndex=n;
      }
      n++;
    }
    this.rebalancePanes();
    this.saveIndicatorsState();
    this.render();
    if(this.onStateChange)this.onStateChange(this.getActiveIndicatorsList());
  }

  toggleIndicatorVisibility(id) {
    const i=this.activeIndicators.get(id);
    if(!i)return;
    i.visible=!i.visible;
    i.headerElement?.classList.toggle('pane-muted',!i.visible);
    this.saveIndicatorsState();
    this.render();
    if(this.onStateChange)this.onStateChange(this.getActiveIndicatorsList());
  }

  updateIndicatorParams(id,params) {
    const i=this.activeIndicators.get(id);
    if(!i)return;
    i.params=normalizeIndicatorParams(i.def, {...i.params,...params});
    this.computeAndApplyIndicator(i,this.currentCandles);
    if(i.headerElement)i.headerElement.querySelector('.pane-hdr-title').textContent=this.formatIndicatorTitle(i);
    this.saveIndicatorsState();
    this.render();
    if(this.onStateChange)this.onStateChange(this.getActiveIndicatorsList());
  }

  formatIndicatorTitle(i){
    return `${i.name} (${Object.values(i.params).join(', ')})`;
  }

  computeAndApplyIndicator(i,candles) {
    const r=computeIndicator(i.id,candles || [],i.params);
    i.unavailable=!!r.unavailable;
    i.unavailableReason=r.reason||'';
    i.values=r.seriesData||{};
    const un=i.headerElement?.querySelector(`#subpane-unavail-${i.instanceId}`);
    if(un){
      un.textContent=i.unavailableReason;
      un.style.display=i.unavailable?'inline':'none';
    }
  }

  rebalancePanes() {
    const count=this.subPanes.size;
    if (count === 0) {
      this.mainRatio = 0.9; // No subpanes: main chart takes 90% of space
    } else {
      // With subpanes: main chart gets fixed height of 360px
      const containerHeight = Math.max(500, 360 + count * 120);
      this.mainRatio = 360 / containerHeight;
    }
    this.container.style.height = count ? `${Math.max(500, 360 + count * 120)}px` : '100%';
    this.renderPaneSplitters();
    this.render();
  }

  mainPaneHeight() {
    return this.subPanes.size
      ? Math.min(this.height - 26, Math.max(100, this.height * this.mainRatio))
      : this.height - 26;
  }

  renderPaneSplitters(){
    this.splittersContainer.replaceChildren();
    if(!this.subPanes.size)return;
    const s=document.createElement('div');
    s.className='tv-pane-splitter';
    s.style.top=`${this.mainPaneHeight() - 4}px`;
    s.title='Drag to resize price pane';

    s.onpointerdown=e=>{
      e.preventDefault();
      const y=e.clientY,ratio=this.mainRatio;
      const move=m=>{
        this.mainRatio=Math.max(.42,Math.min(.86,ratio+(m.clientY-y)/this.height));
        this.renderPaneSplitters();
        this.render();
      };
      const up=()=>{
        window.removeEventListener('pointermove',move);
        window.removeEventListener('pointerup',up);
        window.removeEventListener('pointercancel',up);
      };
      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',up);
      window.addEventListener('pointercancel',up);
    };
    this.splittersContainer.appendChild(s);

    this.subPanes.forEach((id,p)=>{
      const i=this.activeIndicators.get(id);
      if(i?.headerElement){
        const mainHeight = this.mainPaneHeight();
        const paneHeight = (this.height - mainHeight) / this.subPanes.size;
        i.headerElement.style.top=`${mainHeight + (p - 1) * paneHeight + 6}px`;
        i.headerElement.style.left='14px';
      }
    });
  }

  resize(width,height) {
    width ||= this.container.clientWidth;
    height ||= this.container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (!width || !height || (width === this.width && height === this.height && dpr === this.pixelRatio)) return;
    this.width = width;
    this.height = height;
    this.pixelRatio = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    this.renderPaneSplitters();
    this.render(true);
  }

  isIntraday() {
    return ['1m', '2m', '5m', '15m', '30m', '60m', '1h'].includes(this.activeInterval);
  }

  setData(data, preserveRange = false, range = this.activeRange) {
    this.activeRange = range;
    if (!preserveRange && this.measuring) this.setMeasureMode(false);
    this.currentData = data;
    if (!preserveRange) {
      clearTimeout(this.tooltipTimeout);
      this.pointer = null;
    }
    if (data?.interval) this.activeInterval = data.interval;
    if (!data?.candles?.length) {
      this.currentCandles = [];
      this.rawDailyCandles = [];
      this.lastBar = null;
      this.pointer = null;
      this.tools.setContext(data?.symbol, this.activeInterval, range);
      if (this.tooltip) this.tooltip.replaceChildren();
      this.resetCornerLegend(data?.symbol, this.activeInterval);
      this.unavailableMessage = data?.message || (data?.range_note ? `${data.range_note}` : `${this.activeInterval || '1m'} data unavailable for selected range`);
      this.render();
      return;
    }
    this.unavailableMessage = null;
    this.rangeNote = data?.range_note || null;
    this.rawDailyCandles = [...(data.candles || [])];
    this.applyInterval(this.activeInterval, preserveRange);
    this.tools.setContext(data.symbol, this.activeInterval, range);
  }

  applyInterval(interval, preserveRange = false) {
    this.activeInterval = interval;
    this.heikinBars = null;
    try { localStorage.setItem(getAccountStorageKey('apex_chart_interval'), interval); } catch {}
    this.currentCandles = [...resampleCandles(this.rawDailyCandles, interval)];
    this.activeIndicators.forEach((i) => this.computeAndApplyIndicator(i, this.currentCandles));
    const int = document.getElementById('tv-leg-interval');
    if (int) int.textContent = { '1wk': '1W', '1mo': '1M' }[interval] || interval.toUpperCase();
    if (!preserveRange) this.setVisibleRangeByName(this.activeRange);
    else this.render();
    const last = this.currentCandles.at(-1);
    if (last) {
      this.lastBar = last;
      this.renderTooltip(last);
      this.renderCornerLegend(last);
    }
  }

  setVisibleRangeByName(name) {
    this.activeRange = name;
    try { localStorage.setItem(getAccountStorageKey('apex_chart_range'), name); } catch {}
    const bars = this.currentCandles;
    if (!bars?.length) return;
    this.applyNamedRange(name, bars);
    this.rangeLimit = this.visibleCount;
    this.render();
  }

  applyNamedRange(name, bars) {
    if (this.isIntraday()) {
      this.endIndex = bars.length;
      const upperName = name.toUpperCase();
      this.visibleCount = upperName === '1D' ? Math.min(bars.length, 390) : bars.length;
      return;
    }
    // Normalize name to uppercase for comparison
    const upperName = name.toUpperCase();
    const lastDate = new Date(`${dateString(bars.at(-1).time)}T00:00:00Z`);
    const date = new Date(lastDate);
    if (isNaN(lastDate.getTime())) {
      // Invalid date - show all bars
      this.endIndex = bars.length;
      this.visibleCount = bars.length;
      return;
    }
    if (upperName === '1D' || upperName === '5D') {
      this.endIndex = bars.length;
      const daily = ['D', '1d'].includes(this.activeInterval);
      this.visibleCount = Math.min(bars.length, upperName === '5D' && daily ? 5 : 1);
      return;
    }
    const months = { '1M': 1, '1MO': 1, '3M': 3, '3MO': 3, '6M': 6, '6MO': 6 }[upperName];
    if (months) {
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - months);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
    }
    else if (upperName === 'YTD') date.setUTCFullYear(date.getUTCFullYear(), 0, 1);
    else if (upperName === '1Y' || upperName === '2Y') date.setUTCFullYear(date.getUTCFullYear() - (upperName === '1Y' ? 1 : 2));
    else if (upperName === '5Y') date.setUTCFullYear(date.getUTCFullYear() - 5);
    else if (upperName === 'ALL') {
      this.endIndex = bars.length;
      this.visibleCount = bars.length;
      return;
    }
    else {
      // Unknown range - show all bars
      this.endIndex = bars.length;
      this.visibleCount = bars.length;
      return;
    }
    const from = bars.findIndex((b) => new Date(`${dateString(b.time)}T00:00:00Z`) >= date);
    this.endIndex = bars.length;
    this.visibleCount = bars.length - Math.max(0, from);
  }

  scrollToLatest() {
    this.endIndex = this.currentCandles.length;
    this.render();
  }

  resetView() {
    this.setScaleMode('normal');
    this.setVisibleRangeByName(this.activeRange || '1Y');
  }

  updateCandle(candle) {
    if (!candle || candle.close == null) return;
    this.heikinBars = null;
    const bars = this.currentCandles;
    if (!bars.length) {
      this.currentCandles = [candle];
      this.rawDailyCandles = [candle];
      this.render();
      return;
    }
    const lastBar = bars.at(-1);
    const cTime = candle.time;
    const lTime = lastBar.time;
    const intervalSec = this.activeInterval === '5m' ? 300 : (this.activeInterval === '15m' ? 900 : (this.activeInterval === '1h' ? 3600 : 60));
    const cNum = typeof cTime === 'number' ? cTime : Math.floor(new Date(cTime).getTime() / 1000);
    const lNum = typeof lTime === 'number' ? lTime : Math.floor(new Date(lTime).getTime() / 1000);
    const isSameTime = (
      cTime === lTime ||
      (!isNaN(cNum) && !isNaN(lNum) && Math.floor(cNum / intervalSec) === Math.floor(lNum / intervalSec)) ||
      (typeof cTime === 'string' && typeof lTime === 'string' && cTime.slice(0, 16) === lTime.slice(0, 16))
    );
    if (isSameTime) {
      lastBar.high = Math.max(Number(lastBar.high ?? lastBar.open), Number(candle.high ?? candle.close));
      lastBar.low = Math.min(Number(lastBar.low ?? lastBar.open), Number(candle.low ?? candle.close));
      lastBar.close = Number(candle.close);
      if (candle.volume != null) {
        lastBar.volume = Math.max(Number(lastBar.volume || 0), Number(candle.volume));
      }
    } else if ((!isNaN(cNum) && !isNaN(lNum) ? cNum > lNum : cTime > lTime) && (!bars.length || bars.at(-1).time !== candle.time)) {
      bars.push({ ...candle });
      if (this.rawDailyCandles && this.rawDailyCandles !== bars) this.rawDailyCandles.push({ ...candle });
      this.endIndex = bars.length;
      this.visibleCount = Math.min(this.rangeLimit || bars.length, this.visibleCount + 1);
    } else {
      return;
    }
    this.activeIndicators.forEach((i) => this.computeAndApplyIndicator(i, this.currentCandles));
    const latest = bars.at(-1);
    this.lastBar = latest;
    this.renderCornerLegend(latest);
    this.renderTooltip(latest);
    this.render();
  }

  update(candle) { this.updateCandle(candle); }

  patchLatestBar(quote) {
    if (this.isIntraday()) {
      if (quote?.current_price != null) {
        this.updateCandle({
          time: Math.floor(Date.now() / 1000),
          open: Number(quote.current_price),
          high: Number(quote.day_high || quote.current_price),
          low: Number(quote.day_low || quote.current_price),
          close: Number(quote.current_price),
          volume: Number(quote.volume || 0),
        });
      }
      return;
    }
    const b = this.rawDailyCandles.at(-1);
    if (!b || quote?.current_price == null) return;
    b.close = Number(quote.current_price);
    b.high = Math.max(b.high, Number(quote.high || quote.day_high || b.close));
    b.low = Math.min(b.low, Number(quote.low || quote.day_low || b.close));
    if (quote.volume) b.volume = Math.max(b.volume || 0, Number(quote.volume));
    this.applyInterval(this.activeInterval, true);
  }

  setChartType(type) {
    this.chartType = type;
    try { localStorage.setItem(getAccountStorageKey('apex_chart_type'), type); } catch {}
    this.render();
  }

  toggleCrosshair() {
    this.crosshairEnabled = !this.crosshairEnabled;
    this.render();
    return this.crosshairEnabled;
  }

  setScaleMode(mode) {
    this.scaleMode = mode;
    try { localStorage.setItem(getAccountStorageKey('apex_chart_scale'), mode); } catch {}
    this.render();
    return mode;
  }

  setEventMarkers(markers = []) {
    this.markers = markers || [];
    this.render();
  }

  setMeasureMode(enabled) {
    if (enabled && this.tools.mode) this.tools.setMode(null);
    this.measuring = enabled;
    this.measureStart = undefined;
    this.measureEnd = undefined;
    this.measureCursor = undefined;
    this.canvas.classList.toggle('is-measuring', enabled);
    if (enabled) this.canvas.setAttribute('aria-describedby', 'chart-measure-readout');
    else this.canvas.removeAttribute('aria-describedby');
    document.getElementById('tv-measure-btn')?.setAttribute('aria-pressed', String(enabled));
    const readout = document.getElementById('chart-measure-readout');
    if (readout) {
      readout.hidden = !enabled;
      readout.textContent = enabled ? 'Choose two candles. Use arrow keys and Enter on the chart.' : '';
    }
    this.render();
  }

  measureBar(index) {
    const candle = this.currentCandles[index];
    if (!Number.isFinite(candle?.close)) return;
    const readout = document.getElementById('chart-measure-readout');
    if (this.measureStart === undefined || this.measureEnd !== undefined) {
      this.measureStart = index;
      this.measureEnd = undefined;
      if (readout) readout.textContent = 'Choose an ending candle.';
    } else {
      const start = this.currentCandles[this.measureStart];
      const difference = candle.close - start.close;
      const percentage = start.close ? ` (${signedPercent.format(difference / start.close)})` : '';
      const bars = Math.abs(index - this.measureStart);
      this.measureEnd = index;
      if (readout) readout.textContent = `Close to close · ${signedNumber.format(difference)}${percentage} · ${bars} ${bars === 1 ? 'bar' : 'bars'} apart`;
    }
    this.render();
  }

  bindInteraction() {
    this.pointer = null;
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left;
      if (this.drag) {
        const delta = Math.round((this.drag.x - e.clientX) / (this.barWidth || 8));
        const length = this.currentCandles.length;
        const earliest = length - (this.rangeLimit || length) + this.visibleCount;
        this.endIndex = Math.max(earliest, Math.min(length, this.drag.end + delta));
        this.render();
        return;
      }
      this.pointer = { x, y: e.clientY - r.top };
      this.tools.cursor = null;
      this.tools.preview = this.drawingPointAt(this.pointer);
      const idx = this.isInPlot(this.pointer) ? this.indexAt(x) : -1;
      if (idx >= 0 && this.currentCandles[idx]) {
        // Premium enhancement: throttled tooltip update for better performance
        if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
        this.tooltipTimeout = setTimeout(() => {
          this.renderTooltip(this.currentCandles[idx]);
          this.renderCornerLegend(this.currentCandles[idx]);
        }, 16);
      } else if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
      this.render(false);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const bounds = this.canvas.getBoundingClientRect();
      const point = { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
      if (this.tools.mode || this.measuring) {
        if (this.tools.mode) this.tools.place(this.drawingPointAt(point));
        else if (this.isInPlot(point)) this.measureBar(this.indexAt(point.x));
        return;
      }
      const hit = this.eventMarkerHits?.find(marker => Math.hypot(marker.x - point.x, marker.y - point.y) <= 8);
      if (hit) {
        e.preventDefault();
        this.tools.showEvent(hit.key);
        return;
      }
      if (!this.isInPlot(point)) return;
      this.drag = { x: e.clientX, end: this.endIndex };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
    this.canvas.addEventListener('lostpointercapture', () => { this.drag = null; });
    this.canvas.addEventListener('keydown', event => {
      const visible = this.renderedBarIndices || [];
      if (this.tools.mode) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          const button = this.tools.buttons.find(item => item.dataset.chartDrawing === this.tools.mode);
          this.tools.setMode(null);
          button?.focus();
        } else if (['ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) {
          event.preventDefault();
          this.pointer = null;
          const slot = this.tools.cursor ?? visible.length - 1;
          const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
          const next = Math.max(0, Math.min(visible.length - 1, slot + delta));
          const bar = this.currentCandles[visible[next]];
          if (!bar) return;
          this.tools.cursor = next;
          this.tools.preview = { time: bar.time, price: bar.close };
          if (event.key === 'Enter') this.tools.place(this.tools.preview);
          this.render();
        }
        return;
      }
      if (!this.measuring) {
        if (['ArrowLeft', 'ArrowRight'].includes(event.key) && this.rangeLimit) {
          event.preventDefault();
          const earliest = this.currentCandles.length - this.rangeLimit + this.visibleCount;
          const next = this.endIndex + (event.key === 'ArrowLeft' ? -1 : 1);
          this.endIndex = Math.max(earliest, Math.min(this.currentCandles.length, next));
          this.render();
        } else if (['+', '=', '-'].includes(event.key)) {
          event.preventDefault();
          this.zoom(event.key === '-' ? 1 : -1);
        } else if (event.key === 'End') {
          event.preventDefault();
          this.scrollToLatest();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.setMeasureMode(false);
        document.getElementById('tv-measure-btn')?.focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.pointer = null;
        const offset = event.key === 'ArrowLeft' ? -1 : 1;
        this.measureCursor = Math.max(0, Math.min(visible.length - 1, (this.measureCursor ?? visible.length - 1) + offset));
        this.render();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.measureBar(visible[this.measureCursor ?? visible.length - 1]);
      }
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
      if (this.tools.cursor === null) this.tools.preview = null;
      if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
      if (this.tooltip) this.tooltip.replaceChildren();
      this.renderCornerLegend(this.currentCandles[this.renderedBarIndices?.at(-1)]);
      this.render();
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const bounds = this.canvas.getBoundingClientRect();
      const anchor = this.indexAt(e.clientX - bounds.left);
      this.zoom(Math.sign(e.deltaY), anchor);
    }, { passive: false });
  }

  isInPlot({ x, y }) {
    const plot = this.plot;
    return plot && x >= plot.left && x <= plot.right && y >= plot.top && y <= plot.bottom;
  }

  drawingPointAt(point) {
    if (!this.tools.mode || !this.isInPlot(point)) return null;
    const bar = this.currentCandles[this.indexAt(point.x)];
    if (!bar) return null;
    let price = this.priceAtY(point.y);
    if (this.tools.snap) {
      const distance = value => Math.abs(this.priceY(value) - point.y);
      price = [bar.open, bar.high, bar.low, bar.close].reduce((a, b) => distance(a) <= distance(b) ? a : b);
    }
    return Number.isFinite(price) ? { time: bar.time, price } : null;
  }

  zoom(direction, anchor = -1) {
    const length = this.currentCandles.length;
    const limit = Math.min(length, this.rangeLimit || length);
    if (!limit || !direction) return;
    const count = this.visibleCount;
    const step = Math.max(1, Math.round(count * 0.12));
    this.visibleCount = Math.max(1, Math.min(limit, count + direction * step));
    const relative = anchor < 0 || !count ? 0 : (this.endIndex - anchor - .5) / count;
    const end = this.endIndex + Math.round(relative * (this.visibleCount - count));
    this.endIndex = Math.min(length, Math.max(length - limit + this.visibleCount, end));
    this.render();
  }

  indexAt(x) {
    const indices = this.renderedBarIndices || [];
    if (!indices.length) return -1;
    return indices[Math.max(0, Math.min(indices.length - 1, Math.floor((x - this.plot.left) / this.barWidth)))];
  }

  // Premium enhancement: smooth rendering with animation frame
  render(immediate = true) {
    if (!immediate) {
      this.animationFrame ??= requestAnimationFrame(() => this.render(true));
      return;
    }
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;

    if (!this.ctx || this.width < 120 || this.height < 96) return;
    const c = this.ctx, w = this.width, h = this.height;
    const isLight = document.documentElement.classList.contains('light-theme');
    const bg = getThemeColor('--bg', isLight ? '#ffffff' : '#101114');
    const grid = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.07)';
    const muted = getThemeColor('--text-muted', isLight ? '#64748b' : '#a49d96');
    const accent = getThemeColor('--accent', isLight ? '#80551b' : '#eac47a');
    c.clearRect(0, 0, w, h);
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    const bars = this.currentCandles || [];
    this.eventMarkerHits = [];
    if (!bars.length) {
      this.plot = null;
      this.renderedBarIndices = [];
      this.renderStudyReadouts();
      c.fillStyle = muted;
      c.font = '13px sans-serif';
      c.fillText(this.unavailableMessage || 'Load a symbol to view price history', 20, 32);
      return;
    }
    const panes = this.subPanes.size;
    const mainH = this.mainPaneHeight();
    const plot = {
      left: 12, right: w - 76,
      top: Math.min(mainH - 46, (this.cornerLegend?.offsetHeight || 18) + 18),
      bottom: mainH - (panes ? 8 : 0),
    };
    this.plot = plot;
    // Ensure visibleCount is at least 1 to show at least one candle
    const effectiveVisibleCount = Math.max(1, this.visibleCount);
    const start = Math.max(0, this.endIndex - effectiveVisibleCount), end = Math.min(bars.length, this.endIndex || bars.length), visible = bars.slice(start, end);
    // Fallback: if no visible bars from slice, show all bars
    const barsToRender = (visible.length > 0) ? visible : bars.slice(0, bars.length);
    if (barsToRender.length === 0) {
      c.fillStyle = muted;
      c.font = '13px sans-serif';
      c.fillText(this.unavailableMessage || 'Load a symbol to view price history', 20, 32);
      return;
    }
    // Validate candle data - filter out invalid candles
    const indices = [];
    const validBars = barsToRender.filter((b, index) => {
      const close = b?.close;
      const open = b?.open;
      const high = b?.high;
      const low = b?.low;
      // Check if we have valid numeric OHLC values
      if (!Number.isFinite(close) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low)) return false;
      // Check for valid timestamp (non-zero, finite)
      const ts = b?.time;
      if (typeof ts === 'number' && (ts === 0 || !Number.isFinite(ts))) return false;
      indices.push((visible.length ? start : 0) + index);
      return true;
    });
    this.renderedBarIndices = indices;
    this.barWidth = (plot.right - plot.left) / Math.max(validBars.length, 1);

    // If no valid bars remain, show unavailable message
    if (validBars.length === 0) {
      this.plot = null;
      c.fillStyle = muted;
      c.font = '13px sans-serif';
      c.fillText('Insufficient data for chart', 20, 32);
      return;
    }

    const maxVolume = validBars.reduce((max, bar) => Number.isFinite(bar.volume) ? Math.max(max, bar.volume) : max, 0);
    const volumeBottom = plot.bottom;
    const volumeHeight = this.showVolume && maxVolume > 0 && volumeBottom - plot.top >= 160
      ? Math.min(64, (volumeBottom - plot.top) * .20) : 0;
    plot.bottom -= volumeHeight;
    // Use validBars for calculations and rendering
    const barsToRenderSafe = validBars;
    const comparison = this.tools.comparison;
    const sharedSlot = comparison ? validBars.findIndex(bar => bar.close > 0 && comparison.closes.get(String(bar.time)) > 0) : -1;
    const relativeScale = this.scaleMode === 'pct' || sharedSlot >= 0;
    const base = (validBars[Math.max(0, sharedSlot)]?.close) || 1;
    const comparisonBase = sharedSlot >= 0 ? comparison.closes.get(String(validBars[sharedSlot].time)) : null;
    const relativeCloses = comparisonBase ? validBars.map(bar => {
      const close = comparison.closes.get(String(bar.time));
      return close > 0 ? (close / comparisonBase - 1) * 100 : null;
    }) : [];
    const scaled = (v) => {
      if (!Number.isFinite(v)) return 0;
      return relativeScale ? ((v / base) - 1) * 100 : v;
    };
    const heikin = this.chartType === 'heikin_ashi';
    let transformed = null;
    if (heikin) {
      if (!this.heikinBars) {
        let previous;
        this.heikinBars = bars.map(bar => {
          if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) {
            previous = undefined;
            return bar;
          }
          const close = (bar.open + bar.high + bar.low + bar.close) / 4;
          const open = previous ? (previous.open + previous.close) / 2 : (bar.open + bar.close) / 2;
          previous = { ...bar, open, close, high: Math.max(bar.high, open, close), low: Math.min(bar.low, open, close) };
          return previous;
        });
      }
      transformed = indices.map(index => this.heikinBars[index]);
    }
    let min = Infinity;
    let max = -Infinity;
    for (const [index, bar] of validBars.entries()) {
      const candle = transformed?.[index] || bar;
      min = Math.min(min, scaled(candle.low), scaled(bar.close));
      max = Math.max(max, scaled(candle.high), scaled(bar.close));
      if (Number.isFinite(relativeCloses[index])) {
        min = Math.min(min, relativeCloses[index]);
        max = Math.max(max, relativeCloses[index]);
      }
    }
    const observedMin = min;
    const pad = (max - min) * 0.08 || Math.abs(max || 1) * 0.02;
    min -= pad; max += pad;
    const logScale = this.scaleMode === 'log' && !relativeScale && observedMin > 0;
    const step = priceTickStep(max - min);
    if (logScale) {
      min = Math.max(observedMin * 0.9, min);
    }
    const axisY = (value) => {
      const t = logScale ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
      return plot.bottom - t * (plot.bottom - plot.top);
    };
    const y = (value) => axisY(scaled(value));
    const valueAtY = yy => {
      const fraction = (plot.bottom - yy) / (plot.bottom - plot.top);
      return logScale ? min * (max / min) ** fraction : min + fraction * (max - min);
    };
    this.priceY = y;
    this.priceAtY = yy => relativeScale ? base * (1 + valueAtY(yy) / 100) : valueAtY(yy);
    const pixelCenter = position => (Math.round(position * this.pixelRatio - .5) + .5) / this.pixelRatio;
    const [mantissa, exponent = '0'] = step.toExponential(1).split('e');
    const tickDecimals = Math.min(12, Math.max(0, (mantissa.endsWith('0') ? 0 : 1) - Number(exponent)));
    const firstTick = Math.ceil(min / step);
    const tickCount = logScale ? 5 : Math.floor(max / step) - firstTick;
    const tickFormatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: tickDecimals,
      maximumFractionDigits: tickDecimals,
    });
    c.font = '11px ui-monospace,monospace';
    c.textBaseline = 'middle';
    c.lineWidth = 1 / this.pixelRatio;
    for (let n = 0; n <= tickCount; n++) {
      const value = logScale ? min * (max / min) ** (n / tickCount) : (firstTick + n) * step;
      const yy = axisY(value);
      c.strokeStyle = grid;
      c.beginPath();
      c.moveTo(plot.left, pixelCenter(yy));
      c.lineTo(plot.right, pixelCenter(yy));
      c.stroke();
      c.fillStyle = muted;
      c.textAlign = 'right';
      const numericLabel = tickFormatter.format(Math.abs(value) < step * 1e-8 ? 0 : value);
      c.fillText(relativeScale ? `${numericLabel}%` : numericLabel, w - 8, yy, w - plot.right - 12);
    }
    const labelCount = Math.min(validBars.length, Math.max(1, Math.floor((plot.right - plot.left) / 100)));
    const shortRange = Date.parse(dateString(validBars.at(-1).time)) - Date.parse(dateString(validBars[0].time)) < 120 * 86400000;
    let previousLabel;
    for (let n = 0; n < labelCount; n++) {
      const index = labelCount === 1 ? validBars.length - 1 : Math.round(n * (validBars.length - 1) / (labelCount - 1));
      const xx = plot.left + (index + 0.5) * this.barWidth;
      const time = validBars[index].time;
      const label = shortRange && !this.isIntraday() ? dateString(time).slice(5) : formatTickTime(time, this.isIntraday());
      if (label === previousLabel) continue;
      previousLabel = label;
      c.strokeStyle = grid;
      c.beginPath();
      c.moveTo(pixelCenter(xx), plot.top);
      c.lineTo(pixelCenter(xx), volumeBottom);
      c.stroke();
      const half = c.measureText(label).width / 2;
      c.fillStyle = muted;
      c.textAlign = 'center';
      c.fillText(label, Math.max(plot.left + half, Math.min(plot.right - half, xx)), h - 11);
    }
    if (['candles', 'heikin_ashi', 'hollow_candles'].includes(this.chartType)) {
      const hollow = this.chartType === 'hollow_candles';
      const dpr = this.pixelRatio || 1;
      const snap = value => Math.round(value * dpr) / dpr;
      const bodyWidth = Math.max(1 / dpr, snap(Math.min(14, this.barWidth * .7)));
      const wickWidth = Math.max(1 / dpr, snap(1));
      (transformed || validBars).forEach((bar, index) => {
        const { open, close } = bar;
        const rising = close >= open;
        const x = plot.left + (index + .5) * this.barWidth;
        const left = snap(x - bodyWidth / 2);
        const wickLeft = snap(x - wickWidth / 2);
        const top = snap(y(Math.max(open, close)));
        const bottom = Math.max(top + 1 / dpr, snap(y(Math.min(open, close))));
        const high = snap(y(Math.max(bar.high, open, close)));
        const low = snap(y(Math.min(bar.low, open, close)));
        const color = rising ? bullColor : bearColor;
        c.fillStyle = color;
        c.fillRect(wickLeft, high, wickWidth, Math.max(0, top - high));
        c.fillRect(wickLeft, bottom, wickWidth, Math.max(0, low - bottom));
        if (hollow && rising && bodyWidth > 2 * wickWidth && bottom - top > 2 * wickWidth) {
          c.strokeStyle = color;
          c.lineWidth = wickWidth;
          c.strokeRect(left + wickWidth / 2, top + wickWidth / 2, bodyWidth - wickWidth, bottom - top - wickWidth);
        } else {
          c.fillRect(left, top, bodyWidth, bottom - top);
        }
      });
    } else {
      // Draw a clear price line using the active theme accent.
      c.beginPath();
      barsToRenderSafe.forEach((b, j) => {
        const x = plot.left + (j + 0.5) * this.barWidth, yy = y(b.close);
        j ? c.lineTo(x, yy) : c.moveTo(x, yy);
      });
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.stroke();
      if (this.chartType === 'area') {
        const last = barsToRenderSafe.length - 1;
        c.lineTo(plot.left + (last + 0.5) * this.barWidth, plot.bottom);
        c.lineTo(plot.left + this.barWidth / 2, plot.bottom);
        c.closePath();
        c.fillStyle = accent;
        c.globalAlpha = 0.12;
        c.fill();
        c.globalAlpha = 1;
      }
    }
    if (volumeHeight) {
      c.save();
      c.strokeStyle = grid;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(plot.left, plot.bottom);
      c.lineTo(plot.right, plot.bottom);
      c.moveTo(plot.right, plot.top);
      c.lineTo(plot.right, volumeBottom);
      c.stroke();
      const width = Math.max(1, this.barWidth * .56);
      validBars.forEach((bar, index) => {
        if (!Number.isFinite(bar.volume) || bar.volume <= 0) return;
        const x = plot.left + (index + .5) * this.barWidth;
        const height = bar.volume / maxVolume * (volumeHeight - 8);
        c.fillStyle = bar.close >= bar.open ? `${bullColor}66` : `${bearColor}66`;
        c.fillRect(x - width / 2, volumeBottom - height, width, height);
      });
      const hoverSlot = this.pointer ? indices.indexOf(this.indexAt(this.pointer.x)) : -1;
      const volume = validBars[hoverSlot >= 0 ? hoverSlot : validBars.length - 1].volume;
      c.fillStyle = muted;
      c.font = '10px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillText(Number.isFinite(volume) ? `Vol ${compactVolume.format(volume)}` : 'Vol —', plot.right + 38, volumeBottom - 10, 64);
      c.restore();
    }
    this.activeIndicators.forEach((inst) => {
      if (!inst.visible || inst.unavailable) return;
      const pane = inst.paneIndex, area = pane ? { left: plot.left, right: plot.right, top: mainH + (pane - 1) * (h - mainH) / panes + 26, bottom: mainH + pane * (h - mainH) / panes - 20 } : plot;
      if (area.bottom <= area.top) return;
      const series = inst.def.render.map((style) => ({
        style,
        points: indices.map((index) => inst.values[style.key]?.[index]),
      }));
      const x = (index) => area.left + (index + 0.5) * this.barWidth;
      const levels = new Set(inst.def.levels || []);
      let studyY = y;
      if (pane) {
        if (series.some(({ style }) => ['histogram', 'dots'].includes(style.type))) levels.add(0);
        let low = Infinity;
        let high = -Infinity;
        for (const { points } of series) {
          for (const point of points) {
            if (!Number.isFinite(point?.value)) continue;
            low = Math.min(low, point.value);
            high = Math.max(high, point.value);
          }
        }
        if (!Number.isFinite(low)) return;
        for (const level of levels) {
          low = Math.min(low, level);
          high = Math.max(high, level);
        }
        const padding = (high - low) * 0.12 || Math.max(1, Math.abs(high) * 0.05);
        studyY = (value) => area.bottom - (value - low + padding) / (high - low + 2 * padding) * (area.bottom - area.top);
        c.save();
        c.strokeStyle = isLight ? '#cbd5e1' : '#2c3545';
        c.fillStyle = muted;
        c.textAlign = 'right';
        c.font = '10px ui-monospace, monospace';
        c.setLineDash([4, 4]);
        for (const level of levels) {
          const yy = studyY(level);
          c.beginPath();
          c.moveTo(area.left, yy);
          c.lineTo(area.right, yy);
          c.stroke();
          c.fillText(`${level}${inst.def.unit || ''}`, w - 8, yy);
        }
        c.restore();
      }
      c.save();
      c.beginPath();
      c.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      c.clip();
      if (inst.def.band) {
        const [upper, lower] = inst.def.band.map((key) => series.find(({ style }) => style.key === key)?.points || []);
        fillStudyBand(c, upper, lower, x, studyY, inst.color);
      }
      for (const { style, points } of series) {
        const color = series.length > 1 ? style.defaultColor || inst.color : inst.color;
        if (style.type === 'profile') {
          const profile = points.at(-1)?.value;
          if (profile) drawVolumeProfile(c, profile, area, studyY, color);
        } else {
          drawStudySeries(c, points, style, color, x, studyY, this.barWidth);
        }
      }
      c.restore();
    });
    this.markers.forEach((m) => {
      const idx = barsToRenderSafe.findIndex((b) => dateString(b.time) === String(m.time));
      if (idx < 0) return;
      const xx = plot.left + (idx + 0.5) * this.barWidth, yy = plot.top + 12;
      if (m.key !== undefined) this.eventMarkerHits.push({ x: xx, y: yy, key: m.key });
      c.fillStyle = m.color || accent;
      c.beginPath();
      c.arc(xx, yy, 4, 0, Math.PI * 2);
      c.fill();
    });
    const chartInk = getThemeColor('--text', isLight ? '#0f172a' : '#f2f4f7');
    const tagSurface = getThemeColor('--surface-hover', isLight ? '#f1f5f9' : '#1e2024');
    c.font = '11px ui-monospace, monospace';
    const tagWidth = w - plot.right - 4;
    const formatAxisValue = value => {
      const precision = Math.max(2, tickDecimals);
      const number = value.toLocaleString('en-US', { maximumFractionDigits: precision });
      return this.scaleMode === 'pct' ? `${number}%` : number;
    };
    const line = (x1, y1, x2, y2, color) => {
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    };
    const xAt = slot => plot.left + (slot + .5) * this.barWidth;
    if (comparisonBase) {
      c.save();
      c.strokeStyle = isLight ? '#1d4ed8' : '#8ebcff';
      c.fillStyle = c.strokeStyle;
      c.lineWidth = 1.6;
      c.setLineDash([5, 3]);
      c.beginPath();
      let penDown = false;
      relativeCloses.forEach((value, slot) => {
        if (!Number.isFinite(value)) {
          penDown = false;
          return;
        }
        const xx = xAt(slot), yy = axisY(value);
        if (penDown) c.lineTo(xx, yy);
        else c.moveTo(xx, yy);
        penDown = true;
        c.fillRect(xx - 1, yy - 1, 2, 2);
      });
      c.stroke();
      c.textAlign = 'right';
      c.textBaseline = 'top';
      c.fillText(`${comparison.symbol} · % from shared close`, plot.right - 6, plot.top + 5, plot.right - plot.left - 12);
      c.restore();
    } else if (comparison) {
      c.save();
      c.fillStyle = muted;
      c.textAlign = 'right';
      c.textBaseline = 'top';
      c.fillText(`${comparison.symbol} · No shared candles in view`, plot.right - 6, plot.top + 5, plot.right - plot.left - 12);
      c.restore();
    }
    const xAtTime = time => {
      const index = bars.findIndex(bar => bar.time === time);
      const slot = indices.indexOf(index);
      return index < 0 ? NaN : xAt(slot >= 0 ? slot : index - indices[0]);
    };
    this.tools.draw(c, plot, xAtTime, y, isLight ? '#6b38b9' : '#c6aeff', bg);
    const latest = bars.at(-1);
    const latestY = y(latest.close);
    if (indices.at(-1) === bars.length - 1 && latestY >= plot.top && latestY <= plot.bottom) {
      c.save();
      c.lineWidth = 1;
      c.setLineDash([2, 4]);
      line(plot.left, latestY, plot.right, latestY, muted);
      c.restore();
      drawAxisTag(c, formatAxisValue(scaled(latest.close)), plot.right + 2, latestY - 9, tagWidth, chartInk, tagSurface);
    }

    const pointerInPlot = this.pointer && this.isInPlot(this.pointer);
    const pointerSlot = pointerInPlot ? indices.indexOf(this.indexAt(this.pointer.x)) : -1;
    const cursorSlot = this.measuring
      ? (pointerSlot >= 0 ? pointerSlot : this.measureCursor ?? indices.length - 1)
      : this.tools.cursor ?? pointerSlot;
    const markerA = indices.indexOf(this.measureStart);
    const markerB = this.measureEnd === undefined ? cursorSlot : indices.indexOf(this.measureEnd);
    if (markerA >= 0 && markerB >= 0 && validBars[markerB]) {
      const x1 = xAt(markerA), x2 = xAt(markerB);
      const y1 = y(validBars[markerA].close), y2 = y(validBars[markerB].close);
      c.save();
      c.globalAlpha = .11;
      c.fillStyle = accent;
      c.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.max(1, Math.abs(x2 - x1)), Math.max(1, Math.abs(y2 - y1)));
      c.restore();
      line(x1, y1, x2, y2, accent);
    }
    if (cursorSlot >= 0 && validBars[cursorSlot] && (this.crosshairEnabled || this.measuring || this.tools.mode)) {
      const xx = xAt(cursorSlot);
      const yy = pointerInPlot ? this.pointer.y : y(validBars[cursorSlot].close);
      const axisValue = valueAtY(yy);
      c.save();
      c.lineWidth = 1;
      c.setLineDash([4, 4]);
      line(xx, plot.top, xx, panes ? h - 22 : volumeBottom, muted);
      line(plot.left, yy, plot.right, yy, muted);
      c.restore();
      if (Number.isFinite(axisValue)) drawAxisTag(c, formatAxisValue(axisValue), plot.right + 2, yy - 9, tagWidth, chartInk, tagSurface);
      const label = formatAxisDate(validBars[cursorSlot].time, this.isIntraday());
      const width = Math.min(plot.right - plot.left, c.measureText(label).width + 14);
      const left = Math.max(plot.left, Math.min(plot.right - width, xx - width / 2));
      drawAxisTag(c, label, left, h - 20, width, chartInk, tagSurface);
    }
    this.renderStudyReadouts();
  }

  updateTooltip(param) {
    this.renderTooltip(param);
  }

  renderTooltip(bar) {
    if (!this.tooltip || !bar) return;
    const o = bar.open ?? bar.value ?? 0, c = bar.close ?? bar.value ?? 0, up = c >= o, color = up ? bullColor : bearColor;
    const timeDisplay = this.isIntraday() ? formatFullTime(bar.time) : dateString(bar.time);
    // Premium enhancement: better formatted tooltip with subtle shadows and animations
    this.tooltip.innerHTML = `
      <div class="chart-legend-row" style="font-family: var(--font-mono); font-size: 12px; background: rgba(10,10,10,0.8); padding: 8px 12px; border-radius: 6px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);">
        <span class="legend-time" style="color: #b0b0b0; font-size: 11px;">${timeDisplay}</span>
        <span class="legend-item" style="margin: 0 8px;"><span class="lbl" style="color: #b0b0b0;">O:</span> <span class="val">${o.toFixed(2)}</span></span>
        <span class="legend-item" style="margin: 0 8px;"><span class="lbl" style="color: #b0b0b0;">H:</span> <span class="val">${(bar.high ?? o).toFixed(2)}</span></span>
        <span class="legend-item" style="margin: 0 8px;"><span class="lbl" style="color: #b0b0b0;">L:</span> <span class="val">${(bar.low ?? o).toFixed(2)}</span></span>
        <span class="legend-item" style="margin: 0 8px;"><span class="lbl" style="color: #b0b0b0;">C:</span> <span class="val" style="color:${color};font-weight:600;">${c.toFixed(2)}</span></span>
        <span class="legend-item" style="margin: 0 8px; color:${color};font-weight:600;">${up ? '+ ' : '− '}${(o ? Math.abs((c - o) / o * 100) : 0).toFixed(2)}% open to close</span>
      </div>
    `;
  }

  renderCornerLegend(bar){
    if (!bar) return;
    const dateLabel = document.getElementById('tv-leg-date');
    if (dateLabel) dateLabel.textContent = formatAxisDate(bar.time, this.isIntraday());
    const o=bar.open??0,h=bar.high??o,l=bar.low??o,c=bar.close??0,d=c-o,p=o?d/o*100:0,col=d>=0?'var(--gain)':'var(--loss)';
    [['tv-leg-open',o],['tv-leg-high',h],['tv-leg-low',l],['tv-leg-close',c]].forEach(([id,v])=>{
      const el=document.getElementById(id);
      if(el){
        el.textContent=Number(v).toFixed(2);
        if(id==='tv-leg-close')el.style.color=col;
      }
    });
    const ch=document.getElementById('tv-leg-change');
    if(ch){
      ch.textContent=`O→C ${d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}${d>=0?'+':''}${d.toFixed(2)} (${p>=0?'+':''}${p.toFixed(2)}%)`;
      ch.style.color=col;
    }
    const origin = document.getElementById('tv-leg-provenance');
    if (origin && origin.dataset.time !== String(bar.time)) {
      const date = new Date(bar.time * 1000);
      const provider = this.currentData?.demo_mode ? 'MARA synthetic price history' :
        this.currentData?.source || this.currentData?.provenance?.primary_source || 'MARA chart history';
      origin.dataset.time = String(bar.time);
      origin.innerHTML = provenance('OHLC', {
        label: 'Candle prices',
        details: `Source: ${provider}. Bar time: ${Number.isFinite(date.getTime()) ? date.toISOString() : 'Unavailable'}. O→C change is close minus open, and the percent change divides that by the open.`,
      });
    }
  }

  renderStudyReadouts() {
    const index = this.pointer ? this.indexAt(this.pointer.x) : this.renderedBarIndices?.at(-1);
    const overlay = document.getElementById('tv-legend-indicators');
    const overlays = [];
    for (const inst of this.activeIndicators.values()) {
      const values = [];
      if (inst.visible) {
        for (const { key, title, type } of inst.def.render) {
          const point = inst.values[key]?.[index];
          if (point?.label) values.push(`${title}: ${point.label}`);
          else if (Number.isFinite(point?.value)) {
            const prefix = inst.paneIndex || inst.def.render.length > 1 ? `${title} ` : '';
            values.push(`${prefix}${point.value.toFixed(2)}${inst.def.unit || ''}`);
          }
          else if (type === 'profile' && point?.value) {
            const profile = point.value;
            const poc = profile.priceRange.min + (profile.pocIndex + 0.5) * profile.rowHeight;
            values.push(`Point of control ${poc.toFixed(2)}`);
          }
        }
      }
      const label = values.join(' · ') || (inst.unavailable ? inst.unavailableReason : 'No plotted value');
      if (inst.paneIndex) {
        const readout = inst.headerElement?.querySelector('.pane-hdr-value');
        const text = inst.visible && !inst.unavailable ? label : '';
        if (readout && readout.textContent !== text) readout.textContent = text;
      } else if (inst.visible) {
        const settings = Object.entries(inst.params).map(([name, value]) => `${name} ${value}`).join(', ');
        overlays.push(`<span class="tv-leg-ind" style="--study-color:${inst.color}">${provenance(`${inst.short} ${label}`, {
          kind: 'calculation', label: inst.name,
          details: `${inst.def.description || inst.name}. Inputs: ${this.activeInterval} chart candles${settings ? `; ${settings}` : ''}.`,
        })}</span>`);
      }
    }
    const content = overlays.join('');
    if (overlay && overlay.innerHTML !== content) overlay.innerHTML = content;
  }

  resetCornerLegend(symbol='',interval=null){
    const dateLabel = document.getElementById('tv-leg-date');
    if (dateLabel) dateLabel.textContent = '';
    const origin = document.getElementById('tv-leg-provenance');
    if (origin) {
      origin.replaceChildren();
      delete origin.dataset.time;
    }
    const ids=['tv-leg-open','tv-leg-high','tv-leg-low','tv-leg-close','tv-leg-change'];
    ids.forEach(id=>{
      const e=document.getElementById(id);
      if(e)e.textContent='—';
    });
    const sym=document.getElementById('tv-leg-sym');
    if(sym&&symbol)sym.textContent=symbol;
    if(interval){
      const intEl=document.getElementById('tv-leg-interval');
      if(intEl)intEl.textContent=interval.toUpperCase();
    }
    this.lastBar=null;
    if(this.tooltip)this.tooltip.replaceChildren();
  }

  notifyUser(msg){
    if(typeof window.apexToast==='function')window.apexToast(msg);
    else console.warn(msg);
  }

  // Premium enhancement: add animation utilities for smooth transitions
  animateProperty(start, end, duration, callback) {
    const startTime = performance.now();
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      callback(start + (end - start) * easedProgress);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}
