# Copyright and Third-Party Licenses Audit — MARA Stock Dashboard
**Audit Date:** November 7, 2026

---

## EXECUTIVE SUMMARY

**Status: POTENTIALLY NON-COMPLIANT**

Major risks identified:
1. **No attribution for NSE/BSE data** — Using scraped equity data without permission
2. **Yahoo Finance data redistribution** — Likely violates Terms of Service
3. **Missing license files** — No LICENSE or third-party license disclosures in distribution
4. **No trademark clearance** — Use of "NSE", "BSE", "NIFTY" in UI without authorization

---

## THIRD-PARTY DEPENDENCIES

### Python Backend Dependencies (`backend/requirements.txt`)

| Package | Version | License | Compliance Status |
|---------|---------|---------|-------------------|
| fastapi | >=0.110.0 | MIT | VERIFIED |
| uvicorn | >=0.28.0 | BSD-3-Clause | VERIFIED |
| pydantic | >=2.6.0 | MIT | VERIFIED |
| pandas | >=2.2.0 | BSD-3-Clause | VERIFIED |
| numpy | >=1.26.0 | BSD-3-Clause | VERIFIED |
| yfinance | >=0.2.38 | MIT | VERIFIED (but see note¹) |
| redis | >=5.0.3 | MIT | VERIFIED |
| httpx | >=0.27.0 | MIT | VERIFIED |
| python-multipart | (transitive) | BSD-3-Clause | VERIFIED |

### Frontend Dependencies (`frontend/package.json`)

**Note:** The frontend bundle is built with Vite and includes node_modules. The built `dist/` directory does NOT contain third-party license attributions.

---

## KEY ISSUES

### 1. YAHOO FINANCE / YFINANCE LIBRARY USAGE

**Issue:** Using yfinance for commercial data redistribution

**License Analysis:**
- yfinance is MIT licensed (covers the library code)
- **BUT** the DATA it provides is subject to Yahoo Finance Terms of Service

**Evidence from ToS (https://finance.yahoo.com/termsofservice):**
> Section 2(d): "You agree not to use any data, Content, or information... for any commercial purposes, including but not limited to any derivative works, aggregations, or compilations..."

**Application use:**
- `backend/adapters/market_data/yfinance_provider.py` fetches real-time quotes, historical data, dividends, splits
- Data is cached in Redis for distribution to multiple users
- `frontend/src/chart.js` renders TradingView charts with this data
- `backend/api/routes/research.py` provides RSS news aggregation

**Risk:** The MIT license covers the library code, NOT the data obtained through it. **Redistribution of yfinance-sourced data violates Yahoo ToS.**

---

### 2. NSE INDIA DATA USAGE

**Issue:** Scraping NSE India website without license

**Evidence:**
- `backend/adapters/market_data/nse_provider.py` lines 103-109 show browser-like headers
- Line 230-231: Direct API calls to `https://www.nseindia.com/api/quote-equity`
- No API key or commercial license obtained

**NSE Terms of Use Analysis:**
- NSE data is proprietary intellectual property
- Commercial use requires licensing agreement
- Scraping may violate anti-scraping provisions

**Risk:** Unauthorized data extraction and redistribution.

---

### 3. BSE INDIA DATA USAGE

**Evidence:**
- `backend/api/routes/research.py` line 64: BSE RSS feed URL used
- `backend/features/deep_research/service.py` includes `^BSESN` (BSE Sensex) symbol

**Risk:** RSS feed usage may require attribution and may have redistribution restrictions.

---

### 4. TradingView Charts

**Evidence:**
- `frontend/src/chart.js` imports and uses TradingView Lightweight Charts
- The chart renders candles, volume, indicators, and overlays

**License Status:**
- TradingView Lightweight Charts is MIT licensed
- Commercial use requires compliance with TradingView attribution requirements

**Risk:** Must display "Data provided by TradingView" or similar attribution.

---

### 5. Company Logos and Symbols

**Evidence:**
- `companies.csv` contains 2,368 NSE-listed company symbols
- No logo files present in codebase

**Analysis:**
- Stock symbols themselves are generally not trademarked
- Company names/logos are trademarked by their owners
- Using company names for identification purposes is generally permissible

**Risk:** Low, but should verify no logos displayed without permission.

---

### 6. NSE/BSE Trademarks

**Evidence search:**
```
grep -in "NSE\|BSE\|NIFTY\|SENSEX" frontend/src/*.js frontend/index.html
```

**Found references:**
- Market status indicators with "NSE", "BSE" labels
- Symbol names `^NSEI`, `^NSEBANK`, `^BSESN`
- UI text may reference "NIFTY" or "SENSEX"

**Risk:** Using "NIFTY", "SENSEX" in marketing text or certain UI contexts could be problematic.

**Recommended:** Use symbols only (`^NSEI`), not trademarked names in marketing copy.

---

## MISSING ITEMS

### 1. LICENSE File
- **Status:** NOT PRESENT in root or frontend/
- **Required:** At minimum, aggregate third-party license info

### 2. THIRD-PARTY-NOTICES File
- **Status:** NOT PRESENT
- **Required for commercial distribution**

### 3. Attribution in Frontend
- **Status:** MISSING
- **Required:** Credit for TradingView, data sources

---

## DATA SOURCE USAGE SUMMARY

| Source | Access Method | License Obtained | Risk |
|--------|---------------|------------------|------|
| Yahoo Finance API | Unofficial yfinance library | NO | CRITICAL |
| NSE India API | Direct scraping | NO | CRITICAL |
| BSE RSS | RSS endpoint | NO | HIGH |
| Google News RSS | RSS endpoint | NO | HIGH |
| TradingView Charts | MIT library | YES (code) | MEDIUM |
| Supabase Auth | SaaS service | YES | LOW |

---

## RECOMMENDATIONS

### Phase 1: Before Public Launch

1. **Add attribution footer to all pages:**
   ```
   Market data: Yahoo Finance (unofficial API). TradingView charts. 
   Disclaimer: Data for research purposes only. Not financial advice.
   ```

2. **Create LICENSE file** with:
   - Project copyright
   - Third-party license attributions (MIT, BSD)

3. **Create THIRD-PARTY-NOTICES file** aggregating all dependency licenses

4. **Remove or license NSE provider** — Replace with licensed Indian market data feed or use yfinance only

5. **Review TradingView attribution** — Add required trademark notices

### Phase 2: Before Monetization

1. **Obtain commercial data licenses** for market data from providers like:
   - Polygon.io (US market data)
   - Alpha Vantage (global equities with commercial license)
   - National stock exchange direct data feeds (for Indian markets)

2. **Consult trademark counsel** on NSE/BSE name usage

3. **Implement license tracking** for all third-party components

---

## LEGAL SOURCES REFERENCED

1. Yahoo Finance Terms of Service — https://finance.yahoo.com/termsofservice
2. TradingView Lightweight Charts License — MIT
3. NSE India IP Policies — https://www.nseindia.com/about/nse-data-sharing-policy
4. BSE India Terms — https://www.bseindia.com/
5. MIT License — https://opensource.org/licenses/MIT

---

*End of Copyright and Third-Party Licenses Audit*