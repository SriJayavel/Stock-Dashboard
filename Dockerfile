# ============================================================================
# Stage 1: Build Frontend Assets (Vite Production Distribution)
# ============================================================================
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY frontend/ ./
RUN npm run build

# ============================================================================
# Stage 2: Production Python Runtime (Multi-cloud: Render & Google Cloud Run)
# ============================================================================
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for high-performance math & networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application, metadata catalog, and compiled frontend SPA
COPY backend/ ./backend/
COPY companies.csv ./companies.csv
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Default environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV ENVIRONMENT=production

# Expose port (Cloud Run defaults to 8080, Render injects dynamic $PORT)
EXPOSE 8080

# Start Uvicorn dynamically binding to runtime $PORT injected by Render / Cloud Run
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2"]
