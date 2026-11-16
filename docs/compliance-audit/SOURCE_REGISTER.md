# Source Register — MARA Stock Dashboard Compliance Audit
**Audit Date:** November 7, 2026
**Purpose:** Catalog of all evidence sources cited in this audit

---

## SOURCE DOCUMENTS LIST

### 1. Backend Application Code

| Source File | Purpose in Audit |
|-------------|------------------|
| `backend/main.py` | Authentication middleware, public endpoint definitions, internal API protection |
| `backend/config.py` | CORS configuration, secret validation, environment variables |
| `backend/api/dependencies.py` | Dependency injection, service initialization |
| `backend/api/routes/*.py` | API endpoint definitions and data flow |
| `backend/adapters/market_data/nse_provider.py` | NSE data scraping implementation |
| `backend/adapters/market_data/yfinance_provider.py` | Yahoo Finance data fetching |
| `backend/adapters/market_data/composite_provider.py` | Data provider routing and caching |
| `backend/adapters/cache/redis_cache.py` | L2 cache implementation |
| `backend/adapters/auth/supabase_auth.py` | Authentication implementation |
| `backend/adapters/auth/dev_auth.py` | Development authentication |
| `backend/features/*/service.py` | Feature business logic and outputs |

### 2. Frontend Application Code

| Source File | Purpose in Audit |
|-------------|------------------|
| `frontend/index.html` | Page content, meta tags, disclaimers, structure |
| `frontend/src/auth.js` | Authentication flow, consent for user data |
| `frontend/src/chart.js` | TradingView chart rendering, data display |
| `frontend/src/watchlist.js` | User data storage (localStorage) |
| `frontend/src/notebook.js` | User notes storage (localStorage) |
| `frontend/src/alerts.js` | Alert system (client-side only) |
| `frontend/src/report_generator.js` | Research report generation, disclaimers |
| `frontend/src/backtester.js` | Strategy backtesting, BUY/SELL signals |
| `frontend/src/screener_builder.js` | Screening rules and filters |
| `frontend/src/router.js` | Navigation and workspace definitions |
| `frontend/src/award-winning-dashboard.js` | Marketing content, CTAs |
| `frontend/src/components/AwardWinningDashboard.jsx` | Production UI components |

### 3. Configuration Files

| Source File | Purpose in Audit |
|-------------|------------------|
| `backend/requirements.txt` | Python dependencies (yfinance, pandas, etc.) |
| `requirements.txt` | Root requirements |
| `backend/.env.example` | Environment variable template |
| `backend/.env` | Production environment (gitignored) |
| `frontend/.env` | Frontend environment (gitignored) |
| `backend/.env.local` | Local Vercel config (gitignored) |
| `vercel.json` | Deployment configuration, security headers |
| `Dockerfile` | Multi-cloud deployment |
| `pyproject.toml` | Project metadata, dependencies |

### 4. GitHub Actions Workflows

| Source File | Purpose in Audit |
|-------------|------------------|
| `.github/workflows/warm-cache.yml` | Cache warming schedule, secrets usage |

### 5. Documentation Files

| Source File | Purpose in Audit |
|-------------|------------------|
| `docs/supabase-account-setup.md` | Authentication architecture |
| `AGENTS.md` | Project rules and architecture principles |
| `ARCHITECTURE.md` | System architecture overview |
| `CODEBASE_STRUCTURE.md` | Technical documentation |

### 6. Data Files

| Source File | Purpose in Audit |
|-------------|------------------|
| `companies.csv` | NSE company symbol catalog (2,368 entries) |

### 7. Frontend Static Assets

| Source File | Purpose in Audit |
|-------------|------------------|
| `frontend/dist/index.html` | Production build HTML |
| `frontend/dist/robots.txt` | Search indexing policy |
| `frontend/dist/sitemap.xml` | Site map for crawlers |
| `frontend/dist/manifest.json` | PWA manifest |
| `frontend/dist/favicon.svg` | Brand asset |
| `frontend/dot-robots.txt` | SEO policy |

### 8. Legal Documents (added November 15, 2026)

| Source File | Purpose in Audit |
|-------------|------------------|
| `frontend/public/legal/terms-and-conditions.html` | Published Terms and Conditions |
| `frontend/public/legal/terms-and-conditions.md` | Source Terms and Conditions |
| `frontend/public/legal/privacy-policy.html` | Published Privacy Policy |
| `frontend/public/legal/privacy-policy.md` | Source Privacy Policy |
| `frontend/public/legal/risk-disclosure.html` | Published Risk Disclosure |
| `frontend/public/legal/risk-disclosure.md` | Source Risk Disclosure |
| `frontend/dist/legal/` | Deployed copies of all legal documents |
| `backend/main.py` | FastAPI routes serving legal pages and grievance endpoint |

### 8. Legal/Regulatory References

| Source | URL | Use in Audit |
|--------|-----|--------------|
| SEBI (Investment Advisers) Regulations, 2013 | https://sebi.gov.in/sebi_data/officedocs/ia_regulations_2013.pdf | Definition of investment advice |
| SEBI (Research Analysts) Regulations, 2014 | https://sebi.gov.in/sebi_data/officedocs/ra_regulations_2014.pdf | Definition of research report |
| Yahoo Finance Terms of Service | https://finance.yahoo.com/termsofservice | Section 2(d) commercial use prohibition |
| NSE Data Sharing Policy | https://www.nseindia.com/about/nse-data-sharing-policy | Commercial licensing requirements |
| Digital Personal Data Protection Act, 2023 | https://www.legitory.com/instant-alert/dPDpAct2023 | User data handling requirements |
| Consumer Protection Act, 2019 | https://www.cpci.gov.in | E-commerce and advertising rules |
| CERT-In Directions | https://www.cert-in.org.in | Cybersecurity guidelines |

---

## VERIFICATION CHECKLIST

| Item | Verified | Source |
|------|----------|--------|
| NSE provider scrapes data | ✓ | `backend/adapters/market_data/nse_provider.py:230-231` |
| yfinance uses Yahoo data | ✓ | `backend/adapters/market_data/yfinance_provider.py:10` |
| No API keys in code | ✓ | Manual review of all .py and .js files |
| Privacy policy missing | ✓ | `frontend/index.html` search for "privacy", "terms" |
| RSS news fetching | ✓ | `backend/api/routes/research.py:48-99` |
| Authentication via Supabase | ✓ | `frontend/src/auth.js:7-11`, `docs/supabase-account-setup.md` |
| Dev mode bypass exists | ✓ | `backend/main.py:88-92` |
| Guest mode available | ✓ | `frontend/src/auth.js:115-122` |
| CORS properly configured | ✓ | `backend/config.py:26-50` |
| Security headers on Vercel | ✓ | `vercel.json:39-47` |
| Data stored in localStorage | ✓ | `frontend/src/watchlist.js:11`, `frontend/src/notebook.js:7` |
| No AI/ML services | ✓ | grep for "openai", "anthropic", "claude", "gpt" |
| No explicit monetization | ✓ | No Stripe, PayPal, or subscription logic found |
| Backtester produces BUY/SELL | ✓ | `frontend/src/backtester.js:72, 97` |
| Financial health score produced | ✓ | `backend/features/deep_research/service.py:456-518` |

---

## DATA FLOW TRACE

### Market Data Flow
```
User Request → CompositeMarketProvider
    ├── Cache Check (Redis/Memory)
    │   ├── HIT: Return cached data
    │   └── MISS: Proceed to provider
    ├── Provider Selection
    │   ├── .NS/.BO symbols: NSE Provider
    │   │   └── NSE API → Quote (fallback: yfinance)
    │   └── Other symbols: yfinance provider
    │       └── Yahoo Finance API → Quote, History, Fundamentals
    ├── Cache Store (TTL: 60-1800s)
    └── Response to Client
```

### Authentication Flow
```
User → Frontend (index.html)
    ├── Sign In: Supabase Auth → JWT token
    ├── Token → Backend (Authorization: Bearer)
    │   └── main.py:116: verify_token(credential)
    │       └── Supabase Auth.get_user(token)
    └── Dev Mode: bypass if ENV=!production
```

### User Data Locations
```
Email/Account: Supabase Auth database
Session: Browser localStorage (supabase.auth.session)
Watchlist: localStorage key = 'apex_user_watchlist'
Notes: localStorage key = 'apex_notebook_{symbol}'
Alerts: localStorage key = 'apex_alerts'
Chart prefs: localStorage per-account namespacing
```

---

## EXTRACTION METHODS

1. **File Reading:** Direct `Read` tool for all source files
2. **Code Search:** `Grep` tool for patterns like "recommendation", "disclaimer", "privacy"
3. **Directory Listing:** `Bash` tool with `find` for file discovery
4. **Configuration Extraction:** Direct read of .env, vercel.json, package.json

---

*End of Source Register*