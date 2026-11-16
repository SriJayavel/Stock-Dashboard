# MARA Stock Dashboard — Executive Compliance Summary
**Audit Date:** November 7, 2026
**Jurisdiction:** India

---

## KEY FINDINGS

### 1. Can MARA Launch in Current Configuration?

**Status: CONDITIONALLY - Requires remediation before public launch**

The application has significant gaps in legal infrastructure that must be addressed:

- **No Terms & Conditions, Privacy Policy, or Risk Disclosure pages** in the deployed application
- **No financial data source attribution or disclaimer** on charts or data displays
- **No SEBI disclaimer** for market research content
- **No cookie/tracking disclosure** in a data-collecting web application

---

### 2. Features With Potential SEBI Registration Implications

| Feature | Risk Level | Reason |
|---------|------------|--------|
| **Deep Research / V4 Intelligence** | MEDIUM-HIGH | Produces comparative analysis, peer benchmarking, valuation percentiles, "financial health scores," and structural observations. While marked as "research," the structured comparative analysis and scoring framework may trigger Research Analyst Regulations. |
| **Stock Screener** | MEDIUM | Multi-rule screening with AND/OR logic produces filtered investment ideas that could be construed as recommendations. |
| **Backtester** | LOW-MEDIUM | Simulates historical strategies only; clearly marked as simulation, not live advice. |
| **Alerts** | LOW | Price-based alerts are observation tools, not recommendations. |
| **Research Notebook** | LOW | User-owned content, no AI-generated advice. |
| **Correlation Matrix** | LOW | Pure mathematical computation, no interpretation. |
| **Sector Intelligence** | LOW-MEDIUM | Provides sector performance metrics that could be used for allocations. |

**NOTABLE: No AI Investment Advisor detected** — No OpenAI/Anthropic/Claude API calls found in codebase. The "GPT-taste design" in `award-winning-dashboard.js` is a visual design aesthetic, not AI functionality.

**⚠️ UNVERIFIED — LEGAL COUNSEL REQUIRED:** Applicability of SEBI RA/IA regulations to a single-user non-commercial tool is **unverified**. SEBI regulations assess **output nature** (scoring, benchmarking, valuation percentiles), not user count or revenue. A single-user tool producing "research reports" under Regulation 2(1)(q) may still trigger registration requirements. All SEBI conclusions marked `UNVERIFIED` pending counsel opinion.

---

### 3. Data Sources With Unresolved Licensing Issues

| Provider | Data Type | Rights | Risk |
|----------|-----------|--------|------|
| **yfinance** | Live quotes, history, fundamentals | Personal/non-commercial use explicitly | **HIGH** — Redistributing cached data commercially violates Yahoo ToS. Section 2(d) states: "You agree not to use any data, Content, or information accessible through Yahoo Finance... for any commercial purposes." |
| **NSE India** | Indian equities (via .NS/.BO) | Unverified | **CRITICAL** — No evidence of NSE Data Sharing Agreement. The `nse_provider.py` scrapes `nseindia.com` without API key, likely violating Terms of Use. |
| **BSE India** | RSS/news feeds | Unverified | **MEDIUM** — RSS endpoint used but redistribution rights unclear. |
| **Yahoo Finance RSS** | News | Personal use only | **HIGH** — Section 4.2 prohibits redistribution in "compiled or aggregated works." |
| **Google News RSS** | News aggregation | Personal use | **HIGH** — Similar ToS restrictions. |

**Evidence:** 
- `backend/adapters/market_data/yfinance_provider.py` (lines 10, 40-41, 50, 82-84, etc.) fetches data
- `backend/adapters/market_data/nse_provider.py` (lines 107-109, 230-231) directly calls NSE without documented permission
- `backend/api/routes/research.py` lines 61-65 shows RSS news fetching from Yahoo, Google, BSE

---

### 4. Current Disclaimers Are Inadequate

**Present:**
- Page footer: "Market data for research purposes" (line 112 of index.html)
- Report footer: "This document does not constitute investment advice" (line 12 of report_generator.js section)

**Missing (MANDATORY under Indian law):**
- Terms and Conditions
- Privacy Policy (Digital Personal Data Protection Act, 2023)
- Risk Disclosure
- Data Source Attribution
- Cookie Policy (if tracking/analytics present)
- Grievance Officer Contact
- Contact Information

### Remediation Applied (November 15, 2026)

The following were implemented as part of Phase 1 remediation:

| Item | Status | Location |
|------|--------|----------|
| Terms and Conditions | ✅ PUBLISHED | `frontend/public/legal/terms-and-conditions.html` + `.md` |
| Privacy Policy | ✅ PUBLISHED | `frontend/public/legal/privacy-policy.html` + `.md` |
| Risk Disclosure | ✅ PUBLISHED | `frontend/public/legal/risk-disclosure.html` + `.md` |
| Grievance Officer endpoint | ✅ PUBLISHED | `GET /legal/grievance` (backend/main.py) |
| Legal document links | ✅ ADDED | Footer of `frontend/index.html` |
| Data source attribution | ✅ ADDED | Footer of `frontend/index.html` + Telemetry Feed metric in `frontend/src/main.js` |
| Meta description | ✅ CORRECTED | `frontend/index.html` — removed "institutional analytics" claim |
| Report disclaimer | ✅ EXPANDED | `frontend/src/report_generator.js:212` — names data sources and links Risk Disclosure |
| Frontend build | ✅ REBUILT | `frontend/dist/` + `frontend/dist/legal/` |

**Remaining gaps:** Account deletion mechanism not yet implemented. NSE provider and yfinance licensing remain unresolved.

---

### 5. What Must Be Fixed Before Public Launch

| # | Issue | Priority | Legal Source | Status |
|---|-------|----------|--------------|--------|
| 1 | NSE access returns HTTP 403 — apply for NSE Data Seeking Request Form (nseri@nse.co.in) describing individual researcher, non-commercial, single-user, no redistribution, no advisory. Do not characterize 403 as legal proof. | CRITICAL | NSE Data Sharing Policy | **UNRESOLVED** — 403 is observed technical barrier, not legal conclusion |
| 2 | Remove commercial yfinance data redistribution; implement cache-only for personal use with clear disclaimer | CRITICAL | Yahoo Finance Terms of Service, Section 2(d) | **UNRESOLVED** (attribution added) |
| 3 | Publish Terms and Conditions page | HIGH | Consumer Protection Act, 2019 | ✅ DONE |
| 4 | Publish Privacy Policy with user data collection description | HIGH | DPDP Act, 2023 | ✅ DONE |
| 5 | Publish Risk Disclosure | HIGH | SEBI (Investment Advisers) Regulations, 2013 | ✅ DONE |
| 6 | Remove "Institutional analytics" claim without verification | MEDIUM | Misleading Advertising Guidelines | ✅ DONE (meta description) |
| 7 | Add data source attribution on all charts and data displays | MEDIUM | Copyright & Trademark laws | ✅ DONE (footer + telemetry metric) |
| 8 | Implement cookie disclosure (if any cookies used beyond essential) | MEDIUM | IT Act, 2000, DPDP Rules, 2025 | ✅ DONE (Privacy Policy §5) |

---

### 6. Changes Required Before Monetization

| Category | Required Action |
|----------|-----------------|
| **SEBI Registration** | If offering "premium research," "AI assistant," or paid recommendations, SEBI Research Analyst or Investment Adviser registration required before monetization. |
| **Licensing** | Commercial redistribution of market data requires separate licenses from NSE/BSE/Yahoo. |
| **Subscription Model** | Terms of Service Amendment for subscriptions, refund policy, cancellation rights required. |
| **Analytics/Tracking** | If implementing user analytics or advertising, additional privacy disclosures and cookie consent required. |

---

### 7. Items Requiring Qualified Indian Securities-Law Counsel

1. **NSE Data Usage Interpretation** — Whether the session-aware scraping constitutes unauthorized redistribution
2. **SEBI Research Analyst Applicability** — Whether "Deep Research" outputs constitute "research reports" under SEBI (Research Analysts) Regulations, 2014
3. **Yahoo Finance Commercial Use** — Whether caching and displaying data for multiple users violates ToS
4. **Data Processing Agreement** — For Supabase user authentication data handling under DPDP Act
5. **Risk Disclosure Adequacy** — Whether current disclosure format satisfies SEBI requirements

---

## ARCHITECTURE OVERVIEW (Evidence-Based)

**Public Features:**
- `/api/markets/overview` — Returns cached market indices (yfinance symbols: ^NSEI, ^GSPC, BTC-USD, etc.)
- `/api/stocks/batch` — Cache-only batch endpoint, returns `status: 'pending'` for misses
- `/api/search` — Symbol search
- `/api/screener` — Pre-defined universe screening
- Market candles for TradingView charts

**Authenticated Features:**
- Advanced research access
- Portfolio risk analytics
- Correlation matrix
- Custom screener queries
- Deep research with valuations

**Data Flow:**
```
User Request → Composite Provider Cache Check → (Cache HIT: Return) → (Cache MISS: NSE → yfinance) → Cache Store → Return
```

**Security Controls:**
- CORS restricted to explicit origins (localhost + production Vercel URLs)
- Dev mode bypass allows unauthenticated access in development
- Internal `/internal/refresh-cache` requires `X-Internal-Secret` header
- No rate limiting exposed to clients

### Supabase Environment Variable Classification

| Variable | Classification | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL` | Public configuration | Frontend build, Vercel environment |
| `VITE_SUPABASE_ANON_KEY` | Public configuration (publishable key) | Frontend build, Vercel environment |
| `SUPABASE_SERVICE_KEY` | **Secret** — service role credential | Backend only, never in frontend |
| `INTERNAL_REFRESH_SECRET` | **Secret** | Backend only, GitHub Actions secret |
| `REDIS_URL` | **Secret** | Backend only |

**Note:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public by design — the anon key is a publishable Supabase key that is safe to embed in client-side code and is dependent on correct Row-Level Security (RLS) policies. Only the `service_role` key and internal refresh secrets are backend-only credentials. The Supabase RLS policy (`mara_healthcheck()` RPC, `security invoker`, `grant execute to anon, authenticated`) ensures the anon key cannot access data beyond what RLS permits.

---

*Prepared for MARA Stock Dashboard compliance assessment. This is an evidence-based audit, not a legal certification.*