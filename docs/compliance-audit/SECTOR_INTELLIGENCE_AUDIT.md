# Sector Intelligence Audit — MARA Stock Dashboard
**Audit Date:** November 7, 2026
**Section:** SEBI Regulatory Analysis Addendum

---

## SECTOR INTELLIGENCE FEATURE ANALYSIS

### Feature Location
- `backend/features/deep_research/service.py` lines 520-623
- `backend/features/relationship_intelligence/service.py` lines 782-808

### What the Feature Outputs

1. **Sector Performance Percentages** (lines 587-593)
   - 24-hour performance for each sector
   - Advancing/Declining/unchanged counts
   - Breadth percentage (advancing/total)

2. **Constituent Analysis** (lines 596-616)
   - List of sector constituents
   - Individual constituent performance
   - Market cap weights

3. **Benchmark Comparison** (lines 100-105 in sector_intelligence)
   - Benchmark ETF association
   - Indian proxy index reference

### User-Facing Labels/Terms

**From `frontend/src/main.js` and related files:**
- "Sector Intelligence"
- "Performance 24h %"
- "Advancing", "Declining"
- "Breadth %"
- "Market Regime" (from deep_research line 930-948)

---

## SEBI REGULATORY ANALYSIS

### SEBI (Research Analysts) Regulations, 2014

**Definition of "Research Report" (Section 2(1)(q)):**
> "research report" means a written or electronic communication... containing an opinion or recommendation concerning securities, including but not limited to buy, sell or hold recommendations, buy, sell or hold opinions, target price, stock rating, relative valuation or any other recommendation...

**Analysis:**

1. **"Stock Rating" Concern:**
   - Sector intelligence provides **relative performance metrics** that could be interpreted as an implicit rating
   - "Advancing: 28, Declining: 4" suggests sector health
   - **Risk Level: MEDIUM**

2. **"Relative Valuation" Concern:**
   - Sector PE comparisons embedded in research dossiers
   - Peer median P/E displayed prominently
   - **Risk Level: MEDIUM**

3. **Target Price Implications:**
   - Sector performance % could be used to infer which sectors are performing well
   - Users might interpret positive performance as "buy" signal
   - **Risk Level: LOW**

---

### SEBI (Investment Advisers) Regulations, 2013

**Definition of Investment Advice (Section 2(v)):**
> "investment advice" means advice... as to the furnishing of any advice... relating to securities...

**Analysis:**

Sector intelligence does **NOT provide personalized recommendations** based on individual circumstances. It provides **benchmark/fact-based data** only.

**Risk Level: LOW** — Pure sector performance data, not personalized advice.

---

## CONSUMER PROTECTION ACT, 2019

### Misleading Claims Assessment

**Claim:** "Institutional analytics" (award-winning-dashboard.js line 20)

**Analysis:**
- Sector intelligence provides factual sector data
- NOT "institutional" in the sense of institutional-grade data feeds
- Could be considered misleading if users expect professional-grade data

**Risk Level: MEDIUM**

---

## CORRELATION MATRIX ANALYSIS

### Feature Location
- `backend/features/deep_research/service.py` lines 341-382
- `backend/api/routes/analytics.py` lines 18-28

### What it Outputs
- Pearson correlation coefficients
- Matrix visualization data
- Calculated via daily log returns

### Labels/Terms
- "Correlation 1Y", "Correlation 90D"
- "Strength: High/Medium/Low"
- "Direction: Positive/Negative"

### SEBI Analysis

Correlation data is **purely mathematical** and does not constitute advice unless interpreted with recommendation language.

**Risk Level: LOW**

---

## MACRO EXPLORER

### Feature Location
- `backend/features/relationship_intelligence/service.py` lines 361-415
- `backend/features/deep_research/service.py` lines 171-175

### What it Outputs
- Rolling correlation with macro factors (NIFTY, S&P 500, Gold, Oil, USD/INR)
- Factor sensitivity analysis

### Labels/Terms
- "Macro Explorer"
- "Correlation with NIFTY 50"
- "NASDAQ"

### SEBI Analysis

Similar to correlation matrix, this is **data for user interpretation**, not advice.

**Risk Level: LOW**

---

## PORTFOLIO RISK ANALYZER

### Feature Location
- `backend/features/deep_research/service.py` lines 384-454

### What it Outputs
- Portfolio volatility (annualized)
- Maximum drawdown
- Cumulative return
- Weights and symbols breakdown

### Labels/Terms
- "Max Drawdown"
- "Annualized Volatility"
- "CAGR"
- "Win Rate" (backtester)

### SEBI Analysis

Portfolio risk metrics are factual calculations based on user-provided weights. Not advice about what weights to use.

**Risk Level: LOW-MEDIUM** — Could lead to allocation decisions if users interpret max drawdown as "safe/unsafe"

---

## FINANCIAL HEALTH SCORE

### Feature Location
- `backend/features/deep_research/service.py` lines 456-518

### What it Outputs
- Score 0-100 scale
- Pillar breakdown: Revenue Growth, Net Income, Debt/Equity, Liquidity, Profitability, Market Cap
- Formula-based calculation

### Labels/Terms
- "Financial Health Score"
- Pillar names and descriptions
- Status: "High Quality", "Adequate", "Weak Conversion"

### SEBI Analysis

**HIGH RISK** — This is a **scoring system** that produces a composite rating.

- Under SEBI RA Regulations, "rating" is a defined term
- A 0-100 score with pillar breakdown is a **classification system** that could influence investment decisions
- The "status" labels (High Quality, etc.) are explicit rating language

**Recommendation:** Add disclaimer: "This score is an analytical metric, not a recommendation. Do not base investment decisions solely on this score."

**Risk Level: HIGH**

---

## RISK MATRIX SUMMARY

| Feature | Output Type | Rating Language? | Personalization | SEBI Risk |
|---------|-------------|------------------|-----------------|-----------|
| Sector Intelligence | Sector performance | Implicit ("Advancing") | No | MEDIUM |
| Correlation Matrix | Raw data | No | No | LOW |
| Macro Explorer | Correlation data | No | No | LOW |
| Portfolio Risk | Risk metrics | "Max Drawdown" | User input | MEDIUM |
| Financial Health Score | 0-100 score + rating | YES (High Quality, etc.) | No | HIGH |

---

## RECOMMENDATIONS

1. **Financial Health Score:** Add clear disclaimer that this is analytical, not a rating system
2. **Sector Intelligence:** Avoid terms like "performance leader" or "weak sector"
3. **Portfolio Risk:** Add "this is not investment advice" banner
4. **Correlation:** Ensure visualizations don't show directional arrows

---

*End of Sector Intelligence Audit*