# ADR 003: Epistemological Contract & Zero Speculative Valuation Claims

## Status
Accepted

## Context
Under Indian financial regulations (Securities and Exchange Board of India — SEBI Research Analysts Regulations, 2014 and Investment Advisers Regulations, 2013), platforms providing price targets, buy/sell calls, or subjective assertions such as "undervalued" / "overvalued" can be categorized as regulated Research Analysts (RA) or Investment Advisers (IA), requiring mandatory registration, net worth thresholds, and compliance audits.

## Decision
Establish a strict **Epistemological Contract** across all data pipelines and user interfaces:
$$\text{Source Data} \longrightarrow \text{Calculated Metrics} \longrightarrow \text{Attributed Context} \longrightarrow \text{Interpretation}$$

1. **Strictly Factual & Mathematical:**
   - Every metric displayed must cite its exact factual source (audited corporate balance sheets, exchange quote feeds).
   - Technical indicators (RSI, MACD, Bollinger Bands) are purely deterministic mathematical transformations.
2. **Distribution Percentiles Over Subjective Labels:**
   - The platform never asserts whether a stock is "cheap" or "expensive".
   - Valuation multiples (P/E, P/B, EV/EBITDA) are plotted against their empirical 3-year and 5-year historical distributions (e.g., *"P/E is currently at the 82nd percentile of its 5-year range"*).
3. **Transparent Methodology:**
   - The Financial Health Score (0–100) exposes its exact arithmetic formula across Solvency, Liquidity, Profitability, and Efficiency components.

## Consequences
- **Positive:**
  - Legally defensible posture as an educational/informational research terminal.
  - Transparent, institutional-grade analytics that treat users like quantitative researchers rather than retail advice-seekers.
- **Negative:**
  - Users looking for speculative "buy/sell tips" will not find algorithmic recommendations.
