# Business Model Reclassification — MARA Stock Dashboard

**Date:** November 15, 2026
**Scope:** Reassessment of prior compliance audit under the single-user personal-use model
**Classification:** VERIFIED / POTENTIALLY NON-COMPLIANT / UNVERIFIED / NOT APPLICABLE

---

## 1. Prior Audit Assumption

The original compliance audit (November 7, 2026) assessed MARA as a **public-facing financial platform** with:
- External customer base
- Potential monetization
- Commercial data redistribution
- Multi-user authentication

## 2. Actual Business Model (Revised)

| Characteristic | Prior Assumption | Actual |
|---|---|---|
| Users | Multi-user / customers | **Single user** |
| Commercialization | Potential subscriptions | **None** |
| Data redistribution | Public API exposure | **Private instance only** |
| Purpose | Commercial product | **Personal research + portfolio** |
| Hosting | Public Vercel | **Private instance + portfolio demo** |
| Advisory | Potential | **None intended** |
| Trade execution | Potential | **None** |

## 3. Classification of Findings

### STILL APPLICABLE

| Finding | Reason |
|---|---|
| NSE data scraping | Contractual/ToS restrictions apply regardless of user count |
| yfinance data usage | Yahoo ToS Section 2(d) applies to any user |
| RSS news redistribution | Provider ToS restrictions are user-count agnostic |
| SEBI regulatory analysis | Must be assessed on functionality, not commercial status |
| Privacy obligations | Personal data is still collected and stored |
| Security obligations | API keys and backend exposure remain risks |
| Data attribution | Copyright obligations remain |

### NO LONGER APPLICABLE

| Prior Finding | Reason |
|---|---|
| Subscription T&C required | No subscriptions exist |
| Refund policy required | No payments collected |
| Cancellation rights | No paid plans |
| Customer onboarding | No customers |
| Customer grievance processes | No customers |
| Account deletion mechanism | No multi-user account system in active use |
| Commercial data licensing | Not purchasing licenses for personal use |
| Affiliate disclosure | No affiliates |
| Cookie consent banner | No tracking/analytics deployed |

### REQUIRES VERIFICATION (previously "NO LONGER APPLICABLE" — corrected)

| Prior Finding | Reason |
|---|---|
| SEBI Research Analyst registration | **UNVERIFIED** — SEBI assesses output nature (scoring, benchmarking), not commercial status. Single-user tool may still trigger Regulation 2(1)(q). |
| SEBI Investment Adviser registration | **UNVERIFIED** — "Investment advice" defined by functionality, not revenue. |
| DPDP consent for non-essential data | **UNVERIFIED** — Personal/domestic exemption (Section 3(c)) untested for publicly deployed web apps. Counsel required. |

### REQUIRES VERIFICATION

| Finding | Reason |
|---|---|
| Grievance mechanism | Implemented (`/legal/grievance` endpoint); contact email updated to dpo@mara-financial.com |
| Data retention schedule | Not yet defined — required before commercialization |
| Vercel public deployment | Depends on what the public instance exposes (demo vs. live) |
| Supabase auth necessity | Required for private instance; demo mode works without |
| CERT-In obligations | Depends on entity type and data volumes |
| SEBI RA/IA applicability | **UNVERIFIED** — Assessed on functionality, not commercial status |
| DPDP personal/domestic exemption | **UNVERIFIED** — Section 3(c) untested for public web apps; DPDP Rules 2025 commencement pending |

## 4. Key Distinctions

**A. Commercial vs. Personal:** Single-user status removes commercial compliance obligations but does **not** remove contractual data-usage restrictions.

**B. Account deletion:** Not required — the application has no user-account system serving multiple users. The single user controls their own data.

**C. Grievance mechanisms:** Not automatically required for a personal tool, but must be evaluated against actual data processing.

**D. Privacy obligations:** Still apply. Personal data (email, watchlist, notes) is collected and stored.

**E. Market-data licensing:** Still applies. Contractual terms bind all users, not just commercial ones.

**F. SEBI applicability:** Assessed on functionality, not commercial status. A single user can still trigger regulatory definitions.

## 5. Classification Summary

| Category | Count |
|---|---|
| STILL APPLICABLE | 7 |
| NO LONGER APPLICABLE | 9 |
| REQUIRES VERIFICATION | 8 |

**Bottom line:** The single-user model reduces commercial compliance burden, but **does not exempt** from SEBI RA/IA assessment (functionality-based) or DPDP obligations (public deployment untested). Contractual data-usage restrictions (NSE, Yahoo, RSS) remain fully applicable. Three items moved from "No Longer Applicable" to "Requires Verification" pending legal counsel.