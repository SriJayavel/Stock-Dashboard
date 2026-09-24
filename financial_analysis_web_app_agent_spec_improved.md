# Financial Analysis Web App — Agent Specification [Enhanced]

## 1. Project Vision

Build a **free-to-use, web-based financial market analysis platform** inspired by the breadth and usability of TradingView, but **strictly for analysis and research**.

The application is NOT a trading platform.

### Core product statement

> **Analyze everything. Trade nothing.**

Users should be able to open the website and immediately search, explore, compare, visualize, and research stocks and markets without creating an account.

The product should feel like a serious financial research terminal, not a college dashboard.

**Target audience:**
- Retail investors learning technical/fundamental analysis
- Traders conducting research before any external execution
- Students studying financial markets
- Financial professionals needing a quick research tool
- Anyone curious about how companies are performing

---

# 2. Non-Negotiable Product Rules

These rules must be followed throughout development.

### No user accounts

Do NOT implement:

- Login
- Signup
- Passwords
- Email verification
- User profiles
- Subscription accounts
- User database

The application must work immediately without authentication.

For user-specific convenience features, use browser-side storage such as `localStorage` where appropriate.

Examples:

- Watchlists
- Recently viewed stocks
- Saved comparisons
- Saved screener filters
- UI preferences
- Search history

**Implementation note:** Use localStorage with versioning to allow non-destructive migration if data format changes.

### No trading

The application must NOT contain:

- Buy buttons
- Sell buttons
- Order placement
- Broker integration
- Trade execution
- Real-money transactions
- Brokerage accounts

Do not design UI elements that could be mistaken for actual order execution.

**Specific restrictions:**
- Portfolio calculation must be labeled "Hypothetical" or "For Analysis Only"
- No order forms, even mockups
- No payment integration of any kind
- No wallet/balance tracking

### Analysis only

The application can provide:

- Technical analysis
- Fundamental analysis
- Quantitative analysis
- Historical analysis
- Market analysis
- Company research
- Comparisons
- Screening
- Alerts
- News
- Economic information
- AI-assisted research

The application should present information and analysis, not execute trades.

---

# 3. Product Philosophy

The primary workflow is:

**Discover → Analyze → Understand → Compare → Research → Monitor**

The application should help users answer questions such as:

- What is happening in this stock?
- How has this company performed historically?
- How does this company compare with its peers?
- Is the valuation relatively high or low?
- What are the company's fundamental trends?
- What technical patterns are visible?
- What news/events may be relevant?
- What changed recently?
- Which companies satisfy a particular set of financial criteria?

Avoid designing the product around instructions such as "Buy now" or "Sell now."

Prefer neutral terminology such as:

- Technical Observation
- Momentum
- Valuation
- Fundamental Trend
- Historical Performance
- Risk Metrics
- Research Alert
- Market Event

**Guiding principles:**
1. **Transparency first:** Show data, clearly distinguish from analysis
2. **Respect uncertainty:** Avoid false confidence in predictions
3. **Enable comparison:** Side-by-side analysis is always better than absolutes
4. **Surface context:** Every number needs context to be meaningful

---

# 4. Target Experience

A user should be able to visit the website and immediately start using it.

Ideal first experience:

1. Open website.
2. See market overview.
3. Search for a company or symbol.
4. Open its analysis page.
5. Explore chart, technicals, fundamentals, valuation and news.
6. Compare it with another company.
7. Save it locally if desired.
8. Leave without creating an account.

The website should never block basic functionality behind registration.

**Critical path metrics:**
- Time to first meaningful data display: < 3 seconds
- Search to results: < 1 second
- Chart interaction: < 100ms response
- Page navigation: instant (client-side routing)

---

# 5. Main Navigation

### Primary Navigation

- **Home** — Market overview and quick search
- **Markets** — Index tracker and sector performance
- **Screener** — Conditional stock filtering
- **Compare** — Multi-company analysis side-by-side
- **Watchlist** — Locally saved stocks and alerts (localStorage)
- **Research** — AI assistant and news hub
- **Search** — Unified search across all entities

### Secondary Navigation (Phase 3+)

- Economic Calendar
- Market Heatmap
- Backtesting
- Advanced Charts
- Sector Deep-dives

Keep navigation clean. Do not overload the header. Mobile: hamburger menu only.

**Navigation consistency rule:** Every major feature must be reachable from the main nav within 2 clicks.

---

# 6. Homepage

The homepage should itself be useful and serve as a research starting point.

Suggested structure:

## Header

- Logo (clickable back to home)
- Navigation items (Markets, Screener, Compare, Research)
- Search field (always visible on desktop; collapsed on mobile)
- Theme toggle

No login/signup buttons. No banner spam.

## Hero Section

Large, prominent search field with placeholder text:

> Search stocks, companies, indices, sectors...

Provide autocomplete suggestions with categories:

- **Stocks:** TCS, INFY, RELIANCE
- **Indices:** NIFTY 50, SENSEX, NIFTY IT
- **Sectors:** IT, Banking, Healthcare

## Market Overview

Show major indices such as:

- NIFTY 50
- SENSEX
- NIFTY 100
- BANK NIFTY
- NIFTY IT
- NIFTY AUTO
- NIFTY PHARMA

Display per index:

- Current value
- Percentage change (with color: green/red)
- Intraday direction (up/down arrow)
- Small sparkline (past 1 week or 1 month)
- Last update timestamp

## Market Movers

Cards organized in sections:

- Top Gainers (top 10)
- Top Losers (top 10)
- Most Active (by volume)
- 52-Week High (newly minted)
- 52-Week Low (bottomed recently)

Each mover card shows:
- Symbol
- Company name
- Current price
- Change % (with color)
- Small chart

Limit to 10-15 items per section to avoid information overload.

## Sector Overview

Show major sector performance in a grid or carousel:

- Sector name
- Index symbol (if applicable)
- Change % and direction
- Holdings count or contribution to benchmark

## Market News Feed

- Top 5-10 most relevant news items
- Source attribution (Reuters, ET, BSE, etc.)
- Timestamp (relative: "2 hours ago")
- Headline + snippet (max 150 chars)
- Clickable to read full analysis

## Above-the-Fold Priority

Order content by likelihood to drive engagement:

1. Search hero
2. Market overview (indices)
3. Market movers
4. News feed

Avoid above-fold clutter. Lazy-load sector details and deeper sections.

---

# 7. Stock Analysis Page

This is the core page of the application.

Example URL structure:

```
/stock/TCS
/stock/INFY
/stock/RELIANCE
```

**Header section:**

- Company name (e.g., "Tata Consultancy Services")
- Symbol (e.g., "TCS")
- Current price (large, prominent)
- Daily change (in points and %)
- Market status indicator (Open / Closed / Pre-market / Post-market)
- Time of last update
- Add to Watchlist button

**Navigation/tabs:**

- Overview
- Chart
- Technical
- Fundamentals
- Valuation
- News
- Events
- Peer Comparison

**Tab content guidelines:**

Each tab should load lazily; do not load all data on page entry.

### Overview Tab

Quick summary:
- Basic company info
- Market cap
- Sector
- Industry
- Website link
- Key recent news
- Quick fundamentals snapshot

### Chart Tab

See section #8 (Interactive Chart).

### Technical Tab

See section #11 (Technical Analysis).

### Fundamentals Tab

See section #9 (Fundamental Analysis).

### Valuation Tab

See section #10 (Valuation Analysis).

### News Tab

Recent news feed with:
- Headline
- Source
- Date
- Snippet
- Relevance score (if available)

### Events Tab

Corporate events:
- Earnings dates
- Dividends
- Stock splits
- Listings

### Peer Comparison Tab

Pre-set peer group comparison (e.g., IT sector peers).

---

# 8. Interactive Chart

The chart should be one of the strongest parts of the application.

### Required Core Capabilities

- **Chart types:** Candlestick, Line, Area, OHLC, Renko (later)
- **Volume:** Always visible by default; toggleable
- **Interaction:** Zoom, Pan, Crosshair, Tooltip
- **Responsiveness:** Works on all screen sizes
- **Fullscreen:** Click to expand; ESC to exit
- **Performance:** Should handle 5+ years of daily data smoothly

### Timeframes

Support practical ranges:

- 1D (daily)
- 1W (weekly)
- 1M (monthly)
- 3M (quarterly)
- 6M (half-year)
- 1Y (1 year)
- 2Y (2 years)
- 5Y (5 years)
- 10Y (10 years)
- MAX (all available data)

**Data strategy:**
- Daily data: 10+ years where available
- Weekly/Monthly: aggregated from daily
- Intraday (1H, 15M, 5M): Phase 2+ only; requires premium data source

### Chart Indicators (Phase 2)

Initial indicators (precomputed on backend):

- **Trend:** SMA (20, 50, 200), EMA (12, 26)
- **Momentum:** RSI (14), MACD (12, 26, 9), Stochastic (14, 3, 3)
- **Volatility:** Bollinger Bands (20, 2), ATR (14)
- **Volume:** Volume, OBV, CMF
- **Other:** VWAP, Supertrend (later)

**Implementation note:**
- Precompute all indicators on backend; cache results
- Frontend receives pre-calculated values; no client-side computation for performance
- Allow toggling on/off in UI
- Support 2-3 overlays simultaneously

### Indicator Configuration UI

Allow users to:
- Toggle indicators on/off
- Change indicator periods (within sensible ranges: SMA 5-200, RSI 5-21, etc.)
- Change colors (if simple)
- View indicator values at cursor position

### Advanced Features (Phase 3+)

- Drawing tools (trendlines, support/resistance)
- Fibonacci retracement
- Volume profile
- Point-and-figure
- Heatmaps
- Annotations (text)

**Strict rule:** No tools that look like order entry.

### Chart Performance Optimization

- Render only visible candles (virtualization)
- Canvas rendering for speed
- Debounce pan/zoom interactions
- Cache rendered indicators
- Lazy-load historical data (fetch data as user pans left)

---

# 9. Fundamental Analysis

Every supported company should have a structured fundamental analysis page.

### Key Metrics Display

Present metrics in a organized, scannable format:

**Valuation Metrics:**
- Market Capitalization (in Cr)
- Enterprise Value (if available)
- P/E Ratio (TTM)
- P/B Ratio
- EV/Revenue
- PEG Ratio (if available)
- Dividend Yield (%)

**Profitability:**
- Net Profit Margin (%)
- Operating Margin (%)
- EBITDA Margin (%)
- ROE (%)
- ROA (%)
- ROCE (%)

**Growth (YoY):**
- Revenue Growth (%)
- Profit Growth (%)
- EPS Growth (%)

**Strength:**
- Debt-to-Equity Ratio
- Current Ratio
- Quick Ratio
- Debt/EBITDA

**Cash Flow:**
- Operating Cash Flow
- Free Cash Flow
- FCF Yield (%)
- FCF to Net Income

Use color coding sparingly:
- Green: Above 5-year average or above industry median
- Red: Below 5-year average or below industry median
- Gray: No data or not applicable

### Historical Trends Visualization

Provide charts for 5-year and 10-year trends where data exists:

- Revenue growth (bar chart + trend line)
- Profit growth (bar chart + trend line)
- EPS growth (bar chart + trend line)
- Operating margin trend (line)
- ROE trend (line)
- ROCE trend (line)
- Debt trend (line or area)
- Free cash flow trend (bar)

All charts should be interactive (hover for values).

### Financial Statements

Display three core statements:

#### Income Statement (Latest 4-8 quarters)

Table format:
| Metric | Q1 | Q2 | Q3 | Q4 |
- Revenue
- EBITDA
- EBIT
- Tax
- Net Income
- EPS (Basic)
- EPS (Diluted)

Include YoY change %.

#### Balance Sheet (Latest 4 quarters)

| Item | Latest | -1Q | -2Q | -3Q |

**Assets:**
- Current Assets
- Non-current Assets
- Total Assets

**Liabilities:**
- Current Liabilities
- Non-current Liabilities
- Total Liabilities

**Equity:**
- Share Capital
- Reserves & Surplus
- Total Equity

#### Cash Flow (Latest 4 quarters)

| Item | Q1 | Q2 | Q3 | Q4 |

- Operating Cash Flow
- Investing Cash Flow
- Financing Cash Flow
- Free Cash Flow
- Change in Cash

### Metric Definitions

For every metric, provide:
- Definition (1-2 sentences)
- Why it matters (1 sentence)
- What's "good" (benchmarked to industry or historical)

Example:
> **ROE (Return on Equity):** Net Income / Average Equity. Measures how efficiently the company generates profit from shareholder capital.
>
> **Why it matters:** Higher ROE suggests better capital management.
>
> **Benchmark:** IT sector median: 18-22%. This company: 21% (above median).

---

# 10. Valuation Analysis

Provide neutral valuation information without bias.

### Core Valuation Metrics

| Metric | Value | Industry Median | 5Y Low | 5Y Avg | 5Y High | Assessment |
|--------|-------|-----------------|--------|--------|---------|------------|

Include:
- P/E Ratio
- P/B Ratio
- EV/EBITDA
- EV/Revenue
- PEG Ratio (if earnings growth data available)
- Dividend Yield
- Price-to-Sales
- Free Cash Flow Yield

### Valuation Context

For each key metric:

1. **Historical Range:** Show where current valuation sits within this company's 5-year range
2. **Peer Comparison:** Show where it sits versus industry/sector median
3. **Market Comparison:** Compare to market index (SENSEX, NIFTY)

### Valuation Visualization

> **Chart: P/E Ratio Over Time**

Line chart showing:
- Current P/E
- 5-year average P/E (horizontal line)
- Historical P/E range (shaded area)
- Sector median P/E (dashed line)

User can immediately see if valuation is above/below historical norms.

### Valuation Assessment Framework

Avoid saying "This stock is cheap/expensive."

Instead, present data:

> **P/E Analysis:**
> Current P/E: 24.5x
> 5-year average: 18.2x
> Sector median: 20.1x
>
> **Observation:** Trading above both historical and peer averages. May indicate:
> - Market pricing in future growth
> - Temporary premium in the sector
> - Reduced earnings due to cyclical factors
>
> Compare with recent earnings growth to assess reasonableness.

### Industry Comparison Table

Show top 10 peers ranked by P/E, P/B, and ROE.

Let the user decide if valuation is justified.

---

# 11. Technical Analysis

Create a dedicated technical-analysis section with structured presentation.

### Technical Summary Card

Quick at-a-glance assessment:

| Metric | Value | Signal |
|--------|-------|--------|
| Trend (50/200 MA) | Bullish | ⬆️ |
| Momentum (RSI) | 62 | Neutral |
| Volatility (ATR) | 1.2% | Moderate |
| Volume | Above 30-day avg | Positive |
| Support | ₹2,450 | |
| Resistance | ₹2,680 | |
| 52-week High | ₹2,750 | -2.6% away |
| 52-week Low | ₹2,100 | +14.3% away |

### Indicator Details

Each indicator should display:
1. **Current value**
2. **Reference level** (e.g., RSI overbought at 70)
3. **Historical context** (e.g., "Above 20-day average")
4. **Interpretation** (clear, non-predictive)

### Example Indicator Presentation

> **RSI (14): 58.2**
>
> Neutral zone (30-70 range). Neither overbought nor oversold.
>
> Historical context: Below the 20-day average of 62.1.
>
> **Note:** RSI does not predict future movement; it reflects recent price momentum.

### Support & Resistance

Display on chart:
- Previous swing lows (support)
- Previous swing highs (resistance)
- 52-week high/low
- Moving averages (act as dynamic support/resistance)

Label clearly as "derived from technical analysis" not "predicted levels."

### Trend Analysis

| Timeframe | Trend | MA Status | Observation |
|-----------|-------|-----------|-------------|
| Short-term (5D) | Up | 20 MA above 50 MA | Early uptrend |
| Medium-term (20D) | Neutral | 50 MA near 200 MA | Transition phase |
| Long-term (1Y) | Up | All MAs in order | Strong uptrend |

### Volume Analysis

- Current volume vs 20-day average
- Volume trend over time
- Volume spikes on specific dates (correlation with news)
- On-balance volume (OBV) trend

### Technical Observations Table

Show the most recent significant technical events:

| Date | Event | Price | Context |
|------|-------|-------|---------|
| Sep 20 | RSI crossed above 50 | ₹2,600 | Momentum shift |
| Sep 15 | Price broke above 20 MA | ₹2,580 | Trend confirmation |
| Sep 10 | Volume spike | ₹2,550 | Possible breakout |

### Warnings

Always include this disclaimer:

> **Technical analysis reflects historical price action, not future direction. Use in conjunction with fundamental analysis and never as the sole basis for decisions.**

---

# 12. Company Comparison

Allow users to compare multiple companies (2-5 at a time).

Example:

**TCS vs Infosys vs HCLTech vs TechM**

### Comparison Categories

Organize into logical groups:

**Price & Volume:**
- Current Price
- 52-week high/low
- Average Volume
- Market Capitalization

**Profitability:**
- Net Profit Margin
- Operating Margin
- ROE
- ROCE

**Growth (YoY):**
- Revenue Growth
- Profit Growth
- EPS Growth

**Valuation:**
- P/E Ratio
- P/B Ratio
- PEG Ratio
- EV/EBITDA

**Financial Health:**
- Debt-to-Equity
- Current Ratio
- Free Cash Flow

**Display format:**

Table with companies as columns, metrics as rows.

Color code deviations:
- Highest value in category: light green
- Lowest value in category: light red
- Others: neutral

Allow toggling visibility of metrics.

### Peer Ranking

Rank peers on key metrics:

| Rank | Company | P/E | ROE | FCF Yield |
|------|---------|-----|-----|-----------|
| 1 | TCS | 18.5 | 22% | 4.2% |
| 2 | Infosys | 19.2 | 21% | 3.8% |
| 3 | HCLTech | 21.3 | 19% | 3.1% |

### Comparison Chart Export

Allow users to:
- Export comparison as CSV
- Export as screenshot
- Save comparison to localStorage

---

# 13. Screener

Allow users to filter and discover stocks based on multiple criteria.

### Screener Builder

Drag-and-drop or form-based interface to build conditions:

**Market Cap:**
- [ ] Micro Cap (< ₹500 Cr)
- [ ] Small Cap (₹500 Cr - ₹5,000 Cr)
- [ ] Mid Cap (₹5,000 Cr - ₹20,000 Cr)
- [ ] Large Cap (> ₹20,000 Cr)

**Valuation:**
- P/E: [min] to [max]
- P/B: [min] to [max]
- PEG: [min] to [max]
- Dividend Yield: [min]%

**Growth:**
- Revenue Growth (YoY): [min]%
- Profit Growth (YoY): [min]%
- EPS Growth (YoY): [min]%

**Profitability:**
- Profit Margin: [min]%
- ROE: [min]%
- ROCE: [min]%

**Financial Health:**
- Debt-to-Equity: [max]
- Current Ratio: [min]
- Free Cash Flow: Positive / Negative

**Technical (Phase 2+):**
- Price above 50 MA: Yes / No
- RSI: [min] to [max]
- Volume above 20-day average: Yes / No

**Sector/Industry:**
- Multi-select dropdown

### Results Display

Show results in table format:

| Symbol | Name | Price | Change % | Market Cap | P/E | ROE | Trend |
|--------|------|-------|----------|------------|-----|-----|-------|
| TCS | Tata Consultancy | ₹2,600 | +1.2% | 28.5 Cr | 18.5 | 22% | ⬆️ |

Sortable by any column.
Limit to 50-100 results initially; paginate or virtualize for performance.

### Pre-built Screeners

Provide templates for common strategies:

- Value Stocks (Low P/E, High ROE)
- Growth Stocks (High growth, reasonable valuation)
- Dividend Stocks (High dividend yield, stable profits)
- Undervalued (Below 5-year P/E average)
- Quality (High ROCE, low debt)
- Momentum (Above 50 MA, volume spike)

Users can duplicate and customize templates.

### Save & Load Screeners

Store in localStorage:
- Screener name
- All conditions
- Results timestamp
- Sorting preference

Versioning: If conditions change format, auto-migrate or warn user.

---

# 14. Watchlist

Personal collection stored in localStorage.

### Watchlist Features

- Add/remove stocks
- Sort by price, change %, or custom order
- Add notes to individual stocks
- Set price alerts (localStorage, no backend)
- Export as CSV

### Watchlist Display

Show compact table:

| Symbol | Name | Price | Change | % | Last Update | Notes |
|--------|------|-------|--------|---|-------------|-------|
| TCS | TCS | ₹2,600 | +50 | +1.9% | 2 mins | Tech play |
| INFY | Infosys | ₹1,450 | -15 | -1.0% | 2 mins | |

### Price Alerts

Allow users to set:
- Alert when price crosses above [value]
- Alert when price crosses below [value]
- Alert on [% change] in one day

**Implementation:** Use browser notifications API (localStorage + periodic check against latest price).

Caveat: Alerts only work when browser tab is active.

---

# 15. News & Events

Research hub for market-moving information.

### News Feed

Aggregated from reliable sources:
- Official announcements
- Financial news agencies (Reuters, PTI, etc.)
- Company disclosures
- Regulatory filings

Display:
- Headline
- Source (with logo if possible)
- Date (relative: "2 hours ago")
- Snippet (150 chars max)
- Relevance score (if available)

### News Filtering

Filter by:
- Company (multi-select)
- Sector
- Date range
- Type (Results, Dividend, Corporate action, General news)

### Events Calendar

Major corporate events:

| Date | Company | Event | Impact |
|------|---------|-------|--------|
| Sep 25 | TCS | Q2 Results | Earnings |
| Oct 15 | INFY | AGM | Corporate |
| Nov 01 | RELIANCE | Dividend | Income |

Sortable and filterable by company/event type.

### News Research Assistant (AI)

Natural language interface to ask questions about news/data.

Examples:
> "Summarize recent news about TCS"
> "What's driving IT sector weakness?"
> "Compare guidance given by TCS vs Infosys"

See section #18 for AI implementation details.

---

# 16. AI Research Assistant

Conversational interface for financial research queries.

### Research Query Examples

> "Analyze TCS revenue growth over the last five years."

> "Compare TCS and Infosys based on growth, margins, ROCE and valuation."

> "What changed in the latest quarterly results?"

> "Summarize recent news affecting this company."

> "Explain why this company's debt increased."

> "Which IT companies have P/E below 20?"

> "What's the trend in healthcare sector margins?"

### AI Implementation

The AI assistant should:

1. **Retrieve structured data** (from backend API)
2. **Retrieve news/documents** (from news archive)
3. **Distinguish data from interpretation** (clearly label each)
4. **Show relevant numbers** (with sources)
5. **Provide source attribution** (which API/document)
6. **Avoid false data** (explicitly state if data is unavailable)
7. **Avoid predictions** (never claim to know future movement)

### Conversation History

Store recent queries in localStorage (last 10-20 conversations).

Allow users to:
- Clear history
- Export conversation as markdown
- Save specific responses

### Assistant Scope Limitations

The assistant must NOT:
- Provide personalized investment advice
- Suggest buy/sell decisions
- Claim certainty about future performance
- Invent missing data
- Cite sources that don't exist

The assistant SHOULD:
- Provide factual analysis
- Highlight data gaps
- Suggest where to find more information
- Compare multiple perspectives

---

# 17. Economic Calendar (Phase 3+)

Display major economic events and indicators.

### Event Display

| Date | Time | Country | Event | Forecast | Previous | Actual |
|------|------|---------|-------|----------|----------|--------|
| Sep 25 | 09:30 | India | PMI Mfg | 52.1 | 52.3 | - |
| Sep 26 | 14:30 | USA | CPI | 3.2% | 3.4% | - |

Filter by:
- Country
- Importance (High/Medium/Low)
- Impact level (expected movement)
- Sector relevance

### Economic Indicator Charts

Show historical trends:
- CPI, Inflation
- Interest rates
- GDP growth
- Unemployment

Correlation with market indices.

---

# 18. Historical Analysis / Backtesting (Phase 4+)

Allow users to test analytical strategies against historical data.

Example:

**Strategy:** "50 EMA crosses above 200 EMA"

### Backtest Results Display

- **Number of signals:** 23 times in the period
- **Win rate:** 65% (15 winning signals, 8 losing)
- **Average return per signal:** +2.3%
- **Best trade:** +8.5%
- **Worst trade:** -4.2%
- **Max drawdown:** -12.3%
- **Cumulative return:** +52.3%
- **Volatility (annual):** 14.2%
- **Sharpe ratio:** 1.2

### Signal Dates Table

| Date | Signal | Price | Next Return | Outcome |
|------|--------|-------|-------------|---------|
| Jan 15 | Buy | 2450 | +5.2% | Win |
| Feb 20 | Buy | 2600 | -2.1% | Loss |

### Equity Curve

Chart showing cumulative returns over the backtest period.

### Important Caveats

> **Backtest results are historical only. They do not guarantee future performance. Past performance is not indicative of future results. Backtests assume perfect execution and no slippage.**

---

# 19. Portfolio Analysis Without Trading (Phase 4+)

Optional future feature for tracking hypothetical holdings.

Users should NOT need a broker account.

A user can manually enter holdings locally:

- Symbol
- Quantity
- Average buy price

### Portfolio Calculations

The application calculates:

- **Current Value:** Current price × Quantity
- **Cost Basis:** Buy price × Quantity
- **Unrealized P/L:** Current value - Cost basis
- **Return %:** P/L / Cost basis
- **Allocation %:** Holding value / Total portfolio
- **Sector Allocation:** Aggregated sector weightage

### Portfolio Dashboard

Display:

- Portfolio value (total)
- Unrealized P/L (absolute and %)
- Holdings table
- Sector breakdown chart
- Performance chart
- Top performers / Worst performers

### Important Disclaimer

> **This is a hypothetical portfolio tracker for analysis only. It does not represent actual holdings or transactions. No real money is involved.**

---

# 20. Free Infrastructure Requirements

The entire initial project must be designed to run on free tiers.

### Target Architecture

## Frontend Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **UI Library:** React 18+
- **Styling:** Tailwind CSS
- **State Management:** TanStack Query (React Query) for server state
- **Chart:** TradingView Lightweight Charts or Chart.js
- **Charting library considerations:**
  - TradingView Lightweight Charts: Better for financial charts, smaller bundle
  - Chart.js: More flexible, better for non-chart visualizations

**Hosting:**
- **Vercel free tier** (recommended for Next.js)
- Alternative: Netlify free tier

**Performance targets:**
- Core Web Vitals: Green on Lighthouse
- Build time: < 60 seconds
- Page size: < 200 KB (gzipped)

## Backend Stack

- **Framework:** FastAPI (Python)
- **Language:** Python 3.11+
- **Database:** PostgreSQL (if needed) via Supabase free tier
- **Caching:** Redis (optional, via Render/Railway free tier)
- **Queue:** Celery (optional, only if background jobs needed)

**Hosting:**
- **Render.com** free tier (Python/FastAPI)
- Alternative: Railway.app free tier
- Alternative: Fly.io (requires credit card but very cheap)

**Important:** Account for cold start times. Design endpoints to return quickly even on first call.

## Database Strategy

Use PostgreSQL only if actually needed.

Potential database uses:
- Market data cache (OHLCV)
- Financial metrics cache (fundamentals)
- News metadata index
- Shared application data (sectors, stock lists)

**Do NOT create:**
- User database (no accounts)
- Transaction logs (no trading)
- Personal data storage

**Cache strategy:**
- Cache market data for 24 hours (refresh nightly)
- Cache fundamentals for 7 days (refresh after earnings)
- Cache news index for 48 hours
- Use ETag-based updates where possible

### Caching Implementation

**Client-side (localStorage):**
- Watchlist
- UI preferences
- Search history
- Screener filters
- Alerts

**Server-side (Redis or database):**
- Market OHLCV data
- Fundamental metrics
- Technicals (precomputed)
- News index

**HTTP caching (ETags, Cache-Control):**
- Static assets: 1 year
- API responses: depends on data freshness
  - Real-time data: 1-2 minutes
  - Daily data: 24 hours
  - Fundamentals: 7 days

### Deployment & Scaling

**Free tier constraints:**
- Vercel: ~12 deployments/day limit (reasonable)
- Render: ~750 hours/month (full-time deployment requires paid plan; free tier sleeps after 15 min inactivity)
- Railway: $5/month credit (generous)

**Cold start mitigation:**
- Implement health checks
- Warm up backend on scheduled intervals
- Return cached data immediately; update in background

---

# 21. Data Architecture

Market data is the most critical external dependency.

### Data Service Abstraction

Create a unified interface that abstracts data providers:

```text
MarketDataService (Python/FastAPI)
    |
    ├── StockDataProvider (Historical + real-time)
    │   ├── Adapter: YahooFinance
    │   ├── Adapter: AlphaVantage
    │   └── Adapter: NSE/BSE (if accessible)
    |
    ├── FundamentalDataProvider
    │   ├── Adapter: Financial Modelling Prep
    │   ├── Adapter: RapidAPI (aggregator)
    │   └── Adapter: Company disclosures (web scrape)
    |
    ├── NewsDataProvider
    │   ├── Adapter: NewsAPI
    │   ├── Adapter: Finnhub
    │   └── Adapter: Economic Times (scrape)
    |
    └── EconomicDataProvider
        ├── Adapter: World Bank API
        ├── Adapter: RBI data
        └── Adapter: Trading Economics
```

**Rule:** Frontend must NEVER depend directly on third-party APIs.

### Data Normalization

Backend should normalize all provider responses into consistent internal schemas.

Example: Stock Quote Schema

```json
{
  "symbol": "TCS",
  "name": "Tata Consultancy Services",
  "exchange": "NSE",
  "currency": "INR",
  "price_current": 2600.50,
  "price_open": 2580.00,
  "price_high": 2610.00,
  "price_low": 2570.00,
  "volume": 2500000,
  "change_absolute": 50.50,
  "change_percent": 1.97,
  "timestamp": "2024-09-24T15:30:00Z",
  "market_status": "OPEN",
  "previous_close": 2550.00
}
```

### API Endpoint Structure

Frontend interacts with backend via these endpoints:

```
GET  /api/v1/stocks/{symbol}
     Returns current quote

GET  /api/v1/stocks/{symbol}/history
     ?start=2024-01-01&end=2024-09-24&interval=daily
     Returns OHLCV data

GET  /api/v1/stocks/{symbol}/fundamentals
     Returns financial metrics and ratios

GET  /api/v1/stocks/{symbol}/technicals
     ?interval=daily
     Returns precomputed technicals

GET  /api/v1/stocks/{symbol}/news
     ?limit=20
     Returns recent news

GET  /api/v1/markets
     Returns major indices snapshot

GET  /api/v1/screener
     ?criteria=...&sort=pe&limit=50
     Returns filtered stocks

POST /api/v1/research
     ?query=...
     Calls AI research endpoint

GET  /api/v1/economic/calendar
     Returns upcoming economic events
```

### Rate Limiting Strategy

Free-tier APIs have strict limits. Example:

| Endpoint | Limit | Strategy |
|----------|-------|----------|
| Stock quote | 500/day (YahooFinance) | Cache aggressively; batch requests |
| Fundamentals | 100/day (FMP) | Cache for 7 days |
| News | 100/day (NewsAPI) | Cache for 48 hours |

**User-side rate limiting:**
- Search: debounce to 500ms
- Chart zoom: debounce to 100ms
- Screener results: paginate (20 results per page)

---

# 22. Provider Selection & Fallback Strategy

### Stock Data Providers

| Provider | Coverage | Freshness | Cost | Notes |
|----------|----------|-----------|------|-------|
| **YahooFinance** | Global + India | 15-20 min delay | Free | Reliable; Python wrapper available |
| **AlphaVantage** | Global | 1 min delay | Free tier: 5 calls/min | Great for US; Limited India coverage |
| **NSE/BSE APIs** | India only | Real-time | Free | If accessible; may require scraping |
| **IEX Cloud** | Global + India | Real-time | Free tier exists | Good but may have limits |

**Recommendation:** Start with YahooFinance (reliable, good coverage); add AlphaVantage as fallback.

### Fundamental Data Providers

| Provider | Coverage | Freshness | Cost | Notes |
|----------|----------|-----------|------|-------|
| **Financial Modelling Prep** | Global | Quarterly | Free tier: 250/month | Excellent fundamentals API |
| **RapidAPI** | Various | Variable | Free tier exists | Aggregates multiple sources |
| **Company Disclosures** | India (NSE/BSE) | After filing | Free | Web scraping required |
| **Seeking Alpha** | Global | Real-time | Free (basic) | Requires scraping |

**Recommendation:** Use FMP as primary; scrape NSE/BSE filings as supplement.

### News Providers

| Provider | Coverage | Freshness | Cost | Notes |
|----------|----------|-----------|------|-------|
| **NewsAPI** | Global | Real-time | Free: 100/day | Aggregates major sources |
| **Finnhub** | Global + India | Real-time | Free: 60/min | Good company-specific news |
| **Economic Times API** | India | Real-time | Limited free | Direct Indian coverage |
| **RSS feeds** | Various | Variable | Free | Economic Times, BSE, NSE |

**Recommendation:** Combine NewsAPI (breadth) + Finnhub (depth) + RSS feeds (direct).

---

# 23. Frontend State Management

### State Layer Architecture

```
Component Tree
    |
    └─ TanStack Query (React Query)
        ├── Server State (from /api/*)
        │   ├── Stock quotes
        │   ├── Historical data
        │   ├── Fundamentals
        │   └── News
        │
        └─ localStorage
            ├── Client State (UI preferences)
            │   ├── Theme (dark/light)
            │   ├── Sidebar collapsed
            │   └── Visible metrics
            │
            ├── User Data (local-only)
            │   ├── Watchlist
            │   ├── Saved screeners
            │   ├── Alerts
            │   └── Portfolio
            │
            └─ Cache Invalidation
                ├── Stale time: 1-60 seconds
                ├── Cache time: 5-60 minutes
                └─ Background refetch: Yes
```

### Caching Strategy

```typescript
// Example React Query setup

const stockQuoteQuery = {
  queryKey: ['stock', symbol],
  queryFn: () => fetchStock(symbol),
  staleTime: 60 * 1000,      // 1 minute
  gcTime: 30 * 60 * 1000,    // 30 minutes (formerly cacheTime)
  refetchOnWindowFocus: false,
  refetchOnMount: true
};

const historicalDataQuery = {
  queryKey: ['stock', symbol, 'history', interval],
  queryFn: () => fetchHistory(symbol, interval),
  staleTime: 24 * 60 * 60 * 1000,  // 1 day
  gcTime: 7 * 24 * 60 * 60 * 1000  // 7 days
};
```

### localStorage Data Structure

```json
{
  "app_version": "1.0.0",
  "watchlist": [
    {
      "symbol": "TCS",
      "added_date": "2024-09-01",
      "notes": "Tech leader"
    }
  ],
  "saved_screeners": [
    {
      "id": "screener_1",
      "name": "Value Stocks",
      "criteria": { "pe_max": 20, "roe_min": 15 },
      "last_run": "2024-09-24"
    }
  ],
  "alerts": [
    {
      "symbol": "TCS",
      "type": "price_above",
      "value": 2700,
      "triggered": false
    }
  ],
  "ui_prefs": {
    "theme": "dark",
    "sidebar_collapsed": false,
    "visible_columns": ["symbol", "price", "change"]
  }
}
```

---

# 24. Backend Data Flow

### Request/Response Flow

```
1. Frontend sends: GET /api/v1/stocks/TCS

2. Backend handler checks cache:
   - Cache hit? Return immediately
   - Cache miss? Proceed to step 3

3. Backend calls MarketDataService:
   - Try primary provider (YahooFinance)
   - On failure, try secondary provider (AlphaVantage)
   - On both failure, return cached data if available
   - On complete failure, return 503 Service Unavailable

4. Backend normalizes response → internal schema

5. Backend caches result (Redis or database)
   - TTL: 1 hour for quotes, 24 hours for history

6. Backend returns normalized JSON to frontend

7. Frontend caches in React Query
   - Stale time: 60s
   - Cache time: 30 minutes

8. Component renders from React Query cache
```

### Error Handling

```python
# Backend error handling pseudocode

def get_stock_quote(symbol: str):
    # Check database cache
    if cache.exists(f"quote:{symbol}"):
        return cache.get(f"quote:{symbol}")
    
    try:
        # Try primary provider
        quote = yahoo_finance.get_quote(symbol)
    except ProviderError:
        try:
            # Try secondary provider
            quote = alpha_vantage.get_quote(symbol)
        except ProviderError:
            # Return stale cache if available
            stale = cache.get_stale(f"quote:{symbol}")
            if stale:
                return {
                    **stale,
                    "is_delayed": True,
                    "delay_reason": "Data provider unavailable"
                }
            else:
                raise DataUnavailableError()
    
    # Cache result
    cache.set(f"quote:{symbol}", quote, ttl=3600)
    return quote
```

---

# 25. Performance Requirements

The application should feel fast.

### Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| **Time to Interactive (TTI)** | < 3.0s | Lighthouse |
| **Largest Contentful Paint (LCP)** | < 2.5s | Lighthouse |
| **Cumulative Layout Shift (CLS)** | < 0.1 | Lighthouse |
| **First Input Delay (FID)** | < 100ms | Lighthouse |
| **Chart interaction response** | < 100ms | Custom |
| **Search typeahead** | < 200ms | Custom |
| **Page navigation** | Instant | React Router |

### Performance Optimizations

#### Frontend

- **Code splitting:** Route-based and component-based
- **Lazy loading:** Images with next/image; components with React.lazy
- **Server-side rendering:** Use Next.js App Router SSR for homepage/stock pages
- **Skeleton loaders:** Show loading placeholders, not spinners
- **Debouncing:** Search (500ms), chart zoom (100ms)
- **Pagination:** Screener results (20 per page), watchlist virtual scroll
- **Chart rendering:** Use canvas-based library; virtualize candles
- **CSS-in-JS:** Avoid runtime CSS; use Tailwind for build-time CSS
- **Bundle analysis:** Monitor with next/bundle-analyzer
- **Image optimization:** SVG for icons/diagrams; WebP for screenshots

#### Backend

- **Database indexing:** Index frequently-queried fields (symbol, date)
- **Query optimization:** Use appropriate joins; avoid N+1 queries
- **Connection pooling:** Pool database connections
- **Rate limiting:** Prevent provider abuse
- **Caching layers:** Redis for hot data
- **Async operations:** Background jobs for bulk data fetches
- **Compression:** Gzip responses (FastAPI middleware)

#### Network

- **CDN:** Vercel CDN for frontend assets (automatic)
- **HTTP caching:** Cache headers on static + API responses
- **Compression:** Brotli for text, WebP for images
- **Lazy loading:** Progressive enhancement (load chart after content)

### Lighthouse Audit Targets

- Performance: > 85
- Accessibility: > 85
- Best Practices: > 90
- SEO: > 90

---

# 26. UI/UX Direction

The visual design should feel:

- Professional
- Modern
- Financial (think Bloomberg, not Robinhood)
- Clean
- Dense but readable (charts and tables are priority)
- Data-driven
- Responsive
- Desktop-first but mobile-friendly

Avoid:

- Generic dashboard templates
- Excessive gradients or shadows
- Huge rounded cards everywhere
- Random AI-generated decorative graphics
- Excessive animations or transitions
- Fake metrics or placeholder data
- Clutter or information overload

Use hierarchy and whitespace intelligently.

Charts and tables should be the visual focus.

### Color Palette

**Light Mode:**
- Background: #FFFFFF
- Surface: #F5F5F5
- Border: #E0E0E0
- Text primary: #1F2937
- Text secondary: #6B7280
- Positive: #10B981
- Negative: #EF4444
- Neutral: #6B7280

**Dark Mode:**
- Background: #0F172A
- Surface: #1E293B
- Border: #334155
- Text primary: #F1F5F9
- Text secondary: #94A3B8
- Positive: #10B981
- Negative: #F87171
- Neutral: #94A3B8

### Typography

- **Headlines:** Inter or Outfit (geometric, modern)
- **Body:** Inter (clean, professional)
- **Monospace:** Fira Code or JetBrains Mono (for numbers/data)
- **Font sizes:** 12px (small), 14px (body), 16px (lead), 18px (H3), 20px (H2), 24px+ (H1)

### Component Library

Build lightweight components:
- Card, Button, Input, Select, Modal
- Chart (wrapping lightweight-charts)
- Table (with sorting, filtering)
- Tabs, Badge, Tooltip
- Alert (for errors/warnings)
- Skeleton (for loading states)

Avoid bloated UI libraries; build what you need.

### Spacing & Layout

Use 8px grid system:
- Padding: 8px, 16px, 24px, 32px
- Gaps: 8px (tight), 16px (normal), 24px (loose)
- Max width: 1200px (desktop)

---

# 27. Responsive Design

Desktop is the primary target.

Must still work on:

- Laptop (1366px+)
- Tablet (768px - 1024px)
- Mobile (320px - 480px)

### Breakpoints

```typescript
const breakpoints = {
  sm: 640,    // Small devices
  md: 768,    // Tablets
  lg: 1024,   // Laptops
  xl: 1280,   // Large screens
  '2xl': 1536 // Ultra-wide
};
```

### Mobile Strategy

On mobile (< 768px):

- **Navigation:** Hamburger menu; no logo in header
- **Charts:** Single chart per screen; pinch to zoom
- **Tables:** Horizontal scroll or card layout (one security per card)
- **Columns:** Hide non-critical columns (show Symbol, Price, Change only)
- **Metrics:** Display in card rows, not table
- **Tabs:** Sticky navigation; allow swipe
- **Watchlist:** Vertical list with large touch targets

On tablet (768px - 1024px):

- **Navigation:** Top menu + sidebar on demand
- **Columns:** Show primary metrics; hide secondaries
- **Layout:** 2-column where appropriate
- **Charts:** Slightly smaller but full functionality

---

# 28. Error Handling & Data Validation

Never show fake data.

### API Error Responses

Backend should return consistent error format:

```json
{
  "error": {
    "code": "STOCK_NOT_FOUND",
    "message": "Stock symbol not found",
    "status": 404,
    "suggestion": "Try searching for INFY, TCS, or RELIANCE"
  }
}
```

### Common Error Cases

| Case | HTTP Status | Message | Suggestion |
|------|------------|---------|-----------|
| Stock not found | 404 | "Symbol not recognized" | "Try a valid NSE symbol" |
| Provider unavailable | 503 | "Data temporarily unavailable" | "Retry in a few minutes" |
| Rate limit exceeded | 429 | "Too many requests" | "Please wait before retry" |
| Invalid parameters | 400 | "Invalid query parameters" | "Check your input and retry" |
| Data not yet available | 204 | "Data unavailable" | "Fundamentals updated quarterly" |

### Handling Missing Data

If a metric does not exist or is unavailable:

Show: `N/A` or `—` (dash)

Not: Empty string, 0, "Unknown"

Example:
```
P/E Ratio: N/A (Company not yet profitable)
EPS: N/A (Awaiting quarterly results)
Dividend Yield: — (No dividend paid)
```

### Delayed Data Indicator

If data is not real-time, clearly indicate delay:

```
Stock Price: ₹2,600 (as of 15:30, 2 hours delayed)
Fundamentals: Last updated 2024-09-20 (EOD)
News: Updated 10 minutes ago
```

### Client-side Validation

Validate before sending to backend:

```typescript
function validateStockSymbol(symbol: string): string | null {
  const trimmed = symbol.trim().toUpperCase();
  
  if (!trimmed) return "Symbol required";
  if (trimmed.length > 10) return "Symbol too long";
  if (!/^[A-Z0-9&\-]+$/.test(trimmed)) return "Invalid characters";
  
  return null; // Valid
}
```

---

# 29. Financial Data Disclaimer

The website should clearly state its purpose and limitations.

### Suggested Disclaimer Language

Place on homepage footer + each data section:

> **Important:** This platform provides financial information and analytical tools for research and educational purposes only. It is not an investment advisor, and we do not provide personalized financial advice.
>
> - Market data may be delayed or subject to provider limitations.
> - Nothing on this platform constitutes an instruction to buy or sell any security.
> - Past performance does not guarantee future results.
> - All analysis is based on historical data and may not reflect future conditions.
> - Consult with a qualified financial advisor before making investment decisions.

### Terms of Service Summary

Must include:

- Non-binding analysis only
- No liability for decisions made based on information
- No trading functionality
- Educational use only
- No personal advice

---

# 30. Security

Even without user accounts, implement strong security:

### API Security

- **Input validation:** Validate all user inputs (symbols, date ranges, screener criteria)
- **Sanitize queries:** Prevent injection attacks (SQL, NoSQL)
- **Rate limiting:** Limit requests per IP (e.g., 100 requests/hour)
- **API keys:** Store backend API keys in environment variables (.env)
  - Never expose in frontend code
  - Never commit to repository
- **HTTPS only:** Enforce TLS 1.3+

### External API Integration

- **Validate responses:** Ensure returned data matches expected schema
- **Timeout protection:** Set max timeout (10s) on all external calls
- **Prevent SSRF:** Don't allow user-controlled URLs in requests
- **Circuit breaker:** Stop calling failing providers after N failures

### Frontend Security

- **XSS prevention:** Sanitize all user-generated content (notes, alerts)
- **CSP headers:** Restrict script sources
- **CORS:** Only allow frontend domain
- **localStorage:** Don't store sensitive data (user would have it locally anyway, but no backend secrets)

### Monitoring & Logging

- Log all API calls (for debugging, not user tracking)
- Monitor error rates per provider
- Alert on unusual patterns (e.g., 1000 requests from one IP)
- Sanitize logs (never log full API responses)

### Example Security Checklist

- [ ] All API keys in environment variables
- [ ] Input validation on all endpoints
- [ ] Rate limiting implemented
- [ ] HTTPS enforced
- [ ] CORS headers set correctly
- [ ] Errors don't expose internal details
- [ ] Secrets not in version control
- [ ] Dependencies audited for vulnerabilities

---

# 31. Development Strategy

Do NOT build the entire application in one pass.

Build in phases, with each phase stable before moving to the next.

### Phase 1 — Foundation (Weeks 1-2)

Deliverables:

- Project setup (Next.js + FastAPI)
- Basic routing & navigation
- Design system (colors, typography, components)
- Homepage layout (static)
- Stock search (typeahead)
- Stock page template (with tabs)

No external APIs yet. Use mock data.

### Phase 2 — Core Analysis (Weeks 3-4)

Integrate first data source (YahooFinance):

- Historical price data (OHLCV)
- Interactive chart (candlestick + line)
- Technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands)
- Volume chart
- Responsive chart behavior

Test with 5-10 major stocks.

### Phase 3 — Fundamentals (Weeks 5-6)

Integrate fundamentals provider (Financial Modelling Prep):

- Company metrics (P/E, P/B, ROE, ROCE, etc.)
- Income statement (quarterly)
- Balance sheet
- Cash flow statement
- Historical trends (charts)
- Valuation analysis

### Phase 4 — Discovery (Weeks 7-8)

- Screener (filter by P/E, ROE, etc.)
- Market explorer (sector pages, index components)
- Company comparison (2-5 companies side-by-side)
- Watchlist (localStorage)
- Market movers (gainers, losers, active)

### Phase 5 — Research (Weeks 9-10)

- News feed integration (NewsAPI or Finnhub)
- News filtering & search
- AI research assistant (Claude API via backend)
- Economic calendar (optional)

### Phase 6 — Polish & Deploy (Weeks 11-12)

- Performance optimization
- Mobile responsiveness testing
- Lighthouse audit & fixes
- Error handling edge cases
- Deployment to Vercel + Render
- Documentation

### Phase 7+ — Advanced Features (Optional)

- Backtesting
- Alerts
- Portfolio tracker
- Advanced chart tools (drawing, annotations)
- More technical indicators

---

# 32. Code Quality & Maintainability

The project must be maintainable and extensible.

### Do NOT

- Put the entire application in one file
- Duplicate API logic (create service layers)
- Hard-code stock data or financial values
- Put API keys in frontend code
- Create unnecessary abstractions (YAGNI principle)
- Generate huge components (split into smaller, reusable pieces)
- Leave dead code
- Add dependencies without justification

### DO

- Use clear module boundaries
- Separate concerns (UI, API, business logic)
- Follow consistent naming conventions
- Write comments for complex logic only (code is self-documenting)
- Use TypeScript strictly (no `any` types)
- Create reusable utility functions
- Document API contracts (response schemas)

### Example: Service Layer

```typescript
// lib/services/stockService.ts

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

export const getStockQuote = async (symbol: string): Promise<StockQuote> => {
  const response = await fetch(`/api/v1/stocks/${symbol}`);
  if (!response.ok) throw new Error(`Stock not found: ${symbol}`);
  return response.json();
};

export const getStockHistory = async (
  symbol: string,
  start: Date,
  end: Date
): Promise<OHLCV[]> => {
  const response = await fetch(
    `/api/v1/stocks/${symbol}/history?start=${start}&end=${end}`
  );
  if (!response.ok) throw new Error(`History not available: ${symbol}`);
  return response.json();
};
```

Usage in component:

```typescript
// components/StockChart.tsx

export const StockChart = ({ symbol }: { symbol: string }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stock', symbol],
    queryFn: () => getStockQuote(symbol)
  });

  if (isLoading) return <ChartSkeleton />;
  if (error) return <Error message="Failed to load stock data" />;
  
  return <Chart data={data} />;
};
```

### Testing Strategy

Minimum coverage:

- **Unit tests:** Utility functions, services (80% coverage)
- **Integration tests:** API endpoints, database queries (60% coverage)
- **E2E tests:** Critical user flows (search → view → compare)
- **Visual regression:** Chart rendering, responsive layouts

Tools:
- Jest (unit tests)
- Pytest (backend unit tests)
- Playwright (E2E tests)
- Percy or Chromatic (visual regression)

---

# 33. Repository Structure

```
financial-analysis-platform/
│
├── frontend/
│   ├── app/
│   │   ├── (home)/
│   │   │   └── page.tsx
│   │   ├── stocks/
│   │   │   └── [symbol]/
│   │   │       └── page.tsx
│   │   ├── screener/
│   │   │   └── page.tsx
│   │   ├── compare/
│   │   │   └── page.tsx
│   │   ├── watchlist/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── Card.tsx
│   │   │   └── Button.tsx
│   │   │
│   │   ├── features/
│   │   │   ├── StockChart.tsx
│   │   │   ├── TechnicalAnalysis.tsx
│   │   │   ├── FundamentalMetrics.tsx
│   │   │   ├── NewsCard.tsx
│   │   │   └── Screener.tsx
│   │   │
│   │   └── skeletons/
│   │       ├── ChartSkeleton.tsx
│   │       └── TableSkeleton.tsx
│   │
│   ├── lib/
│   │   ├── services/
│   │   │   ├── stockService.ts
│   │   │   ├── fundamentalService.ts
│   │   │   ├── newsService.ts
│   │   │   └── screenerService.ts
│   │   │
│   │   ├── hooks/
│   │   │   ├── useStockData.ts
│   │   │   ├── useWatchlist.ts
│   │   │   └── useLocalStorage.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── formatters.ts (price, percentage formatting)
│   │   │   ├── validators.ts (symbol validation)
│   │   │   └── dates.ts (date utilities)
│   │   │
│   │   └── api.ts (fetch wrapper with error handling)
│   │
│   ├── types/
│   │   ├── stock.ts
│   │   ├── fundamentals.ts
│   │   ├── chart.ts
│   │   └── api.ts
│   │
│   ├── styles/
│   │   ├── tailwind.config.ts
│   │   └── theme.css
│   │
│   ├── __tests__/
│   │   ├── services/
│   │   └── components/
│   │
│   ├── .env.local.example
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── settings.py (configuration)
│   │   │
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── stocks.py
│   │   │   │   ├── fundamentals.py
│   │   │   │   ├── news.py
│   │   │   │   ├── screener.py
│   │   │   │   ├── markets.py
│   │   │   │   └── research.py
│   │   │   │
│   │   │   └── middleware.py (rate limiting, CORS)
│   │   │
│   │   ├── services/
│   │   │   ├── market_data_service.py
│   │   │   ├── fundamental_service.py
│   │   │   ├── news_service.py
│   │   │   └── screener_service.py
│   │   │
│   │   ├── providers/
│   │   │   ├── base.py (abstract provider)
│   │   │   ├── yahoo_finance.py
│   │   │   ├── alpha_vantage.py
│   │   │   ├── fmp.py (Financial Modelling Prep)
│   │   │   ├── newsapi.py
│   │   │   ├── finnhub.py
│   │   │   └── fallback.py (cached/stale data)
│   │   │
│   │   ├── models/
│   │   │   ├── stock.py
│   │   │   ├── fundamental.py
│   │   │   ├── news.py
│   │   │   └── cache.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── stock.py (Pydantic models)
│   │   │   ├── fundamental.py
│   │   │   └── error.py
│   │   │
│   │   ├── indicators/
│   │   │   ├── sma.py
│   │   │   ├── ema.py
│   │   │   ├── rsi.py
│   │   │   ├── macd.py
│   │   │   ├── bollinger.py
│   │   │   └── vwap.py
│   │   │
│   │   ├── screener/
│   │   │   ├── filters.py (P/E, ROE, etc.)
│   │   │   ├── builders.py (query building)
│   │   │   └── validators.py
│   │   │
│   │   ├── ai/
│   │   │   ├── research_assistant.py
│   │   │   └── prompt_templates.py
│   │   │
│   │   ├── cache/
│   │   │   ├── redis.py
│   │   │   ├── database.py
│   │   │   └── decorators.py
│   │   │
│   │   └── core/
│   │       ├── config.py
│   │       ├── logger.py
│   │       └── exceptions.py
│   │
│   ├── tests/
│   │   ├── test_providers/
│   │   ├── test_services/
│   │   ├── test_routes/
│   │   ├── test_indicators/
│   │   └── conftest.py
│   │
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile (for deployment)
│   └── README.md
│
├── docs/
│   ├── API.md (endpoint documentation)
│   ├── ARCHITECTURE.md (system design)
│   ├── SETUP.md (local development)
│   ├── DEPLOYMENT.md (Vercel + Render)
│   └── DATA_SOURCES.md (provider info)
│
├── .gitignore
├── README.md (project overview)
└── CONTRIBUTING.md (guidelines)
```

---

# 34. Critical Development Rule

Before implementing a feature, ask:

1. **Does this support financial analysis?** (Core product?)
2. **Can it run within free infrastructure?** (No large storage/compute?)
3. **Is the required data legally/technically obtainable?** (Scraping allowed? APIs available?)
4. **Does it improve the user's research workflow?** (Essential or nice-to-have?)
5. **Can it be implemented without requiring an account?** (Stateless or localStorage?)
6. **Does it introduce unnecessary complexity?** (MVP rule?)

If the answer to most of these is **no**, do not add the feature.

**Corollary:** Be ruthless about scope. Perfect core features > mediocre everything.

---

# 35. Definition of Success

The final application should allow a user to:

**Open the site → Search any stock → Inspect price history with technicals → Inspect fundamentals → Evaluate valuation → Compare peers → Read news → Run screeners → Save locally → Research with AI — all without logging in and without trading.**

### Success Criteria

- [ ] No authentication required
- [ ] No trading or broker integration
- [ ] Launches in < 3 seconds
- [ ] Search results in < 1 second
- [ ] Charts interactive and smooth
- [ ] Mobile-friendly (works on phones)
- [ ] All core features (chart, technicals, fundamentals, comparison) functional
- [ ] Watchlist and screeners save to localStorage
- [ ] AI research assistant works
- [ ] Data never fake or hallucinated
- [ ] Financial disclaimer prominently visible
- [ ] Lighthouse scores: Performance > 85, Accessibility > 85
- [ ] Runs entirely on free tiers (Vercel + Render)
- [ ] Code is maintainable and well-documented

### Final Vision

> **Build a powerful, professional financial analysis terminal, not a trading platform.**
>
> **No account. No broker. No trade execution. No fake data.**
>
> **Just a fast, clean, research-first web application for serious market analysis.**

---

# 36. Implementation Checklist

### Pre-development

- [ ] Finalize tech stack (Next.js, FastAPI, React Query, TradingView Charts)
- [ ] Choose data providers (YahooFinance, FMP, NewsAPI, Finnhub)
- [ ] Set up GitHub repository
- [ ] Obtain free-tier API keys
- [ ] Create design system (Figma or Excalidraw)

### Phase 1: Foundation

- [ ] Initialize Next.js project
- [ ] Initialize FastAPI backend
- [ ] Set up TypeScript, ESLint, Prettier
- [ ] Create reusable component library
- [ ] Build homepage layout
- [ ] Implement stock search with typeahead
- [ ] Create stock page template with tabs
- [ ] Set up routing for all major pages
- [ ] Add theme toggle (dark/light)
- [ ] Responsive design testing

### Phase 2: Data Integration

- [ ] Integrate YahooFinance provider
- [ ] Build /api/v1/stocks/{symbol} endpoint
- [ ] Build /api/v1/stocks/{symbol}/history endpoint
- [ ] Create Chart component (TradingView Lightweight Charts)
- [ ] Implement technical indicators (SMA, EMA, RSI, MACD)
- [ ] Add volume chart
- [ ] Cache strategy (Redis/database)
- [ ] Error handling for provider failures

### Phase 3: Fundamentals

- [ ] Integrate FMP provider
- [ ] Build fundamentals API endpoints
- [ ] Create Fundamentals tab (metrics display)
- [ ] Create Income Statement view
- [ ] Create Balance Sheet view
- [ ] Create Cash Flow view
- [ ] Historical trends charts
- [ ] Valuation section

### Phase 4: Discovery

- [ ] Build screener backend logic
- [ ] Implement screener filters (P/E, ROE, growth, etc.)
- [ ] Create Screener UI
- [ ] Market movers (top gainers, losers, active)
- [ ] Comparison feature (2-5 stocks)
- [ ] Watchlist (localStorage)

### Phase 5: Research

- [ ] Integrate news provider (NewsAPI)
- [ ] News feed UI
- [ ] News filtering and search
- [ ] Set up Claude API integration (via backend)
- [ ] AI research assistant UI
- [ ] Conversation history (localStorage)

### Phase 6: Polish & Deploy

- [ ] Lighthouse optimization
- [ ] Mobile responsiveness audit
- [ ] Error handling edge cases
- [ ] Add financial disclaimer
- [ ] Security audit (rate limiting, input validation)
- [ ] Documentation (API, setup, deployment)
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Render
- [ ] Test across browsers and devices
- [ ] Performance monitoring setup

---

# 37. Important Reminders

### For Every Feature

- Does it require an account? **NO**
- Does it execute trades? **NO**
- Does it show fake data? **NO**
- Does it work on mobile? **YES**
- Is it maintainable? **YES**
- Does it improve analysis? **YES**

### For Every API Integration

- Can it run on free tier? **YES**
- Do we have a fallback provider? **YES** (or cached data)
- Is the data latency acceptable? **YES**
- Is the API rate-limited? **YES** (and handled)
- Are errors handled gracefully? **YES**

### For Every UI Component

- Is it responsive? **YES**
- Is it accessible (WCAG AA)? **YES**
- Is it fast (< 16ms render)? **YES**
- Does it prevent user error? **YES**
- Is the data source visible? **YES** (attribution)

---

**This specification is living.** Update as requirements evolve, but maintain core principles: No accounts. No trading. No fake data. Research first.

