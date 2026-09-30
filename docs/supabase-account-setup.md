# Mara email account setup

Mara uses Supabase Auth email/password accounts. No social sign-in provider or OAuth client is used.

## Deployment order

1. **Supabase:** create the project, enable Email under Auth providers, turn off other providers, and copy the Project URL plus anon/publishable key. Keep email confirmation enabled and configure SMTP before launch. Apply the `mara_healthcheck()` SQL migration described below.
2. **Upstash:** create the Redis database and copy its `REDIS_URL`.
3. **Vercel:** import the repository with the project root set to the repository root. `vercel.json` defines the Vite frontend and FastAPI backend as services; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ENVIRONMENT=production`, a generated `INTERNAL_REFRESH_SECRET`, `REDIS_URL`, `SUPABASE_URL`, and `SUPABASE_KEY` in the Vercel project environment. Leave `VITE_API_BASE_URL` unset so the browser uses the same-origin `/api` route.
4. **GitHub Actions:** add `INTERNAL_REFRESH_SECRET` (matching Vercel), `BACKEND_API_URL` set to the Vercel deployment origin (for example, `https://your-project.vercel.app`), `SUPABASE_URL`, and `SUPABASE_KEY` as repository secrets.

## Supabase project

1. Create or select a Supabase project and copy its **Project URL** and **anon (publishable) key**. Do not use the service-role/secret key in the frontend or GitHub Actions.
2. In **Authentication → Providers**, enable Email and disable all social providers. Set the minimum password length to 8 characters.
3. Set the project's Site URL to the deployed Mara frontend. Add these redirect URLs:
   - `https://your-mara-site.example/**`
   - `https://your-mara-site.example/reset-password`
   - `http://localhost:5173/**`
   - `http://localhost:5173/reset-password`
4. Keep email confirmation enabled for sign-up. Configure custom SMTP before launch so verification and password recovery emails are delivered reliably.

## Environment variables

Frontend build variables:

- `VITE_SUPABASE_URL`: Supabase Project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon/publishable key (safe to expose in a browser)
- `VITE_API_BASE_URL`: optional separate backend HTTPS origin; leave unset for the Vercel services deployment so `/api` uses the same Vercel origin, and leave empty locally to use Vite's API proxy

Backend runtime variables:

- `SUPABASE_URL`: same Supabase Project URL
- `SUPABASE_KEY`: same anon/publishable key, used to validate access tokens with Supabase Auth
- `CORS_ORIGINS`: comma-separated exact origins for separate frontend/backend deployments; same-origin Vercel service routing does not require cross-origin API access

For the Docker build, pass the frontend values as build arguments:

```sh
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key \
  -t mara .
```

Set the backend variables in the running container environment too. Production startup requires both backend Supabase values. Never put a Supabase secret or service-role key in frontend variables or GitHub Actions.

The API checks bearer tokens against the Supabase Auth user endpoint and fails closed if token validation is unavailable. Watchlists, notes, alerts, and chart preferences are namespaced by Supabase user ID in browser storage; they are not synced across devices.

## Scheduled Supabase activity ping

Apply [`20260929000000_mara_healthcheck.sql`](../supabase/migrations/20260929000000_mara_healthcheck.sql) in the Supabase SQL Editor. It creates a read-only `mara_healthcheck()` RPC that returns `1` and grants execution to the `anon` and `authenticated` roles. The GitHub Actions workflow calls this function through PostgREST alongside the existing backend cache refresh.

Add these repository Actions secrets:

- `INTERNAL_REFRESH_SECRET`: the same generated secret configured on Vercel
- `BACKEND_API_URL`: the Vercel deployment origin (e.g. `https://your-project.vercel.app`)
- `SUPABASE_URL`: the Supabase Project URL
- `SUPABASE_KEY`: the anon JWT or publishable key; the workflow sends it only as `apikey`

The Supabase ping needs only the public anon/publishable key, not a service-role/secret key. Supabase's free-plan inactivity policy considers database activity over a rolling week; the scheduled RPC issues a real database query. The current policy says a few user database requests per day is typically enough, though Supabase may assess project activity more broadly. [Project pausing policy](https://supabase.com/docs/guides/platform/free-project-pausing)
