# ADR 004: Client-Side User Storage Architecture (DPDP Act 2023 Compliance)

## Status
Accepted

## Context
India's **Digital Personal Data Protection (DPDP) Act, 2023** establishes strict legal obligations and penalties for Data Fiduciaries storing personal financial behavior data (such as user watchlists, private trading notes, portfolio holdings, and alert thresholds). 

Storing user financial data in a centralized backend database introduces:
1. Significant regulatory compliance overhead (consent management, data localization, breach reporting).
2. Database hosting costs and ongoing infrastructure scaling maintenance.
3. Attack surface for user portfolio exfiltration.

## Decision
Retain 100% of user data strictly on the user's device via browser **`localStorage`**:
1. **Zero Database Sync:** Watchlists, user research notebooks, backtest strategies, and custom price alerts are stored locally under user-namespaced keys.
2. **Tab Synchronization:** Changes in one browser tab are broadcast across open tabs using the native window `storage` event.
3. **Data Portability:** Users can back up or transfer their state via one-click encrypted/formatted JSON export and import.
4. **Third-Party Separation:** Supabase Auth is utilized solely as an authentication processor for sign-in tokens; no portfolio or watchlist records are ever transmitted to or stored in Supabase.

## Consequences
- **Positive:**
  - Zero database storage costs for user state.
  - Absolute privacy guarantee: the backend cannot leak or be subpoenaed for user portfolio data because it never possesses it.
  - Instant client-side latency: watchlists and notes render immediately without database query round trips.
- **Negative:**
  - Data does not automatically sync across different devices (e.g. phone to desktop) without the user manually importing their JSON backup file.
