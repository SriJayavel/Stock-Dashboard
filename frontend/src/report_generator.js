/**
 * Mara Institutional Research Report Generator
 * Assembles a comprehensive, audit-ready research document for any asset.
 * Strictly separates:
 * [FACT] Audited filings and raw exchange quotes
 * [CALCULATION] Mathematical formulas, CAGRs, percentiles, and ratios
 * [INTERPRETATION] Rule-based observations with transparent factual bases
 */

export class ResearchReportGenerator {
  static generateMarkdownReport({ stockData, researchData, deepResearchData, v4Data }) {
    const symbol = stockData?.symbol || 'UNKNOWN';
    const name = stockData?.name || symbol;
    const curr = stockData?.currency_symbol || '₹';
    const price = stockData?.current_price?.toFixed(2) || '—';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const health = deepResearchData?.financial_health_score;
    const corpEvents = deepResearchData?.corporate_events?.events || [];
    const timeline = researchData?.financial_timeline || [];
    const peers = researchData?.peer_intelligence?.peers || [];
    const histVal = deepResearchData?.historical_valuation || {};
    const dd = deepResearchData?.volatility_and_drawdown || {};
    const relPerf = deepResearchData?.relative_performance || {};

    const wc = v4Data?.what_changed_30d;
    const anomalies = v4Data?.anomalies || [];
    const relationships = v4Data?.fundamental_relationships;
    const quality = v4Data?.statement_quality;

    let md = `# Research Dossier: ${symbol}
**Company / Instrument:** ${name}  
**As of Date:** ${today}  
**Primary Source:** ${researchData?.provenance?.primary_source || 'Exchange / Public Data'}  
**Security Type:** ${stockData?.asset_type || 'Equity'}  
**Sector / Category:** ${stockData?.sector || 'General'} / ${stockData?.industry || 'Market'}  

---

## 1. EXECUTIVE SUMMARY & PRICE STRUCTURE
* **[FACT] Last Traded Price:** ${curr}${price}
* **[FACT] 52-Week Range:** ${curr}${stockData?.low_52w?.toFixed(2) || '—'} – ${curr}${stockData?.high_52w?.toFixed(2) || '—'}
* **[CALCULATION] 52-Week Channel Position:** ${researchData?.price_structure?.percentile_52w != null ? `${researchData.price_structure.percentile_52w}% of annual channel` : '—'}
* **[CALCULATION] Annualized Volatility (30D / 1Y):** ${dd.annualized_volatility_30d ? `${dd.annualized_volatility_30d}%` : '—'} / ${dd.annualized_volatility_1y ? `${dd.annualized_volatility_1y}%` : '—'}
* **[CALCULATION] Maximum Drawdown (5Y):** ${dd.max_drawdown_pct ? `${dd.max_drawdown_pct}%` : '—'} (Peak: ${curr}${dd.peak_price || '—'}, Trough: ${curr}${dd.trough_price || '—'}, Recovery: ${dd.recovery_days ? `${dd.recovery_days} days` : 'Pending'})
* **[FACT] Market Capitalization:** ${stockData?.market_cap_str || '—'}

---

## 2. AUDITABLE FINANCIAL HEALTH SCORE (TRANSPARENT METHODOLOGY)
* **[CALCULATION] Overall Health Score:** ${health?.overall_score || '—'} / 100

| Pillar Dimension | Pillar Score | Model Weight | Mathematical Basis & Input Metrics |
| :--- | :--- | :--- | :--- |
${(health?.pillars || [])
  .map(
    (p) =>
      `| ${p.name} | **${p.score}/100** | ${p.weight_pct}% | ${p.formula} (${Object.entries(p.metrics)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}) |`
  )
  .join('\n')}

---

## 3. AUDITED FINANCIAL STATEMENTS PROGRESSION (4-YEAR TIMELINE)
${
  timeline.length > 0
    ? `
| Fiscal Year | Total Revenue [FACT] | YoY Revenue Growth [CALCULATION] | Operating Profit (EBIT) [FACT] | Net Income [FACT] | Net Margin [CALCULATION] |
| :--- | :--- | :--- | :--- | :--- | :--- |
${timeline
  .map(
    (t) =>
      `| FY ${t.fiscal_year} | ${t.calculated_metrics?.revenue_str || '—'} | ${t.calculated_metrics?.yoy_revenue_growth_pct != null ? `${t.calculated_metrics.yoy_revenue_growth_pct >= 0 ? '+' : ''}${t.calculated_metrics.yoy_revenue_growth_pct}%` : 'Base Year'} | ${t.source_data?.operating_income ? curr + (t.source_data.operating_income / 1e7).toFixed(1) + ' Cr' : '—'} | ${t.calculated_metrics?.net_income_str || '—'} | ${t.calculated_metrics?.net_margin_pct != null ? `${t.calculated_metrics.net_margin_pct}%` : '—'} |`
  )
  .join('\n')}

* **[CALCULATION] 3-Year Audited Revenue CAGR:** ${researchData?.research_dossier?.financial_trend_summary?.cagr_3y_revenue_pct != null ? `+${researchData.research_dossier.financial_trend_summary.cagr_3y_revenue_pct}%` : '—'}
`
    : `_Audited multi-year statements apply exclusively to corporate equities._`
}

---

## 4. VALUATION MATRIX & 5-YEAR HISTORICAL CYCLE
* **[FACT] Trailing P/E (TTM):** ${stockData?.pe_trailing ? `${stockData.pe_trailing}x` : '—'}
* **[FACT] Forward P/E (Consensus 12M):** ${stockData?.pe_forward ? `${stockData.pe_forward}x` : '—'}
* **[FACT] Price to Book (P/B):** ${stockData?.pb_ratio ? `${stockData.pb_ratio}x` : '—'}
* **[FACT] EV / EBITDA:** ${stockData?.ev_ebitda ? `${stockData.ev_ebitda}x` : '—'}
* **[FACT] Dividend Yield:** ${stockData?.dividend_yield != null ? `${stockData.dividend_yield.toFixed(2)}%` : '—'}
* **[CALCULATION] 5-Year Historical P/E Envelope:** Low: ${histVal.pe_5y_low || '—'}x | Median: ${histVal.pe_5y_median || '—'}x | High: ${histVal.pe_5y_high || '—'}x
* **[INTERPRETATION] Valuation Stance:** ${histVal.valuation_stance || 'Historical median multiple alignment.'}

---

## 5. SECTOR PEER BENCHMARKING
| Symbol | Entity | Market Cap | Price | Trailing P/E | ROE | Net Margin | Debt/Equity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **${symbol} ★** | ${name} | ${stockData?.market_cap_str || '—'} | ${curr}${price} | ${stockData?.pe_trailing ? `${stockData.pe_trailing}x` : '—'} | ${stockData?.roe ? `${stockData.roe}%` : '—'} | ${timeline[timeline.length - 1]?.calculated_metrics?.net_margin_pct ? `${timeline[timeline.length - 1].calculated_metrics.net_margin_pct}%` : '—'} | ${stockData?.debt_to_equity ? `${stockData.debt_to_equity}x` : '0.00x'} |
${peers
  .map(
    (p) =>
      `| ${p.symbol} | ${p.name} | ${p.market_cap_str || '—'} | ${curr}${p.current_price?.toFixed(2) || '—'} | ${p.pe_trailing ? `${p.pe_trailing}x` : '—'} | ${p.roe ? `${p.roe}%` : '—'} | ${p.profit_margin ? `${p.profit_margin}%` : '—'} | ${p.debt_to_equity ? `${p.debt_to_equity}x` : '—'} |`
  )
  .join('\n')}
| **Cohort Median** | **Sector Benchmark** | — | — | **${researchData?.peer_intelligence?.peer_median_pe ? `${researchData.peer_intelligence.peer_median_pe}x` : '—'}** | **${researchData?.peer_intelligence?.peer_median_roe ? `${researchData.peer_intelligence.peer_median_roe}%` : '—'}** | — | — |

---

## 6. RELATIVE PERFORMANCE VS BENCHMARKS
${Object.entries(relPerf)
  .map(([benchName, data]) => {
    return `### vs ${benchName} (${data.benchmark_symbol})
* **1-Month:** Asset: ${dd.returns?.['1M'] ? `${dd.returns['1M']}%` : '—'} vs Benchmark: ${data.benchmark_returns?.['1M'] ? `${data.benchmark_returns['1M']}%` : '—'} (Alpha: ${data.relative_alpha?.['1M'] != null ? `${data.relative_alpha['1M']}%` : '—'})
* **3-Month:** Asset: ${dd.returns?.['3M'] ? `${dd.returns['3M']}%` : '—'} vs Benchmark: ${data.benchmark_returns?.['3M'] ? `${data.benchmark_returns['3M']}%` : '—'} (Alpha: ${data.relative_alpha?.['3M'] != null ? `${data.relative_alpha['3M']}%` : '—'})
* **1-Year:** Asset: ${dd.returns?.['1Y'] ? `${dd.returns['1Y']}%` : '—'} vs Benchmark: ${data.benchmark_returns?.['1Y'] ? `${data.benchmark_returns['1Y']}%` : '—'} (Alpha: ${data.relative_alpha?.['1Y'] != null ? `${data.relative_alpha['1Y']}%` : '—'})
`;
  })
  .join('\n')}

---

## 7. CORPORATE ACTIONS & DIVIDEND TIMELINE
${
  corpEvents.length > 0
    ? corpEvents
        .slice(0, 8)
        .map((e) => `* **[FACT] ${e.date}:** ${e.title} _(${e.impact})_`)
        .join('\n')
    : '_No recent corporate actions or dividend announcements cataloged._'
}

${
  relationships?.has_data
    ? `
---

## 8. FUNDAMENTAL RELATIONSHIPS & OPERATING LEVERAGE SPREADS
* **[CALCULATION] Revenue CAGR (${relationships.cagr_spreads?.years_evaluated || 3}Y):** ${relationships.cagr_spreads?.rev_cagr != null ? `${relationships.cagr_spreads.rev_cagr}%` : '—'}
* **[CALCULATION] Operating Income CAGR (${relationships.cagr_spreads?.years_evaluated || 3}Y):** ${relationships.cagr_spreads?.op_cagr != null ? `${relationships.cagr_spreads.op_cagr}%` : '—'}
* **[CALCULATION] Operating Leverage Ratio:** ${relationships.operating_leverage != null ? `${relationships.operating_leverage}x` : '—'}
* **[CALCULATION] Operating Margin Shift:** ${relationships.margin_movement_pp != null ? `${relationships.margin_movement_pp} pp` : '—'}

**Mathematical Observations:**
${(relationships.observations || []).map((o) => `* **[CALCULATION]** ${o}`).join('\n')}
`
    : ''
}

${
  quality?.has_data
    ? `
---

## 9. FINANCIAL STATEMENT QUALITY & ACCRUAL INTEGRITY
| Metric | Reported Value | Audit Status | Factual Mathematical Basis |
| :--- | :--- | :--- | :--- |
${(quality.signals || [])
  .map((s) => `| ${s.metric} | **${s.value}** | ${s.status} | ${s.mathematical_basis || s.observation} |`)
  .join('\n')}
`
    : ''
}

${
  wc?.has_data
    ? `
---

## 10. 30-DAY STATE ENGINE ("WHAT CHANGED?")
* **[FACT] State Comparison Window:** ${wc.baseline_date} → ${wc.as_of_date}
* **[CALCULATION] 30-Day Price Delta:** ${wc.deltas?.price_change_pct != null ? `${wc.deltas.price_change_pct}%` : '—'} (₹${wc.deltas?.baseline_price} → ₹${wc.deltas?.current_price})
* **[CALCULATION] Trailing P/E Multiple Shift:** ${wc.deltas?.pe_delta != null ? `${wc.deltas.pe_delta}x` : '—'} (${wc.deltas?.baseline_pe}x → ${wc.deltas?.current_pe}x)
* **[CALCULATION] 14-Day RSI Shift:** ${wc.deltas?.rsi_delta != null ? `${wc.deltas.rsi_delta}` : '—'} (${wc.deltas?.baseline_rsi} → ${wc.deltas?.current_rsi})
* **[CALCULATION] 50-Day EMA Distance:** ${wc.deltas?.ema50_distance_current_pct != null ? `${wc.deltas.ema50_distance_current_pct}%` : '—'}

**Regime Observations & Window Events:**
${(wc.regime_shifts || []).map((s) => `* **[FACT] Regime Shift:** ${s}`).join('\n')}
${(wc.corporate_actions_last_30d || []).map((a) => `* **[FACT] Action [${a.date}]:** ${a.title} (${a.impact})`).join('\n')}
`
    : ''
}

${
  anomalies.length > 0
    ? `
---

## 11. AUTOMATED ANOMALY SCANNER FLAGS
| Flagged Dimension | Severity | Trigger Metric | Description & Model Attribution |
| :--- | :--- | :--- | :--- |
${anomalies
  .map(
    (a) =>
      `| **${a.title}** | ${a.severity} | ${a.metric || '—'} | ${a.description} _(Model: ${a.attribution})_ |`
  )
  .join('\n')}
`
    : ''
}

---

## 12. Data Quality & Source Provenance
* **Primary Source:** ${researchData?.provenance?.primary_source || 'Exchange / Public Data'}
* **Timestamp of Record:** ${researchData?.provenance?.retrieved_at || new Date().toISOString()}
* **Cache Status / Freshness:** ${researchData?.provenance?.cache_status || 'Live Fetch'} (${researchData?.provenance?.pipeline_latency_ms || 0}ms pipeline latency)
* **Dataset Completeness:** ${deepResearchData?.data_quality?.overall_completeness_pct || 100}%

---
*Notice: Generated by Mara. All metrics are derived from public filings and market data. This document does not constitute investment advice.*
`;

    return md;
  }

  static downloadMarkdown(reportMd, symbol) {
    const blob = new Blob([reportMd], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mara_Report_${symbol}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static printReport(reportMd, symbol) {
    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow popups to open the printable research report.');
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mara Research Report - ${symbol}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #ffffff;
            color: #111827;
            padding: 40px;
            max-width: 900px;
            margin: 0 auto;
            line-height: 1.6;
            font-size: 13px;
          }
          h1 { font-size: 22px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
          h3 { font-size: 14px; margin-top: 16px; }
          table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
          ul { padding-left: 20px; }
          li { margin-bottom: 4px; }
          strong { color: #000; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; font-size: 14px;">Mara</span>
          <button onclick="window.print()" style="padding: 6px 14px; background: #141414; color: #ededed; border: 1px solid #262626; border-radius: 4px; cursor: pointer; font-size: 13px;">Print / Save PDF</button>
        </div>
        <pre style="white-space: pre-wrap; font-family: inherit;">${reportMd.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </body>
      </html>
    `);
    win.document.close();
  }
}
