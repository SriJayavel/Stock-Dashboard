# Multi-cloud Dockerfile optimized for Render & Google Cloud Run
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

# Copy backend application and metadata catalog
COPY backend/ ./backend/
COPY companies.csv ./companies.csv

# Default environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV ENVIRONMENT=production

# Expose port (Cloud Run defaults to 8080, Render injects dynamic $PORT)
EXPOSE 8080

# Start Uvicorn dynamically binding to runtime $PORT injected by Render / Cloud Run
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2"]
