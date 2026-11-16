# Legal Remediation Roadmap — MARA Stock Dashboard
**Audit Date:** November 7, 2026

---

## PHASE 1: BEFORE PUBLIC LAUNCH

### Mandatory Issues

| # | Issue | Evidence | Affected File/Feature | Legal Source | Required Change | Legal Counsel Needed | Status |
|---|-------|----------|----------------------|--------------|-----------------|---------------------|--------|
| 1 | **No Privacy Policy** | No `/privacy`, `/privacy-policy`, or equivalent page found | Frontend (index.html, routes) | Digital Personal Data Protection Act, 2023, Section 3(1)(b) | Create and publish comprehensive Privacy Policy page at `/privacy` | YES | ✅ DONE |
| 2 | **No Terms and Conditions** | No `/terms` or `/terms-and-conditions` page found | Frontend | Consumer Protection Act, 2019, Section 14 | Create and publish Terms of Use page | YES | ✅ DONE |
| 3 | **No Risk Disclosure** | Only footer text: "Market data for research purposes" | Frontend index.html line 112 | SEBI (Investment Advisers) Regulations, 2013, Reg 8 | Add comprehensive Risk Disclosure document | YES | ✅ DONE |
| 4 | **NSE data scraping** | `backend/adapters/market_data/nse_provider.py` lines 103-109, 230-231 | NSE Provider | NSE Data Sharing Policy, SC&A Regulations | Options: (a) Obtain NSE license, (b) Remove NSE provider, use yfinance fallback only | YES | **UNRESOLVED** |
| 5 | **yfinance commercial redistribution** | `backend/adapters/market_data/yfinance_provider.py` uses yfinance for real-time data and caches in Redis | YFinance Provider | Yahoo Finance Terms of Service, Section 2(d) | Options: (a) Use only for personal use with rate limits, (b) Obtain commercial license, (c) Add clear disclaimer about data source | YES | **UNRESOLVED** (disclaimer added) |
| 6 | **No data source attribution** | Charts display data without credit to Yahoo Finance | `frontend/src/chart.js`, `frontend/src/main.js` | Copyright law | Add "Data: Yahoo Finance" attribution on all charts and telemetry | NO | ✅ DONE |
| 7 | **Cookie disclosure missing** | localStorage used for watchlist, notes, alerts; no cookie policy | `frontend/src/*` | IT Act 2000, DPDP Rules 2025 | Add Cookie/Storage Disclosure in Privacy Policy §5 | NO | ✅ DONE |
| 8 | **Guest mode exposes full market data** | `frontend/src/auth.js` lines 115-122 | Auth system | No regulatory violation, but privacy risk | Add notice that guest data is not persisted | NO | **UNRESOLVED** |

---

## PHASE 2: BEFORE MONETIZATION

### Subscription/Paid Services Issues

| # | Issue | Affected Files | Legal Source | Required Change | Legal Counsel Needed |
|---|-------|----------------|--------------|-----------------|---------------------|
| 9 | **Subscription T&C** | "Start Free Trial" CTA in `frontend/src/components/AwardWinningDashboard.jsx` | Consumer Protection (E-Commerce) Rules, 2020, Regulation 4 | Create Subscription Terms with refund/cancellation policy | YES |
| 10 | **Refund Policy** | Not present | CPA, 2019, Section 2(1)(r) | Publish refund policy for paid plans | YES |
| 11 | **Cancellation Rights** | Not defined | CPA, 2019, Section 14(4) | Define clear cancellation process | YES |
| 12 | **Research Analyst Registration** | Deep Research, V4 Intelligence produce scoring/benchmarking | SEBI (Research Analysts) Regulations, 2014 | For commercial distribution: Apply for RA registration or disable scoring for non-premium users | YES |
| 13 | **Investment Advisory Registration** | Financial health score, peer comparison may imply advice | SEBI (Investment Advisers) Regulations, 2013 | If any feature is presented as advice, IA registration required | YES |
| 14 | **Affiliate Disclosure** | Potential broker partnerships | SEBI Circular on Finfluencer Marketing | Disclose any affiliate relationships with brokers | IF APPLICABLE |
| 15 | **Performance Claims Verification** | "Institutional analytics", "predictive modeling" | ASCI Guidelines, Misleading Advertising | Verify or remove all performance claims; add "not guaranteed" language | NO (but legal review recommended) |
| 16 | **Professional Services T&C** | Institutional report generator | Consumer Protection Act | If selling "institutional" reports, need clear service terms | YES |
| 17 | **Newsletter/Email** | User email collected | DPDP Act, 2023 | Email marketing needs separate consent; CAN-SPAM compliance | YES (if email marketing added) |

---

## PHASE 3: LONG-TERM COMPLIANCE

### Ongoing Requirements

| # | Issue | Legal Source | Action | Timeline |
|---|-------|--------------|--------|----------|
| 18 | **Data Processing Agreement with Supabase** | DPDP Act, 2023 | Execute DPA with Supabase for GDPR/DPDP compliance | 3 months |
| 19 | **Regular Security Audits** | CERT-In Directions | Quarterly vulnerability scans, annual penetration test | Ongoing |
| 20 | **Incident Response Plan** | CERT-In Notification Rules | Create and test IR plan; appoint Incident Manager | 6 months |
| 21 | **Data Retention Policy** | DPDP Act, 2023, Section 3(2) | Define retention periods for all data categories | 3 months |
| 22 | **Grievance Officer Designation** | DPDP Act, 2023, Section 12 | Appoint and publish grievance officer contact | Before public launch |
| 23 | **User Rights Portal** | DPDP Act, 2023 | Implement user access, correction, deletion mechanisms | 6 months |
| 24 | **Cookie Consent Banner** | IT Act, DPDP Rules | Add cookie consent if tracking added later | As needed |
| 25 | **SEBI Registration Renewal** | SEBI regulations | Annual compliance review and renewal | Annually |

---

## Supabase Environment Variable Classification

| Variable | Classification | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL` | Public configuration | Frontend build, Vercel environment |
| `VITE_SUPABASE_ANON_KEY` | Public configuration (publishable key) | Frontend build, Vercel environment |
| `SUPABASE_SERVICE_KEY` | **Secret** — service role credential | Backend only, never in frontend |
| `INTERNAL_REFRESH_SECRET` | **Secret** | Backend only, GitHub Actions secret |
| `REDIS_URL` | **Secret** | Backend only |

**Note:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public by design — the anon key is a publishable Supabase key that is safe to embed in client-side code and is dependent on correct Row-Level Security (RLS) policies. Only the `service_role` key and internal refresh secrets are backend-only credentials. The Supabase RLS policy (`mara_healthcheck()` RPC, `security invoker`, `grant execute to anon, authenticated`) ensures the anon key cannot access data beyond what RLS permits.

---

## DETAILED REMEDIATION PLANS

### Plan 1: Remove/Replace NSE Provider (CRITICAL)

**Option A: Remove NSE Provider**
```
1. Set NSEProvider._available = False in config
2. Update composite_provider to skip NSE for .NS/.BO symbols
3. Rely on yfinance for all Indian equities
4. Add notice: "Indian equity data via Yahoo Finance"
```

**Option B: Obtain NSE License**
```
1. Contact NSE Data Solutions team
2. Request commercial data sharing agreement
3. Obtain API key and documentation
4. Implement NSE API client (replace nse_provider.py)
5. Update licensing documentation
```

**Timeline:** 2-4 weeks (Option A), 2-3 months (Option B)

**Cost:** INR 0 (Option A), INR 50,000-5,00,000+ (Option B, depends on volume and license type)

---

### Plan 2: Remove Commercial yfinance Use (CRITICAL)

**Immediate Actions:**
1. Reduce cache TTL to reasonable limits (current: 60s for quotes)
2. Implement rate limiting per user/IP
3. Add prominent disclaimer: "Data provided by Yahoo Finance. Not for commercial redistribution."

**Long-term Actions:**
1. Evaluate commercial data providers:
   - Polygon.io ($19+/month for US data)
   - Alpha Vantage (free tier limited, paid for commercial)
   - Twelve Data (Indian market coverage)
2. Migrate to licensed provider
3. Update terms to reflect data provider

**Timeline:** 2 weeks immediate, 3 months for migration

---

### Plan 3: Publish Legal Documents

**Privacy Policy Requirements (DPDP Act, 2023):**
1. Identity of data fiduciary (need to establish)
2. Contact details for grievance officer
3. Categories of personal data collected
4. Purposes of processing
5. Legal basis for processing
6. Third-party recipients (Supabase)
7. International transfers (Supabase in US/EU)
8. Data retention periods
9. User rights (access, correction, deletion)
10. Grievance redressal mechanism

**Terms of Use Requirements:**
1. Services provided
2. User obligations
3. Intellectual property rights
4. Disclaimer of advice
5. Limitation of liability
6. Termination clauses
7. Governing law (India)
8. Dispute resolution

**Risk Disclosure Requirements:**
1. Market risks explanation
2. No guarantee of returns
3. Past performance disclaimer
4. Data accuracy limitations
5. Trading risks
6. Technology risks
7. Third-party data risks

**Timeline:** 4 weeks

**Legal Counsel:** HIGHLY RECOMMENDED

---

### Plan 4: SEBI Registration (IF MONETIZING RESEARCH)

**Research Analyst Registration Path:**
1. **Prerequisites:**
   - Minimum net worth: INR 50 lakhs
   - Professional tax clearance
   - Good character certificate

2. **Application Process:**
   - Form RA-1 filled and submitted
   - Fee: INR 50,000
   - Documents: Audited financials, proofs of net worth

3. **Ongoing Requirements:**
   - Annual fees
   - Quarterly reports
   - Code of conduct adherence

**Investment Adviser Registration Path:**
1. **Prerequisites:**
   - Minimum net worth: INR 5 crores
   - NISM Series VI certification
   - Past experience verification

2. **Timeline:** 6-12 months

**Recommendation:** For non-monetized research output, add strong disclaimers. For paid features, register as RA.

---

## RESOURCE ALLOCATION

| Phase | Effort | Cost Estimate | Key Personnel |
|-------|--------|---------------|---------------|
| Phase 1 | 16-24 hours | INR 50,000-1,00,000 | Legal counsel (10h), Developer (8-12h), Product manager (4-6h) |
| Phase 2 | 40-80 hours | INR 2,00,000-5,00,000 | Legal counsel (20-30h), Developer (15-20h) |
| Phase 3 | Ongoing | INR 1,00,000+/year | Legal counsel (annually), Security consultant, Compliance officer |

---

## DECISION TREE

```
Is the product being launched publicly?
├── NO → Proceed without Phase 1 fixes, but fix before public launch
└── YES → Fix Phase 1 issues BEFORE launch
    │
    Is the product monetized (subscriptions/paid features)?
    ├── NO → Add disclaimers, no SEBI registration needed
    └── YES → 
        Are research reports or scoring sold?
        ├── YES → Research Analyst registration required
        └── NO → 
            Is investment advice provided?
            ├── YES → Investment Adviser registration required
            └── NO → Subscription T&C and refund policy required
```

---

## SIGN-OFF ITEMS BEFORE LAUNCH

- [x] Privacy Policy published and linked in footer
- [x] Terms and Conditions published and linked
- [x] Risk Disclosure page created and linked
- [x] Grievance Officer endpoint published (`GET /legal/grievance`)
- [x] Data source attribution on charts and telemetry
- [x] Cookie/storage disclosure in privacy policy
- [ ] RSS news feeds removed or licensed
- [ ] NSE provider disabled OR licensed
- [ ] yfinance usage documented with disclaimer
- [x] "Not financial advice" disclaimer prominent

### Remediation Record (November 15, 2026)

| Item | File | Change |
|------|------|--------|
| Privacy Policy | `frontend/public/legal/privacy-policy.md` | New document — DPDP Act-compliant notice, data inventory, Supabase processor disclosure, user rights, grievance mechanism |
| Terms & Conditions | `frontend/public/legal/terms-and-conditions.md` | New document — no-advice clause, acceptable use, IP, limitation of liability, governing law |
| Risk Disclosure | `frontend/public/legal/risk-disclosure.md` | New document — trading risk, no-guarantee, data accuracy, technology risk, no-regulatory-approval statement |
| Legal footer links | `frontend/index.html` | Added Terms / Privacy / Risk Disclosure links and data-source attribution footer |
| Meta description | `frontend/index.html` | Corrected "institutional analytics" claim to informational description |
| Report disclaimer | `frontend/src/report_generator.js:212` | Expanded to name Yahoo Finance / NSE data sources and link the Risk Disclosure |
| Telemetry attribution | `frontend/src/main.js` | Telemetry Feed metric now labels Yahoo Finance data and TradingView chart source |

---

## LEGAL COUNSEL RECOMMENDATIONS

Engage an Indian securities lawyer with experience in:
1. SEBI compliance
2. Digital Personal Data Protection Act
3. Consumer Protection Act
4. Financial technology products

**Recommended firms:**
- Amarchand & Associates
- Cyril Amarchand Mangaldas
- Nashik Doshi & Co.
- Independent fintech compliance consultants

---

*End of Legal Remediation Roadmap*