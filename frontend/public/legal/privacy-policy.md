# Privacy Policy — Mara Stock Dashboard

**Effective Date:** November 15, 2026
**Jurisdiction:** India
**Applicable Law:** Digital Personal Data Protection Act, 2023 ("DPDP Act") and the Digital Personal Data Protection Rules, 2025

---

## 1. Who We Are

This Privacy Policy describes how the Mara Stock Dashboard ("Mara", "we", "us") collects, uses, and protects personal data. Mara is a data fiduciary under the DPDP Act.

## 2. Personal Data We Collect

| Data Category | When Collected | Purpose |
|---|---|---|
| Email address | During sign-up or password reset | Account creation, authentication, and recovery |
| Password | During sign-up | Authentication (stored hashed by Supabase Auth) |
| Display name | During sign-up | Account identification |
| Session tokens | During sign-in | Maintaining your authenticated session |
| Watchlist symbols | When you add assets | Persisting your watchlist |
| Research notes | When you type in the notebook | Persisting your notes |
| Alert rules | When you create alerts | Delivering price/indicator alerts |
| Chart preferences | When you adjust chart settings | Persisting your display preferences |

## 3. Where Your Data Is Stored

| Data Category | Storage Location | Controller / Processor |
|---|---|---|
| Email, password hash, session tokens | Supabase Auth (US/EU data centers) | Supabase = **Processor**, Mara = **Controller** |
| Watchlist, notes, alerts, preferences | Browser localStorage (your device only) | Mara = **Controller**, **no processor** (not transmitted to servers) |
| API keys (if provided by you) | Browser localStorage (your device only) | Mara = **Controller**, **no processor** |
| Market data cache (no personal data) | Mara backend (Redis + in-memory) | Mara = **Controller**, **no personal data** |

**Key points:**
- Your watchlist, notes, alerts, and chart preferences are stored **only in your browser's localStorage**. They are **not** synced across devices and are **not** transmitted to Mara's servers or any third party.
- Mara's market-data API does not receive or store your watchlist, notes, or alerts.
- Only authentication data (email, password hash, session tokens) is processed by Supabase.

## 4. Third-Party Processors

**Supabase Inc.** processes authentication data (email, password hash, session tokens) on our behalf under a data processing agreement. Supabase stores data outside India (US/EU). We do not sell or rent your data to third parties. No other third-party processors are used.

## 5. Cookies and Local Storage

Mara uses browser localStorage to persist your watchlist, notes, alerts, and chart preferences. These are essential for the Service to function and are not used for cross-site tracking. We do not currently use third-party analytics cookies. If we introduce tracking or advertising in the future, we will provide a cookie consent banner and update this Policy.

## 6. Data Retention

- Account data is retained as long as your account is active.
- Local storage data remains on your device until you clear it or delete your account.
- We retain personal data only as long as necessary for the purposes described above. We do not maintain a formal retention schedule at this time; this will be established before commercialization.

## 7. Your Rights

Under the DPDP Act, you have the right to:
- **Access** your personal data.
- **Correct** inaccurate data.
- **Erase** your personal data (account deletion).
- **Submit a grievance** if your rights are not respected.

To exercise these rights, contact the Grievance Officer (see Section 9). Account deletion is available on request; we will delete your account and personal data within a reasonable period.

## 8. Security

- Passwords are hashed by Supabase Auth and never transmitted to Mara's market-data API.
- All authentication traffic uses HTTPS.
- Mara does not store payment information (the Service is currently free).
- We implement reasonable security measures, but no system is perfectly secure.

## 9. Grievance Officer

For privacy concerns, data access/deletion requests, or complaints, contact our Grievance Officer:

**Name:** Data Protection Officer  
**Email:** dpo@mara-financial.com  
**Address:** Published on the Service at `/legal/grievance`

We will respond to grievances within a reasonable timeframe as required by the DPDP Act.

## 10. Children's Data

The Service is intended for adults. We do not knowingly collect data from children under 18.

## 11. Changes to This Policy

We may update this Privacy Policy. The effective date at the top reflects the latest version. Continued use of the Service after changes constitutes acceptance.

---

*This Privacy Policy is a general reference and does not constitute legal advice. Consult qualified Indian legal counsel before relying on it.*