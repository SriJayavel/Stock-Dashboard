# Production Deployment Guide for Vercel

## Issue: Backend API Routes Not Working in Vercel Deployment

**Symptoms:**
- `https://stock-dashboard.vercel.app/api/analytics/sectors` returns Next.js 404 page
- `https://stock-dashboard.vercel.app/api/health` returns Next.js 404 page
- Frontend at `https://stock-dashboard.vercel.app/` loads correctly
- All `/api/*` requests fall through to frontend's 404 handler

**Root Cause:**
The backend service is not properly starting or responding in the Vercel deployment environment, causing the rewrite rule `/api/(.*)` -> backend to fail silently and fall through to the frontend handler.

## Required Environment Variables for Vercel Backend

The backend service requires the following environment variables to be set in Vercel:

| Variable | Description | Required? | Notes |
|----------|-------------|-----------|-------|
| `SUPABASE_URL` | Supabase project URL | ✅ Yes | Format: `https://your-project.supabase.co` |
| `SUPABASE_KEY` | Supabase service role key | ✅ Yes | **NOT** the anon key - must be service role key |
| `INTERNAL_REFRESH_SECRET` | Secret for internal cache refresh endpoint | ✅ Yes | Must be explicitly set (not using default) |
| `REDIS_URL` | Redis connection URL (for L2 cache) | ⚠️ Recommended | Optional but recommended for production |
| `FRONTEND_URL` | Frontend URL for CORS/origin checks | ⚠️ Recommended | Optional but helpful |

## Current Frontend Environment Variables (for reference)

From `.env` file:
```
VITE_SUPABASE_URL=https://tiipywxfwbtlpykockhp.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_API_BASE_URL=
```

**Important:** The backend needs `SUPABASE_KEY` (service role key), not `VITE_SUPABASE_ANON_KEY` (anon key).

## Steps to Fix Production Deployment

### 1. Obtain Required Credentials
- **SUPABASE_URL**: Copy from frontend `.env` (`VITE_SUPABASE_URL`)
- **SUPABASE_KEY**: Get the **service role key** from Supabase dashboard (Settings → API)
  - Do NOT use the anon key from `VITE_SUPABASE_ANON_KEY`
  - Service role key has `sk_live_` or similar prefix
- **INTERNAL_REFRESH_SECRET**: Generate a strong random secret (e.g., 32+ character random string)

### 2. Set Environment Variables in Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add each variable:
   - `SUPABASE_URL`: `https://tiipywxfwbtlpykockhp.supabase.co`
   - `SUPABASE_KEY`: `[your-service-role-key-here]`
   - `INTERNAL_REFRESH_SECRET`: `[strong-random-secret]`
   - `REDIS_URL`: `[optional-redis-url]` (if using Upstash Redis)
   - `FRONTEND_URL`: `https://stock-dashboard.vercel.app` (optional)
3. **Important**: Make sure to set these for the **backend service** specifically, or as project-wide variables that the backend can access
4. Redeploy the application

### 3. Verify Deployment
After redeploy with correct environment variables:
1. Check Vercel deployment logs for backend service startup
2. Test endpoints:
   - `https://stock-dashboard.vercel.app/api/health` should return `{"status":"ok"}`
   - `https://stock-dashboard.vercel.app/api/analytics/sectors` should return sector data
   - `https://stock-dashboard.vercel.app/api/stocks/MARA-MAIN-CANVAS/overview` should return 200 (not 500)

### 4. Verify Cache Warming Works
The GitHub Actions workflow (`.github/workflows/warm-cache.yml`) should automatically:
1. Run every 12 hours (`*/12 * * * *`)
2. Record Supabase database activity
3. Call `/internal/refresh-cache` to warm the backend cache

Ensure the workflow has access to the same environment variables:
- `SUPABASE_URL` and `SUPABASE_KEY` (for Supabase health check)
- `BACKEND_API_URL` and `INTERNAL_REFRESH_SECRET` (for cache warming)

## Local vs Production Differences

**Local Development:**
- Uses `.env` file with `VITE_*` variables for frontend
- Backend reads from actual environment (can use same `.env` via python-dotenv or similar)
- `INTERNAL_REFRESH_SECRET` defaults to `"dev_secret_local_only"` (acceptable for local only)

**Production (Vercel):**
- Backend requires explicit `SUPABASE_URL`, `SUPABASE_KEY`, `INTERNAL_REFRESH_SECRET`
- Default values are rejected by security checks in `backend/config.py`
- Frontend uses `VITE_*` variables as before

## Verification Checklist

After setting environment variables and redeploying:

[ ] Backend service starts without import or configuration errors
[ ] `GET /api/health` returns 200 with `{"status":"ok"}`
[ ] `GET /api/analytics/sectors` returns 200 with sector data array
[ ] `GET /api/stocks/MARA-MAIN-CANVAS/overview` returns 200 (not 500)
[ ] `GET /api/stocks/TCS.NS/overview` returns 200 with real data
[ ] Market summary component shows real data for global benchmark indices
[ ] GitHub Actions workflow runs successfully and warms cache

## Troubleshooting

If you still see 404s for /api/* endpoints:

1. **Check Vercel logs** for backend service:
   - Look for import errors, configuration errors, or startup failures
   - Verify the backend service is actually starting

2. **Verify environment variables are visible to backend:**
   - Add a temporary debug endpoint to check if env vars are loaded
   - Ensure they're set in the correct scope (backend vs frontend)

3. **Check vercel.json configuration:**
   - Ensure `"framework": "fastapi"` is correct for the backend service
   - Ensure `"entrypoint": "backend.main:app"` is correct

4. **Test the internal endpoint directly:**
   - `https://stock-dashboard.vercel.app/internal/refresh-cache` with proper `X-Internal-Secret` header should return 202

## Summary of Local Fixes (Already Completed)

✅ **MARA-MAIN-CANVAS HTTP 500 Errors**: Fixed by adding NaN detection in `backend/services/data_pipeline.py`
✅ **Backend Import Issues**: Fixed by creating `backend/services/__init__.py`
✅ **Local Backend Functionality**: All endpoints working correctly on localhost:8080
✅ **Market Summary Component**: Working when cache is warmed (issue was stale cache, not data feed)

**Remaining**: Production deployment of backend service on Vercel requires proper environment variable configuration.
