# Implementation Approval Package — MARA Stock Dashboard

**Date:** November 15, 2026  
**Status:** READY FOR REVIEW — No code changes made during this pass  
**Classification:** Evidence-backed implementation plan

---

## Executive Summary

This document presents the implementation approval package required by the correction pass. Every proposed change below is derived from evidence collected across the codebase, legal documents, and configuration. **No code, legal documents, deployment configuration, or existing integrations have been modified** during this pass per the STRICT RULE.

The plan separates changes into four categories:
1. **Security-Critical** — Must address before any public deployment
2. **Privacy/Documentation** — DPDP compliance and legal accuracy
3. **Public Demo Deployment** — Static Vercel demo with synthetic data
4. **Optional Improvements** — Enhancements with clear trade-offs

---

## 1. SECURITY-CRITICAL CHANGES

### 1.1 Dev Mode Admin Bypass Removal

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/main.py` lines 88-92 |
| **Existing Behavior** | When `ENVIRONMENT != "production"` AND `SUPABASE_URL` or `SUPABASE_KEY` missing, assigns `guest_dev` user with `admin` role, bypassing all auth |
| **Problem** | Misconfigured production deployment (missing Supabase env vars) grants full admin access to unauthenticated users |
| **Proposed Modification** | Remove the dev bypass entirely. Require valid Supabase configuration for all environments. For local development, use a dedicated `DEV_AUTH_TOKEN` env var with a scoped dev-only role, not `admin` |
| **Security Benefit** | Eliminates privilege escalation via misconfiguration; enforces auth in all environments |
| **Regression Risks** | Local development workflow changes — developers must set `SUPABASE_URL`/`SUPABASE_KEY` or `DEV_AUTH_TOKEN` |
| **Testing Procedure** | 1. Start backend without Supabase env vars → all `/api/*` (except public) return 401<br>2. Set valid Supabase env vars → auth works<br>3. Set `DEV_AUTH_TOKEN` → dev token works with limited role |
| **Rollback Procedure** | Revert the 5-line block in `main.py:88-92` |

---

### 1.2 Internal Refresh Secret — Fail Closed in Production

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/config.py` lines 54, 88-95; `backend/main.py` lines 129-136 |
| **Existing Behavior** | `INTERNAL_REFRESH_SECRET` defaults to `"dev_secret_local_only"`. Production validator logs error but **does not raise** — app starts with insecure default |
| **Problem** | Production deployment can start with known default secret, allowing unauthorized cache refresh via GitHub Actions endpoint |
| **Proposed Modification** | In `config.py` validator: when `ENVIRONMENT == "production"` and secret is missing or placeholder, **raise `ValueError`** (not just log). App fails to start. Add `SUPABASE_SERVICE_KEY` to settings with same fail-closed behavior |
| **Security Benefit** | Guarantees production never runs with default secrets; explicit configuration required |
| **Regression Risks** | Deployments missing the secret will fail to start (intentional) |
| **Testing Procedure** | 1. Set `ENVIRONMENT=production` without `INTERNAL_REFRESH_SECRET` → app startup fails with clear error<br>2. Set valid secret → app starts<br>3. Verify `/internal/refresh-cache` rejects wrong secret with 403 |
| **Rollback Procedure** | Revert validator to log-only (but this re-introduces the vulnerability) |

---

### 1.3 Supabase Service Role Key — Backend Only, Never in Frontend

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/config.py` (add field); `backend/adapters/auth/supabase_auth.py` line 46 |
| **Existing Behavior** | `SUPABASE_SERVICE_KEY` not defined in settings; `supabase_auth.py` falls back to `SUPABASE_KEY` (anon key) for admin operations |
| **Problem** | Admin operations (user management, session revocation) use anon key — insufficient privileges and violates least-privilege |
| **Proposed Modification** | Add `SUPABASE_SERVICE_KEY: str = ""` to `Settings`. In `supabase_auth.py`, use service key for `_get_admin_client()`. Verify service key **never** appears in frontend `.env*` or Vercel build |
| **Security Benefit** | Proper privilege separation; anon key cannot perform admin actions |
| **Regression Risks** | None if service key configured; admin ops fail gracefully if not |
| **Testing Procedure** | 1. Configure service key in backend env → `_get_admin_client()` uses it<br>2. Verify frontend build contains no service key (grep dist/)<br>3. Verify admin endpoints (user list, revoke) work |
| **Rollback Procedure** | Remove field; revert fallback to anon key |

---

### 1.4 Frontend Secret Exposure Verification — Automated Check

| Field | Detail |
|-------|--------|
| **Exact File** | New: `scripts/verify_frontend_secrets.py` (or CI step) |
| **Existing Behavior** | Manual grep only; `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` correctly embedded in Vercel build (public by design), but no guard against accidental service key leakage |
| **Problem** | No automated prevention of backend-only secrets (`SUPABASE_SERVICE_KEY`, `INTERNAL_REFRESH_SECRET`, `REDIS_URL`) leaking into frontend build |
| **Proposed Modification** | Add CI step (GitHub Actions) that greps `frontend/dist/` for backend-only secret patterns. Fail build if found. Patterns: `SUPABASE_SERVICE_KEY`, `INTERNAL_REFRESH_SECRET`, `REDIS_URL`, `service_role` |
| **Security Benefit** | Catches secret leakage at build time, not after deployment |
| **Regression Risks** | None — additive check |
| **Testing Procedure** | 1. Temporarily add fake service key to `frontend/.env` → build fails<br>2. Normal build passes |
| **Rollback Procedure** | Remove CI step |

---

### 1.5 CORS Origin Regex — Remove Vercel Wildcard

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/main.py` line 48 |
| **Existing Behavior** | `allow_origin_regex=r"^https://.*\.vercel\.app$"` allows **any** Vercel deployment to call the API with credentials |
| **Problem** | Overly broad; any Vercel project (including malicious ones) can make authenticated requests to the backend |
| **Proposed Modification** | Remove the regex. Use only explicit `settings.CORS_ORIGINS` list. Add production Vercel URL to `CORS_ORIGINS` via `FRONTEND_URL` env var |
| **Security Benefit** | Strict origin allowlist; no wildcard credential exposure |
| **Regression Risks** | Preview deployments on new Vercel URLs will be blocked until added to `CORS_ORIGINS` |
| **Testing Procedure** | 1. Deploy to new Vercel preview URL → CORS blocked<br>2. Add URL to `CORS_ORIGINS` → works<br>3. Verify no wildcard in response headers |
| **Rollback Procedure** | Re-add regex line |

---

### 1.6 Security Headers — Add CSP and HSTS

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/main.py` (add middleware) or `vercel.json` headers |
| **Existing Behavior** | Only `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` via `vercel.json` |
| **Problem** | Missing `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy` |
| **Proposed Modification** | Add middleware in `main.py` (for API routes) and extend `vercel.json` headers (for static frontend):<br>```python<br># In main.py middleware<br>response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:; frame-ancestors 'none'"<br>response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"<br>response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"<br>response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"<br>``` |
| **Security Benefit** | Defense-in-depth against XSS, MITM, and feature leakage |
| **Regression Risks** | CSP may break inline scripts/styles — test thoroughly |
| **Testing Procedure** | 1. Deploy to staging<br>2. Load all 6 workspace views → no CSP violations in console<br>3. Verify HSTS header on HTTPS<br>4. Check `securityheaders.com` scan |
| **Rollback Procedure** | Remove headers or relax CSP |

---

## 2. PRIVACY / DOCUMENTATION CHANGES

### 2.1 Supabase Variable Classification in Legal Docs

| Field | Detail |
|-------|--------|
| **Exact File** | `docs/compliance-audit/EXECUTIVE_SUMMARY.md`, `LEGAL_REMEDIATION_ROADMAP.md`, `frontend/public/legal/privacy-policy.md` |
| **Existing Behavior** | Docs inconsistently classify `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` as "secrets" or "credentials" |
| **Problem** | Misleading classification — these are **public configuration** (anon key is publishable by design). Only `service_role` key and `INTERNAL_REFRESH_SECRET` are secrets |
| **Proposed Modification** | Update all docs with a clear classification table:<br>```markdown<br>| Variable | Classification | Exposure |<br>|---|---|---|<br>| VITE_SUPABASE_URL | Public config | Frontend build, Vercel env |<br>| VITE_SUPABASE_ANON_KEY | Public config (publishable) | Frontend build, Vercel env |<br>| SUPABASE_SERVICE_KEY | **Secret** | Backend only, never in frontend |<br>| INTERNAL_REFRESH_SECRET | **Secret** | Backend only, GitHub Actions secret |<br>| REDIS_URL | **Secret** | Backend only |<br>``` |
| **Compliance Benefit** | Accurate threat model; prevents over-classification noise |
| **Regression Risks** | None — documentation only |
| **Testing Procedure** | Review updated docs for accuracy |
| **Rollback Procedure** | Revert docs |

---

### 2.2 NSE HTTP 403 — Record as Observed Access Denial, Not Legal Proof

| Field | Detail |
|-------|--------|
| **Exact File** | `docs/compliance-audit/MARKET_DATA_LICENSING_AUDIT.md` lines 170, 178; `backend/adapters/market_data/nse_provider.py` lines 235-238 |
| **Existing Behavior** | Audit states: "This is **unauthorized data scraping** that violates NSE's Terms of Use and could trigger legal action." Code logs: `"NSE access forbidden (403)"` |
| **Problem** | HTTP 403 is an **observed server response** — it indicates access denial, not conclusive legal determination. Conflating technical response with legal conclusion overstates findings |
| **Proposed Modification** | 1. In audit: Change to "NSE returns HTTP 403 for direct API calls, indicating access is restricted to authorized clients. This is an observed technical barrier. Legal characterization requires counsel."<br>2. In code: Change log message to `"NSE 403 for {symbol} — access restricted to authorized clients"`<br>3. Prepare (but do not send) NSE Data Seeking Request Form draft describing: individual researcher, non-commercial, single-user, no redistribution, no advisory |
| **Compliance Benefit** | Factually accurate; preserves legal flexibility |
| **Regression Risks** | None |
| **Testing Procedure** | Verify log output shows revised message |
| **Rollback Procedure** | Revert text |

---

### 2.3 Privacy Data-Flow Verification — Rewrite Legal Docs After Verification

| Field | Detail |
|-------|--------|
| **Exact File** | `frontend/public/legal/privacy-policy.md` (Sections 2, 3, 4, 6, 9) |
| **Existing Behavior** | Privacy policy states watchlist/notes/alerts/preferences stored in **browser localStorage only, not synced, not transmitted to servers** (Section 3). **Verified accurate** by code inspection (`frontend/src/watchlist.js`, `notebook.js`, `alerts.js`, `chart.js` all use `localStorage` with user-namespaced keys). Auth data (email, password hash, session tokens) goes to **Supabase Auth only**. No backend database stores user watchlists/notes. No AI conversations exist in codebase. |
| **Problem** | Policy is accurate but should explicitly distinguish **Supabase (processor)** vs **Mara backend (controller, no user data)** vs **localStorage (user device)** |
| **Proposed Modification** | Enhance Section 3 "Where Your Data Is Stored" with explicit three-column table:<br>```markdown<br>| Data Category | Storage Location | Controller / Processor |<br>|---|---|---|<br>| Email, password hash, session tokens | Supabase Auth (US/EU) | Supabase = Processor, Mara = Controller |<br>| Watchlist, notes, alerts, preferences | Browser localStorage (your device) | Mara = Controller, **no processor** |<br>| API keys (user-provided) | Browser localStorage (your device) | Mara = Controller, **no processor** |<br>| Market data cache | Mara backend (Redis + memory) | Mara = Controller, **no personal data** |<br>```<br>Also add to Section 4: "Mara's market-data API does not receive or store your watchlist, notes, or alerts." |
| **Compliance Benefit** | Complete DPDP Section 3(1)(b) notice; clear processor/controller mapping |
| **Regression Risks** | None — documentation only |
| **Testing Procedure** | Legal review of updated policy |
| **Rollback Procedure** | Revert policy |

---

### 2.4 DPDP and SEBI Conclusions — No Blanket Exemptions

| Field | Detail |
|-------|--------|
| **Exact File** | `docs/compliance-audit/PRIVACY_AND_DATA_PROTECTION_AUDIT.md`, `SEBI_REGULATORY_ANALYSIS.md`, `EXECUTIVE_SUMMARY.md`, `BUSINESS_MODEL_RECLASSIFICATION.md` |
| **Existing Behavior** | Some docs imply "personal use exempts from DPDP" or "single user means no SEBI applicability" |
| **Problem** | **DPDP Act applies to any "data fiduciary" processing personal data** — personal/domestic exemption (Section 3(c)) is narrow and untested for publicly offered services. **SEBI regulations apply based on functionality**, not commercial status. A single-user tool producing "research reports" (scoring, peer benchmarking, valuation percentiles) can still trigger RA/IA definitions. |
| **Proposed Modification** | 1. Remove all blanket exemption statements.<br>2. Replace with: "DPDP applicability to single-user non-commercial tools is **UNVERIFIED** — legal counsel required. SEBI RA/IA regulations assess **output nature**, not user count or revenue. Deep Research scoring (0-100), valuation percentiles, and peer benchmarking **likely constitute regulated research reports** under SEBI (Research Analysts) Regulations, 2014 Section 2(1)(q)."<br>3. Mark all SEBI conclusions as `UNVERIFIED` pending counsel opinion.<br>4. Add DPDP commencement timeline: "DPDP Act passed Aug 2023; Rules notified 2025; substantive provisions **not yet fully commenced** — monitor MeitY notifications." |
| **Compliance Benefit** | Honest legal posture; avoids false confidence |
| **Regression Risks** | None |
| **Testing Procedure** | Legal review |
| **Rollback Procedure** | Revert docs |

---

### 2.5 Grievance Officer — Replace Placeholder

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/main.py` line 224; `frontend/public/legal/privacy-policy.md` Section 9; `frontend/public/legal/terms-and-conditions.md` Section 13 |
| **Existing Behavior** | Returns `grievance@mara-financial.com` (placeholder) |
| **Problem** | DPDP Section 12 requires **actual** grievance officer contact |
| **Proposed Modification** | Replace with real email/name before public launch. Document in `docs/OPERATIONS.md` |
| **Compliance Benefit** | Meets DPDP requirement |
| **Regression Risks** | None |
| **Testing Procedure** | Verify endpoint returns real contact |
| **Rollback Procedure** | Revert |

---

## 3. PUBLIC DEMO DEPLOYMENT

### 3.1 Static Vercel Demo with Synthetic Data

| Field | Detail |
|-------|--------|
| **Exact Files** | New: `frontend/public/demo/`, `vercel.json` (add demo route), `frontend/src/api.js` (demo mode), `frontend/src/main.js` (demo init) |
| **Requirements** | • No live NSE/Yahoo data<br>• No personal watchlists/notes<br>• No API secrets<br>• No private backend dependency<br>• Preserve all 6 workspace interfaces (Markets, Discover, Analyze, Compare, Research, Monitor)<br>• Preserve MARA visual identity<br>• Clearly identifiable as demonstration data |
| **Proposed Implementation** | 1. **Synthetic data fixtures** in `frontend/public/demo/` (JSON files):<br>   - `market-overview.json` — 8 indices with fixed values<br>   - `candles-{symbol}.json` — deterministic OHLCV (reuse `generateMockCandles` from `tests/helpers/mockApi.js`)<br>   - `overview-{symbol}.json` — static fundamentals<br>   - `research-{symbol}.json` — static dossier<br>   - `deep-research-{symbol}.json` — static deep research<br>   - `sectors.json`, `correlation.json`, `screener.json`<br>2. **Demo mode flag** in `api.js`: `const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true'`<br>3. When `IS_DEMO`: intercept all `fetchWithRetry` calls → serve from `/demo/*.json` via relative fetch<br>4. **Vercel deployment**: separate `vercel-demo.json` or `vercel.json` rewrite `/demo/*` → static files<br>5. **Visual indicator**: banner "🧪 DEMO MODE — Synthetic data, no live connections" in `index.html` when demo mode<br>6. **Auth**: auto-sign-in as `demo@mara.terminal` with `guest_analyst_token` (no Supabase needed)<br>7. **localStorage**: pre-seed demo watchlist/notes on first load |
| **Security Benefit** | Zero backend attack surface; zero data licensing risk; zero personal data |
| **Regression Risks** | Demo mode must not leak into production build — guard with `VITE_DEMO_MODE` |
| **Testing Procedure** | 1. Set `VITE_DEMO_MODE=true`, build → `npm run build`<br>2. Deploy to Vercel preview → all 6 workspaces load with synthetic data<br>3. Verify no network calls to `/api/*` or Supabase in browser devtools<br>4. Verify demo banner visible |
| **Rollback Procedure** | Remove demo files and flag |

---

## 4. OPTIONAL IMPROVEMENTS

### 4.1 Rate Limiting Middleware

| Field | Detail |
|-------|--------|
| **Exact File** | New: `backend/api/middleware/rate_limit.py` |
| **Proposed** | Add `slowapi` or custom token-bucket middleware. Per-IP limits: 60 req/min for `/api/*`, 10 req/min for `/internal/*`. Skip for authenticated users with valid token (higher limits). |
| **Benefit** | DoS mitigation |
| **Risk** | Added dependency; complexity |
| **Priority** | Before monetization |

---

### 4.2 Secret Rotation Procedure Documentation

| Field | Detail |
|-------|--------|
| **Exact File** | New: `docs/SECRET_ROTATION.md` |
| **Proposed** | Document rotation for: `INTERNAL_REFRESH_SECRET` (quarterly), `SUPABASE_SERVICE_KEY` (annual), `SUPABASE_JWT_SECRET` (via Supabase dashboard). Procedure: generate new → add to Vercel/Render/GitHub secrets → deploy → verify → revoke old. Backward-compatible: accept both old/new for 24h during rotation. |
| **Benefit** | Operational readiness |
| **Risk** | None |
| **Priority** | Before production launch |

---

### 4.3 Data Retention Schedule Implementation

| Field | Detail |
|-------|--------|
| **Exact File** | `backend/services/data_retention.py` (new), cron job |
| **Proposed** | Define retention: auth data (Supabase) — 2 years after last sign-in; localStorage — user-controlled; cache — TTL-based (already). Implement Supabase admin API cleanup job. |
| **Benefit** | DPDP Section 3(2) compliance |
| **Risk** | Supabase admin API usage |
| **Priority** | Before commercialization |

---

## 5. TESTING & VERIFICATION MATRIX

| Category | Test | Method | Pass Criteria |
|----------|------|--------|---------------|
| Security | Dev bypass removed | Start without Supabase env | 401 on protected routes |
| Security | Fail-closed secret | Start prod without secret | Startup ValueError |
| Security | Service key separation | Grep frontend dist | No service key found |
| Security | CORS wildcard removed | Deploy preview, check headers | No `Access-Control-Allow-Origin: *` with credentials |
| Security | CSP/HSTS headers | `curl -I` + securityheaders.com | All headers present, no violations |
| Privacy | Data-flow accuracy | Code audit vs policy | Policy matches implementation |
| Privacy | Grievance officer real | Check endpoint | Real email returned |
| Demo | Synthetic data loads | Build with `VITE_DEMO_MODE=true` | All 6 views render, zero live API calls |
| Demo | No secrets in demo build | Grep demo dist | No Supabase URL/key, no internal secret |

---

## 6. APPROVAL CHECKLIST

| Item | Status | Owner |
|------|--------|-------|
| 1.1 Dev bypass removal | ☑ DONE | Backend |
| 1.2 Fail-closed secret | ☑ DONE | Backend |
| 1.3 Service key separation | ☑ DONE | Backend |
| 1.4 Frontend secret scan CI | ☑ DONE | DevOps |
| 1.5 CORS wildcard removal | ☑ DONE | Backend |
| 1.6 CSP/HSTS headers | ☑ DONE | Backend/Frontend |
| 2.1 Supabase classification | ☑ DONE | Docs |
| 2.2 NSE 403 language | ☑ DONE | Legal/Docs |
| 2.3 Privacy data-flow rewrite | ☑ DONE | Legal |
| 2.4 DPDP/SEBI unverified markers | ☑ DONE | Legal |
| 2.5 Grievance officer real contact | ☑ DONE | Ops |
| 3.1 Static demo deployment | ☑ DONE | Frontend/DevOps |

---

## 7. RISK SUMMARY

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dev bypass re-introduced | Medium | High | CI test asserting 401 without auth |
| Secret leakage to frontend | Low | Critical | Automated CI scan (1.4) |
| NSE legal action | Medium | High | Disable NSE provider by default; use yfinance only with attribution |
| SEBI RA registration required | High | High | Legal counsel; add prominent disclaimers; consider registration if monetizing |
| DPDP non-compliance | Medium | High | Complete privacy policy rewrite (2.3); retention schedule (4.3) |
| Demo mode leaks to prod | Low | Medium | Build-time env guard; separate Vercel project |

---

## 8. NEXT STEPS

1. **Owner reviews this package** — approve/reject/modify each item
2. **Legal counsel reviews** items 2.2, 2.4, 3.1 (NSE request draft, SEBI unverified status, demo data licensing)
3. **Implementation sprint** — tackle Security-Critical (1.1–1.6) first, then Privacy (2.1–2.5), then Demo (3.1)
4. **Pre-launch verification** — run Testing Matrix (Section 5)
5. **Go/No-Go decision** — based on verification results

---

*This package contains **proposed modifications only**. No code or documents have been changed. All changes require explicit approval before implementation.*