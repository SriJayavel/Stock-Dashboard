# Feature Risk Matrix — MARA Stock Dashboard
**Generated:** November 7, 2026
**Scope:** Assessment of each major feature against SEBI, data licensing, and consumer protection risks

---

## RISK CLASSIFICATION KEY

| Level | Definition |
|-------|------------|
| **CRITICAL** | Potentially unlawful activity or major unresolved regulatory exposure |
| **HIGH** | Significant compliance or licensing concern |
| **MEDIUM** | Requires clarification, disclosure, or remediation |
| **LOW** | Minor issue or recommended improvement |
| **NOT APPLICABLE** | Explain why |

---

## MAIN WORKSPACES RISK ASSESSMENT

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **MARKETS** | Data source licensing | Yahoo ToS, NSE ToS | CRITICAL | License market data or remove NSE scraping; add data attribution |
| **DISCOVER** | No issues | — | NOT APPLICABLE | NOT APPLICABLE |
| **ANALYZE** | Backtesting signals | SEBI IA Regulations | LOW-MEDIUM | Ensure signals labeled as simulation, not predictions |
| **COMPARE** | No issues | — | NOT APPLICABLE | NOT APPLICABLE |
| **RESEARCH** | Research report output | SEBI RA Regulations | HIGH | Add RA disclaimer; consider registration for commercial use |
| **MONITOR** | No issues | — | NOT APPLICABLE | NOT APPLICABLE |

---

## STOCK DASHBOARD FEATURES

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Stock Overview** | Market data display | Yahoo ToS | HIGH | Add data attribution; verify licensing |
| **Price History (Candles)** | Historical data redistribution | Yahoo ToS | HIGH | Add attribution; consider cache TTL limits |
| **Technical Indicators** | No issues | — | NOT APPLICABLE | NOT APPLICABLE |
| **Sector Intelligence** | Sector performance claims | Consumer Protection Act | MEDIUM | Avoid "outperforming" claims; use factual data |
| **Correlation Matrix** | No issues | — | NOT APPLICABLE | NOT APPLICABLE |
| **Portfolio Risk Calculator** | Portfolio analysis | SEBI RA Regulations | MEDIUM | Clear disclaimer that this is not advice |

---

## RESEARCH FEATURES

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Research Dossier** | Comparative valuation, peer benchmarking | SEBI RA Regulations, 2014 | HIGH | Labeling as "research" may require RA registration if monetized |
| **Deep Research** | Financial health score, valuation percentiles | SEBI RA Regulations | HIGH | Scoring system (0-100) is regulated output |
| **V4 Intelligence** | Anomaly detection, what-changed analysis | SEBI RA Regulations | MEDIUM | Qualitative tone labels may be construed as advice |
| **Market Status** | Market condition descriptions | SEBI Circulars | MEDIUM | "Bullish/Bearish Session" terminology needs legal review |
| **What Changed?** | 30-day trend analysis | SEBI RA Regulations | LOW | Historical analysis only; not predictive |

---

## SCREENENER FEATURES

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Dynamic Screener** | Stock filtering by criteria | SEBI RA Regulations | MEDIUM | Ensure user understands this is a tool, not a recommendation |
| **Custom Rules** | AND/OR logic filtering | Consumer Protection Act | LOW | Clear UI to distinguish filtering from advice |
| **CSV Export** | Data export | Data Protection | LOW | Add export attribution for data sources |

---

## BACKTESTER

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **EMA Crossover** | BUY/SELL signals in output | SEBI IA Regulations | LOW | Simulation only; clearly labeled as backtest |
| **RSI Mean Reversion** | Entry/exit signals | SEBI IA Regulations | LOW | Historical simulation; not forward-looking |
| **Strategy Performance** | CAGR, Max Drawdown, Win Rate | Marketing Claims | LOW | Must state: "Based on historical data. Past performance ≠ future results" |

---

## ALERTS

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Price Alerts** | User-set thresholds | — | NOT APPLICABLE | NOT APPLICABLE |
| **RSI Alerts** | Indicator-based triggers | — | NOT APPLICABLE | NOT APPLICABLE |
| **PE Alerts** | Multiple triggers | — | NOT APPLICABLE | NOT APPLICABLE |

---

## NOTEBOOK

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Research Notes** | User-generated content | — | NOT APPLICABLE | NOT APPLICABLE |
| **Markdown Export** | Content export | — | LOW | Add watermark or attribution if AI-assisted |

---

## REPORT GENERATOR

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Markdown Reports** | Research report format | SEBI RA Regulations | HIGH | Must include SEBI disclaimer; may need RA registration |
| **PDF Export** | Professional document | Marketing Claims | MEDIUM | Should not imply institutional endorsement |

---

## FRONTEND DASHBOARD

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Hero Section** | "Real-time equities intelligence" | Marketing Claims | MEDIUM | Clarify "intelligence" is data, not analysis |
| **Features List** | "Institutional analytics" | Misleading Advertising | MEDIUM | Either provide evidence of institutional use or rephrase |
| **"Start Free Trial"** | Monetization | Consumer Protection Act | MEDIUM | Need subscription T&C, refund policy before launch |

---

## AI ASSISTANT / CHAT

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **AI Assistant** | None found | — | NOT APPLICABLE | No AI assistant exists in codebase |

---

## RSS NEWS FEED

| Feature | Regulatory Concern | Applicable Rule | Risk | Required Action |
|---------|-------------------|-----------------|------|-----------------|
| **Yahoo News RSS** | Redistribution | Yahoo ToS | HIGH | Prohibited; remove or obtain license |
| **Google News RSS** | Redistribution | Google ToS | HIGH | Prohibited; remove |
| **BSE RSS** | Redistribution | BSE ToS | MEDIUM | Verify rights before use |

---

## DETAILED RISK ANALYSIS BY REGULATION

### SEBI Investment Advisers Regulations, 2013

| Feature | Trigger | Impact |
|---------|---------|--------|
| Financial Health Score | Produces numerical rating implying suitability | Could be construed as portfolio allocation advice |
| Valuation Percentiles | "Trading at X percentile of 52-week envelope" | Implies investment timing guidance |
| Peer Comparison | "Trades at discount to peers" | Relative valuation commentary |

### SEBI Research Analyst Regulations, 2014

| Feature | Trigger | Impact |
|---------|---------|--------|
| Research Dossier | Structured analysis with observations | May qualify as "research report" |
| Deep Research | Scores, rankings, comparative analysis | RA-defined "research report" characteristics |
| Target Price | Implied by "scenario modeling" | Explicit recommendation if monetized |

### Consumer Protection Act, 2019

| Feature | Trigger | Impact |
|---------|---------|--------|
| "Free Trial" CTA | Implies service offer | Requires T&C, cancellation policy |
| Performance claims | "Alpha", "Predictive modeling" | Misleading if unsubstantiated |

### Digital Personal Data Protection Act, 2023

| Feature | Trigger | Impact |
|---------|---------|--------|
| Email collection | User registration | Requires privacy notice |
| localStorage | Watchlist, notes, alerts | Requires disclosure |

---

## SUMMARY BY RISK LEVEL

### CRITICAL RISK (Must fix before ANY launch)

1. **NSE data scraping** — Unauthorized data extraction — **UNRESOLVED**
2. **yfinance data redistribution** — ToS violation for commercial use — **UNRESOLVED** (attribution added)
3. **Missing Privacy Policy** — DPDP Act violation — ✅ RESOLVED (November 15, 2026)
4. **Missing Terms & Conditions** — Consumer Protection Act violation — ✅ RESOLVED (November 15, 2026)

### HIGH RISK (Must fix before monetization)

1. **RSS news redistribution** — ToS violations
2. **Research reports without disclaimers** — Potential SEBI violation
3. **Financial health scoring system** — May require RA registration

### MEDIUM RISK (Should address)

1. **"Institutional analytics" claim** — Potentially misleading
2. **Market status language** — "Bullish/Bearish" terminology
3. **Data source attribution** — Missing on charts
4. **Cookie disclosure** — Required for localStorage

### LOW RISK (Minor improvements)

1. **Backtester disclaimers** — Add "simulation" labeling
2. **Export attributions** — Data source credit in exports
3. **Performance claims** — Add historical context

---

## PRIORITIZED REMEDIATION LIST

| # | Feature | Issue | Priority | Legal Source |
|---|---------|-------|----------|--------------|
| 1 | NSE Provider | Scraped data without license | CRITICAL | NSE ToS, SC Act |
| 2 | yfinance Provider | Commercial redistribution prohibited | CRITICAL | Yahoo ToS |
| 3 | Privacy Policy | Not published | CRITICAL | DPDP Act |
| 4 | Terms & Conditions | Not published | CRITICAL | CPA 2019 |
| 5 | Risk Disclosure | Not published | CRITICAL | SEBI IA Regs |
| 6 | RSS News | Redistribution violation | HIGH | Yahoo/Google ToS |
| 7 | Research Reports | Potential RA requirement | HIGH | SEBI RA Regs |
| 8 | Financial Scoring | Structured rating system | HIGH | SEBI RA Regs |
| 9 | Data Attribution | Missing on displays | MEDIUM | Copyright |
| 10 | Cookie Disclosure | Required for localStorage | MEDIUM | IT Act, DPDP |

---

*End of Feature Risk Matrix*