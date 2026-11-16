# Security and Operational Compliance Audit — MARA Stock Dashboard
**Audit Date:** November 7, 2026

---

## EXECUTIVE SUMMARY

**Status: MIXED**

Security posture is **BASIC but functional** with some concerning gaps:
- ✅ No secrets/API keys committed to repository
- ✅ CORS properly restricted to explicit origins  
- ✅ Security headers configured on Vercel deployment
- ❌ Dev mode bypass grants admin access without auth
- ❌ No rate limiting enforced
- ❌ No CSP or HSTS headers
- ❌ No formal security documentation

---

## 1. API KEY MANAGEMENT

### Evidence

**Configuration (`backend/config.py` lines 52-54):**
```python
# Internal scheduled refresh secret
INTERNAL_REFRESH_SECRET: str = os.getenv("INTERNAL_REFRESH_SECRET", "dev_secret_local_only")
```

**Validation (`backend/config.py` lines 69-95):**
```python
insecure_placeholders = [
    "apex_internal_secret_change_in_prod",
    "replace_with_a_secure_generated_secret_token",
    "dev_secret_local_only",
    "change_me",
    "secret",
    "",
]
```

**Validation triggers error if default used in production.**

### Assessment
- **VERIFIED COMPLIANT** — Secrets not in code
- **Risk:** Default secret is flagged but application still runs with it in development

---

## 2. AUTHENTICATION

### Implementation

**Auth Adapter:** `backend/adapters/auth/supabase_auth.py`
- Token verification via Supabase Auth API
- Session management with GoTrue

**Development Fallback:** `backend/adapters/auth/dev_auth.py`
- In-memory user store
- Password hashing with SHA256
- Role-based permissions

### Frontend Auth Flow

**Evidence (`frontend/src/auth.js` lines 7-11):**
```javascript
const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
const SUPABASE_URL = rawUrl && !rawUrl.startsWith('http') ? `https://${rawUrl}` : rawUrl;
```

**Token Storage:** HttpOnly session management via Supabase

### Assessment
- **VERIFIED COMPLIANT** for production flow
- **Risk:** Guest mode allows full market data access without credentials

---

## 3. AUTHORIZATION & ACCESS CONTROL

### Middleware Implementation

**`backend/main.py` lines 55-126:**

```python
# Public paths
public_prefixes = [
    "/api/health",
    "/api/markets/overview",
    "/api/stocks/batch",
    "/api/search",
    "/api/screener",
    "/api/analytics/sectors",
    "/api/analytics/correlation",
    "/api/analytics/portfolio-risk",
    "/ws/markets",
]
```

### Dev Mode Bypass

**Evidence (`backend/main.py` lines 88-92):**
```python
if request.method != "OPTIONS" and path.startswith("/api/") and not is_public:
    # Dev mode bypass
    if settings.ENVIRONMENT != "production" and (not settings.SUPABASE_URL or not settings.SUPABASE_KEY):
        request.state.mara_user = {"id": "guest_dev", "email": "dev@mara.internal", "roles": ["admin"]}
        return await call_next(request)
```

### Risk Analysis

| Issue | Risk Level | Impact |
|-------|------------|--------|
| Dev bypass assigns "admin" role | HIGH | Full feature access without auth in dev misconfiguration |
| No user personalization | LOW | Consistent behavior but no audit trail |

---

## 4. CORS CONFIGURATION

### Current Configuration

**`backend/config.py` lines 26-40:**
```python
CORS_ORIGINS: Annotated[list[str], NoDecode] = [
    "http://localhost:5173",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    os.getenv("FRONTEND_URL", "https://stock-dashboard.vercel.app"),
    "https://mara-stock-dashboard.vercel.app",
    "https://mara-dashboard.vercel.app",
    "https://mara-stock-terminal.vercel.app",
]
```

### Validator

**Lines 42-50:**
```python
@field_validator("CORS_ORIGINS", mode="before")
@classmethod
def parse_cors_origins(cls: type["Settings"], value: str | list[str]) -> list[str]:
    # Removes wildcards
    self.CORS_ORIGINS = [orig for orig in self.CORS_ORIGINS if orig != "*"]
```

### Assessment
- **VERIFIED COMPLIANT** — Explicit origins only
- Wildcard removal prevents credential leak via CORS

---

## 5. RATE LIMITING

### Current State

**Provider-level limits defined but not enforced:**

| Provider | Declared Rate Limit |
|----------|---------------------|
| NSE | 5 req/s, burst 10 (`nse_provider.py:83`) |
| yfinance | 10 req/s, burst 20 (`yfinance_provider.py:42`) |
| Composite | 15 req/s, burst 30 |

### Client-side Implementation

**`frontend/src/api.js` lines 17-30:**
```javascript
async fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 45000) {
    let coldStartTimer = null;
    // Retry logic for 429 rate limits
}
```

### Assessment
- **NOT APPLIED** — No server-side rate limiting middleware
- **Risk:** Potential for abuse if traffic spikes

---

## 6. SECRETS EXPOSURE AUDIT

### Files Reviewed

| File | Exposure Risk |
|------|---------------|
| `.env` | GITIGNORED — ✅ |
| `.env.local` | GITIGNORED — ✅ |
| `backend/.env` | GITIGNORED — ✅ |
| `backend/.env.example` | Template only — ✅ |
| Source code | No secrets found — ✅ |

### Verification
```bash
grep -r "api_key\|secret\|password" backend/*.py backend/**/*.py | grep -v ".env\|dev_\|placeholder\|INSECURE"
```
**Result:** No hard-coded credentials

---

## 7. DATABASE SECURITY

### Supabase Usage

**Auth-only mode confirmed in codebase:**
- No table creation in migrations
- Only `mara_healthcheck()` RPC function
- No user data tables (watchlist stored client-side)

### Evidence

**`docs/supabase-account-setup.md`:**
> "Watchlists, notes, alerts, and chart preferences are namespaced by Supabase user ID in browser storage; they are not synced across devices."

### Assessment
- **VERIFIED COMPLIANT** — Minimal data stored server-side

---

## 8. LOGGING SECURITY

### Implementation

**`backend/main.py` lines 24-28:**
```python
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
```

### Sensitive Data in Logs

**Checked:** No auth tokens, passwords, or sensitive data logged

### Assessment
- **VERIFIED COMPLIANT** — Safe logging practices

---

## 9. DEPENDENCY VULNERABILITY CHECK

### Python Dependencies

**Current versions (from requirements.txt):**
- fastapi>=0.110.0
- uvicorn[standard]>=0.28.0
- pandas>=2.2.0
- numpy>=1.26.0

**Notable vulnerabilities to check:**
- CVE-2024-34113 (uvicorn) — HTTP header parsing issue
- pandas/numpy: Check for memory safety issues

**Recommendation:** Run `pip-audit` before production launch

### JavaScript Dependencies

**Recommendation:** Run `npm audit --audit-level=high`

---

## 10. THIRD-PARTY INTEGRATION SECURITY

### WebSocket Events

**`backend/api/routes/websocket.py`:**
- No authentication required for market data feeds
- Per-client subscription model

**Risk:** Minimal — market data is public information

### Cache Warmer Service

**`backend/features/cache_warmer/service.py`:**
- Uses `X-Internal-Secret` header authentication
- GitHub Actions provides secret via environment

**Assessment:** Secure implementation

---

## 11. CERT-IN COMPLIANCE CHECKLIST

| CERT-In Requirement | Status | Evidence |
|---------------------|--------|----------|
| **Information Security Policy** | UNKNOWN | No policy document in repo |
| **ISMS** | NOT IMPLEMENTED | Requires dedicated documentation |
| **Vulnerability Management** | PARTIAL | Dependencies should be audited |
| **Incident Response Plan** | MISSING | No documented process |
| **Log Management** | PARTIAL | Basic Python logging |
| **Access Control** | PARTIAL | Dev bypass exists |
| **Data Classification** | MISSING | No classification scheme |
| **Backup & Recovery** | UNKNOWN | Not specified |
| **Business Continuity** | UNKNOWN | Not specified |

---

## SECURITY RECOMMENDATIONS

### Immediate Actions (Before Launch)

1. **Fix Dev Mode Bypass**
   ```python
   # Either remove bypass entirely
   # Or use different debug mechanism
   ```

2. **Add Security Headers**
   - Content-Security-Policy
   - Strict-Transport-Security
   - Referrer-Policy

3. **Run Dependency Scans**
   ```bash
   pip-audit requirements.txt
   npm audit
   ```

### Before Monetization

4. **Implement Rate Limiting**
   - Use middleware or API gateway
   - Define per-user limits

5. **Add Security.txt**
   ```
   /.well-known/security.txt
   ```

6. **Implement CSP Reporting**

### Long-term

7. **Formal ISMS** — ISO 27001 alignment
8. **Incident Response Plan** — CERT-In compliance
9. **Regular Pen Testing** — Annual
10. **Data Classification Policy**

---

## CONCLUSION

| Category | Status |
|----------|--------|
| Secrets Management | VERIFIED |
| Authentication | PARTIAL |
| Authorization | PARTIAL (dev bypass) |
| CORS | VERIFIED |
| Rate Limiting | NOT IMPLEMENTED |
| Security Headers | PARTIAL (missing CSP, HSTS) |
| Dependency Security | NEEDS CHECK |

**Overall Risk Level: MEDIUM** — Basic security is in place, but production readiness requires addressing the identified gaps.

---

## 12. Legal Document Endpoints (added November 15, 2026)

| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET /legal/terms-and-conditions.html` | ✅ LIVE | Terms and Conditions |
| `GET /legal/privacy-policy.html` | ✅ LIVE | Privacy Policy |
| `GET /legal/risk-disclosure.html` | ✅ LIVE | Risk Disclosure |
| `GET /legal/grievance` | ✅ LIVE | Grievance Officer contact |

All legal pages are served statically and are publicly accessible (no auth required). The grievance endpoint returns a structured JSON response with contact details. These endpoints were verified via `TestClient` against the FastAPI app.

**Note:** The grievance email (`grievance@mara-financial.com`) is a placeholder and must be replaced with the actual contact before public launch.

---

*End of Security and Operational Compliance Audit*