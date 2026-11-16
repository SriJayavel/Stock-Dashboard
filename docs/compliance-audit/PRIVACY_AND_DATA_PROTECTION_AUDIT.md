# Privacy and Data Protection Audit — MARA Stock Dashboard
**Audit Date:** November 7, 2026
**Jurisdiction:** India
**Applicable Law:** Digital Personal Data Protection Act, 2023

---

## EXECUTIVE SUMMARY

**Status: PARTIALLY COMPLIANT (remediation applied November 15, 2026)**

The application collects user email addresses and uses third-party Supabase authentication. A Privacy Policy has now been published. Remaining gaps:
- User rights mechanism (access, correction, deletion) — no self-service endpoint
- Formal data retention schedule — not yet defined
- Grievance Officer contact details — endpoint exists but placeholder email
- Data Processing Agreement with Supabase — not yet executed

---

## PERSONAL DATA INVENTORY

### Based on Evidence from Codebase

| Data Type | Source | Storage Location | Purpose | Legal Basis |
|-----------|--------|------------------|---------|-------------|
| **Email Address** | Sign-up form (`frontend/index.html` line 130) | Supabase Auth database | Account verification, sessions | Consent |
| **Password** | Sign-up form | Supabase Auth (hashed) | Authentication | Contract necessity |
| **Name** | Sign-up metadata | Supabase Auth | Display name | Consent |
| **IP Address** | HTTP request | Potentially in logs | Security | Legitimate interest |
| **Watchlist** | User input (`frontend/src/watchlist.js`) | localStorage (per-browser) | Feature functionality | Contract necessity |
| **Research Notes** | User input (`frontend/src/notebook.js`) | localStorage (per-browser) | Note-taking | Contract necessity |
| **Alerts** | User input (`frontend/src/alerts.js`) | localStorage (per-browser) | Price notifications | Contract necessity |
| **Session Token** | Auth flow | Browser storage | Authenticated state | Contract necessity |
| **Referrer URL** | HTTP headers | Potential logs | Security | Legitimate interest |

---

## DETAILED FINDINGS

### 1. User Registration and Authentication

**Evidence:**
- `frontend/index.html` lines 103-101 (Sign in / Create account buttons)
- `frontend/src/auth.js` (Full authentication flow)
- `backend/adapters/auth/supabase_auth.py` (Token verification)

**What happens:**
1. User enters email and password (lines 130-132 of auth.js)
2. Password minimum length: 8 characters (line 146-147)
3. Email verification option shown (line 168: "Confirmation link sent")
4. Tokens verified via Supabase Auth endpoint

**Data Controller:** The project appears to be operated by an entity not named in the UI.

**Finding:** `UNVERIFIED` — No privacy notice or data processing description provided to users.

---

### 2. Email Collection

**Evidence:**
- `frontend/index.html` line 130: `<input class="auth-field-input" id="auth-email" type="email" ...>`
- `frontend/src/auth.js` lines 130-132

**Collection method:** Email entered during sign-up or password reset

**Third-party processing:** Supabase Auth (see `docs/supabase-account-setup.md`)

**Finding:** `UNVERIFIED` — Users not informed that email is stored with Supabase or for what purposes beyond authentication.

---

### 3. Cookie Usage

**Evidence:**
- `frontend/src/auth.js` line 10: `autoRefreshToken: true, persistSession: true`
- `frontend/src/watchlist.js` line 11: `const STORAGE_KEY = 'apex_user_watchlist';`
- `frontend/src/notebook.js` line 7: `const NOTEBOOK_PREFIX = 'apex_notebook_';`

**Cookies identified:**
1. **Supabase auth cookie** — Session persistence
2. **Browser storage keys** — localStorage for watchlist, notes, alerts (not cookies, but similar tracking)

**Finding:** `MEDIUM RISK` — No cookie disclaimer or consent mechanism present.

---

### 4. Analytics and Tracking

**Evidence Search:**
```
grep -rin "google-analytics\|gtag\|analytics\|tracking\|plausible\|mixpanel" frontend/
```

**Result:** No client-side analytics libraries found.

**However:**
- Supabase Auth tracks sign-in events (backend)
- Cloudflare may track Vercel deployments
- Browser storage tracks user preferences

**Finding:** `LOW` — No explicit tracking cookies, but localStorage usage requires disclosure.

---

### 5. Watchlist Storage

**Evidence:**
- `frontend/src/watchlist.js` (Full watchlist manager)
- `frontend/src/watchlist.js` lines 74-81

**Behavior:**
- Stored in `localStorage` using key `apex_user_watchlist`
- Namespaced by user ID via `getAccountStorageKey()` (auth.js line 295)
- **NOT synced across devices** (per comment in supabase-account-setup.md)

**Finding:** `LOW` — Client-side storage is acceptable, but disclosure should mention this.

---

### 6. Third-Party Services

#### Supabase (Authentication)

**Evidence:**
- `docs/supabase-account-setup.md` (Full setup guide)
- `frontend/.env` lines 2-3: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `frontend/src/auth.js` lines 7-11

**Data shared with Supabase:**
- Email address
- Password hash
- Session tokens
- Sign-in timestamps

**Finding:** `VERIFIED COMPLIANT` — Using Supabase as documented. However, the privacy policy should disclose this.

---

### 7. Data Retention

**Evidence Search:**
```
grep -rin "retention\|delete\|remove" backend/
```

**Result:** No explicit data retention or deletion policy implemented.

**Finding:** `MEDIUM RISK` — DPDP Act, 2023 requires data to be retained only as long as necessary.

---

### 8. Children's Data

**Evidence:**
- No age verification mechanism
- Sign-up requires email (likely adult)

**Finding:** `NOT APPLICABLE` — No evidence of children's data collection.

---

## COMPARISON WITH DPDP ACT, 2023 REQUIREMENTS

| DPDP Requirement | Status | Evidence |
|-----------------|--------|----------|
| **Notice of collection** | MISSING | No privacy policy visible |
| **Purpose of processing** | UNVERIFIED | Not disclosed to users |
| **Consent mechanism** | PARTIAL | Email required for sign-up, but no explicit consent for data processing |
| **Data retention period** | MISSING | No policy found |
| **Right to access** | MISSING | No mechanism to view/delete personal data |
| **Right to correction** | MISSING | No mechanism to correct data |
| **Right to erasure** | MISSING | No account deletion API |
| **Children's data protection** | N/A | Age gate absent, but likely adult-focused |
| **Grievance officer** | MISSING | No contact information for complaints |

---

## REQUIRED DISCLOSURES UNDER DPDP RULES, 2025

### Section 3(1)(b) — Notice Required

Users must be informed of:
1. **Categories of personal data collected** — Email, name, session data
2. **Purpose of processing** — Authentication, feature persistence
3. **Data fiduciary details** — Who operates the service
4. **Grievance officer contact** — Mandatory for Indian entities

### Section 3(2) — Consent

**Current state:**
- Email is required for account creation
- Password is required
- No explicit opt-in for data processing beyond authentication

**Gap:** DPDP requires **explicit consent** for processing personal data for non-essential purposes. Authentication is "contract necessity," but watchlist storage, notes, and preferences are not essential for service delivery.

### DPDP Applicability & Commencement — UNVERIFIED

**⚠️ UNVERIFIED — LEGAL COUNSEL REQUIRED:**

1. **Personal/Domestic Exemption (Section 3(c)):** The DPDP Act exempts processing "by an individual for any personal or domestic purpose." Whether a publicly deployed web application (even single-user) qualifies is **unverified** — no precedent or regulatory guidance exists. Do not assume exemption applies.

2. **Commencement Timeline:** 
   - DPDP Act passed: August 11, 2023
   - DPDP Rules notified: January 2025 (draft), final rules pending
   - **Substantive provisions NOT YET FULLY COMMENCED** — monitor MeitY notifications for effective dates
   - Sections 3 (notice), 6 (consent), 8 (rights), 12 (grievance) commencement dates TBD

3. **Data Fiduciary Status:** If the service is offered publicly (even free), Mara likely qualifies as a "data fiduciary" under Section 2(i) — "any person who alone or in conjunction with other persons determines the purpose and means of processing of personal data."

**Conclusion:** Treat all DPDP obligations as applicable until counsel confirms otherwise. The privacy policy and grievance officer endpoint have been implemented as precautionary compliance.

---

## COMPARISON: ACTUAL vs. REQUIRED PRIVACY POLICY

### What the Privacy Policy Must Contain (DPDP Act)

1. **Identity and Contact Details of Data Fiduciary**
   - Currently MISSING — No organization name in UI

2. **Purpose of Processing**
   - Currently INCOMPLETE — Only mentioned in code comments

3. **Categories of Personal Data**
   - Currently NOT DISCLOSED to users

4. **Name of Data Processor**
   - Supabase is a processor — should be named

5. **Data Transfer Outside India**
   - Supabase stores data in US/EU — must disclose

6. **Grievance Officer**
   - Currently MISSING

7. **Data Retention Period**
   - Currently NOT SPECIFIED

8. **Rights of Data Principal**
   - Access, correction, erasure — NOT IMPLEMENTED

---

## RECOMMENDATIONS

### Phase 1: Before Public Launch

1. **Publish a Privacy Policy page** at `/privacy` or `/privacy-policy` including:
   - Identity of data controller (need to establish)
   - Categories of data collected
   - Purposes of processing
   - Third-party processors (Supabase)
   - Data transfers (international)
   - Retention periods
   - Contact/grievance officer information

2. **Implement consent for non-essential data** (watchlist, notes storage)

3. **Add account deletion mechanism** (API endpoint or self-service portal)

4. **Implement cookie/storage disclosure** in footer or settings

### Phase 2: Long-term

1. **Data Processing Agreement with Supabase** — Verify GDPR/DPDP compliance
2. **Regular data deletion cron** — Auto-purge inactive accounts after retention period
3. **User data export** — Allow users to download their data

---

## LEGAL SOURCES REFERENCED

1. Digital Personal Data Protection Act, 2023 — https://www.legitory.com/instant-alert/dPDpAct2023
2. Digital Personal Data Protection Rules, 2025 — Section 3: Notice requirements
3. Information Technology Act, 2000 — Section 43A (data security)

---

*End of Privacy and Data Protection Audit*