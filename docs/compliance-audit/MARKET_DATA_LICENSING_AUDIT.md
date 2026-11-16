# Market Data Licensing Audit — MARA Stock Dashboard
**Audit Date:** November 7, 2026
**Scope:** Investigation of all external data sources and their usage rights

---

## METHODODOLOGY

1. Located all data provider code
2. Identified API endpoints and data fetching patterns
3. Researched provider terms of service
4. Analyzed caching, storage, and redistribution behavior

---

## DATA PROVIDER ASSESSMENT TABLE

| Provider | Data | Usage Rights | Commercial Rights | Redistribution Rights | Risk |
|----------|------|--------------|-------------------|----------------------|------|
| **yfinance** | Equities, ETFs, Indices, Crypto, Forex, Commodities; Quotes, History, Fundamentals, Dividends | **Personal/Non-commercial use only** | **Prohibited** — Section 2(d): "No commercial purposes" | **Prohibited** — "Compiled or aggregated works" | **CRITICAL** |
| **NSE India** | Indian equities (.NS, .BO); Quotes only (history empty) | **No license verification** | Unverified | Unverified | **CRITICAL** |
| **BSE India RSS** | News headlines | Personal use | Unverified | Unverified | **HIGH** |
| **Yahoo Finance RSS** | News feed | Personal use | Unverified | **Prohibited** | **HIGH** |
| **Google News RSS** | Stock news search | Personal use | Unverified | **Prohibited** | **HIGH** |

---

## 1. YAHOO FINANCE / yfinance PROVIDER

### Location in Codebase
- **Primary adapter:** `backend/adapters/market_data/yfinance_provider.py`
- **Composite provider usage:** `backend/adapters/market_data/composite_provider.py` lines 14, 369-370

### Evidence of Usage

**Import statement (line 10):**
```python
import yfinance as yf
```

**Capabilities (lines 54-65):**
```python
@property
def capabilities(self) -> List[str]:
    return [
        ProviderCapabilities.REAL_TIME_QUOTES,
        ProviderCapabilities.INTRADAY_HISTORY,
        ProviderCapabilities.EXTENDED_HOURS,
        ProviderCapabilities.FUNDAMENTALS,
        ProviderCapabilities.DIVIDENDS_SPLITS,
        ...
    ]
```

**Quote fetching (lines 142-171):**
```python
async def get_quote(self, symbol: str) -> Optional[Quote]:
    """Get real-time quote."""
    ticker = await self._get_ticker(resolved_symbol)
    fast_info = ticker.fast_info
    ...
    return Quote(
        symbol=symbol,
        price=last_price,
        change=last_price - prev_close,
        ...
        recommendation=info.get('recommendationKey'),  # Line 208
    )
```

**Historical data (lines 220-250):**
```python
async def get_history(...):
    hist = ticker.history(period=yf_period, interval=yf_interval)
    ...
    return self._dataframe_to_candles(hist)
```

**Fundamentals (lines 303-322):**
```python
async def get_fundamentals(self, symbol: str) -> dict:
    ticker = await self._get_ticker(symbol)
    info = ticker.info
    financials = ticker.financials
    balance_sheet = ticker.balance_sheet
    cashflow = ticker.cashflow
    return {...}
```

### Yahoo Finance Terms of Service Analysis

**Source:** https://finance.yahoo.com/termsofservice

**Key Provisions:**

1. **Section 2(d) — License Restrictions:**
   > "You agree not to use any data, Content, or information accessible through Yahoo Finance... for any commercial purposes, including but not limited to any derivative works, aggregations, or compilations..."

2. **Section 4.2 — Redistribution:**
   > "You may not copy, modify, distribute, sell, or lease any part of the Services or Content... including in compiled or aggregated works."

3. **Personal Use Only Clause:**
   > "Unless you download or copy content, software, or items covered by Yahoo Finance's intellectual property, you may not do so."

### Risk Assessment

**VERDICT: POTENTIALLY NON-COMPLIANT**

The application:
- Fetches **real-time quotes** and **historical price data**
- Caches data in **Upstash Redis** (L2 cache) for multiple users
- Displays data on **charts** with `TradingView` formatting
- Provides **batch endpoints** for multiple symbols
- Uses data for **institutional research reports** with PDF export

**This constitutes commercial redistribution** under Yahoo's ToS. yfinance is an **unofficial third-party library** with no redistribution rights.

### Remediation Options

1. **Remove yfinance and use a licensed provider** (e.g., Polygon.io, Alpha Vantage with commercial plans)
2. **Implement usage limits** to match personal use (not practical for web app)
3. **Obtain commercial license** from Yahoo Finance (not available to individuals)

---

## 2. NSE INDIA DATA PROVIDER

### Location in Codebase
- **Primary adapter:** `backend/adapters/market_data/nse_provider.py`
- **Session handling:** Lines 123-143

### Evidence of Usage

**Session initialization (lines 103-109):**
```python
headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.nseindia.com/",
    "Origin": "https://www.nseindia.com",
}
```

**Quote endpoint (lines 230-231):**
```python
url = f"https://www.nseindia.com/api/quote-equity?symbol={clean}"
resp = await asyncio.wait_for(client.get(url), timeout=8.0)
```

**Historical data (lines 316-327):**
```python
async def get_history(...):
    """Get historical data from NSE."""
    # NSE historical API is complex, fallback to yfinance for history
    return []
```

### NSE Data Sharing & Usage Policy Analysis

**Source:** https://www.nseindia.com/data-sharing-usage-policy

**Key Provisions (based on available documentation):**

1. **API Access:** NSE provides official APIs only to registered entities
2. **Commercial Redistribution:** Requires explicit written agreement
3. **Real-time Data:** Subject to licensing fees for commercial use
4. **Scraping Prohibition:** Direct API calls without authorization violate ToS

### Risk Assessment

**VERDICT: CRITICAL NON-COMPLIANCE**

The application:
- **Calls** NSE's unofficial API endpoints (not authenticated APIs)
- **Includes** browser-like headers (User-Agent, Referer) to establish session
- **Does not have** an NSE API key or commercial license
- **Redistributes** the data to any user accessing the platform

**Observed technical behavior:** NSE returns **HTTP 403 Forbidden** for direct API calls, indicating access is restricted to authorized clients. This is an observed access-denial response, not conclusive legal proof of unauthorized access. Legal characterization requires counsel.

**Remediation:** Apply for NSE data licensing through official channels (Data Seeking Request Form, nseri@nse.co.in) describing: individual researcher use, non-commercial purpose, single-user application, no redistribution, no trading/advisory services.

### Remediation Options

1. **Remove NSE provider** and rely solely on yfinance (still has Yahoo ToS issues)
2. **Apply for NSE data licensing** through approved channels
3. **Use NSE's official data feeds** through authorized resellers

---

## 3. RSS NEWS PROVIDERS

### Location in Codebase
- **Endpoint:** `backend/api/routes/research.py` lines 48-99

### Evidence of Usage

**Yahoo Finance RSS:**
```python
"yahoo": f"https://query1.finance.yahoo.com/v1/finance/rss/news?symbol={urllib.parse.quote(symbol)}",
```

**Google News RSS:**
```python
"google": f"https://news.google.com/rss/search?q={urllib.parse.quote(symbol)}+stock+...",
```

**BSE RSS:**
```python
"bse": f"https://www.bseindia.com/rss.aspx?symbol={urllib.parse.quote(symbol_clean)}",
```

### Risk Assessment

**VERDICT: HIGH RISK**

All RSS feeds have **personal/non-commercial use restrictions**:
- Yahoo Finance RSS explicitly forbids compilation/redistribution
- Google News RSS requires compliance with Google's Terms of Service
- BSE RSS terms are restrictive for commercial redistribution

The application aggregates and displays this news content, which constitutes redistribution.

---

## 4. COMPANIES.CSV FILE

### Location
- Root directory: `companies.csv`
- **2,368 NSE-listed companies** with symbols, names, ISIN numbers

### Analysis
This file is a **static catalog** used for symbol resolution. It does not contain real-time data, so copyright concerns are minimal.

---

## 5. CACHING INFRASTRUCTURE

### Upstash Redis (L2 Cache)

**Location:** `backend/adapters/cache/redis_cache.py`

**Evidence (lines 247-262):**
```python
# L2 Redis cache
if self._cache:
    await self._cache.set("quotes", symbol, quote.__dict__, ttl=self._quote_cache_ttl)
```

**Configuration in config.py (lines 52-54):**
```python
# Redis Cache (Upstash Redis free tier URL e.g. rediss://default:xxx@xxx.upstash.io:6379)
REDIS_URL: str = os.getenv("REDIS_URL", "")
```

### Risk
Storing licensed market data in Redis **increases the liability** as the data becomes **cached and available to all users**, effectively enabling redistribution.

---

## SUMMARY OF RISK LEVELS

| Risk Level | Data Source | Immediate Action Required |
|------------|-------------|---------------------------|
| **CRITICAL** | NSE scraped data | Stop using until license obtained |
| **CRITICAL** | yfinance/redistributed data | Replace with licensed data provider |
| **HIGH** | RSS news feeds | Implement attribution and verify use rights |
| **MEDIUM** | Caching infrastructure | Document data retention policy |

---

## RECOMMENDED ACTIONS

### Phase 1: Immediate

1. **Disable NSE provider** — Set `nse._available = False` or remove from composite provider
2. **Implement yfinance rate limiting** — Prevent batch requests that could trigger ToS violations
3. **Add data source attribution** — Display "Data provided by Yahoo Finance" on all charts

### Phase 2: Before Monitization

1. **Procure commercial data license** — From providers like:
   - Polygon.io (US market data)
   - Alpha Vantage (global equities)
   - National stock exchange direct data feeds (for Indian markets)

2. **Review RSS usage** — Consult legal counsel on Google/Yahoo/BSE news API ToS

3. **Implement data retention limits** — Comply with Data Protection regulations

---

## EVIDENCE FILES REFERENCED

- `backend/adapters/market_data/yfinance_provider.py`
- `backend/adapters/market_data/nse_provider.py`
- `backend/adapters/market_data/composite_provider.py`
- `backend/api/routes/research.py`
- `backend/config.py`
- `backend/adapters/cache/redis_cache.py`
- `frontend/dist/index.html` (robots.txt disallows /api/)
- `frontend/src/chart.js` (TradingView rendering)
- `backend/requirements.txt` (yfinance>=0.2.38)

---

*End of Market Data Licensing Audit*