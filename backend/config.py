from pathlib import Path
import os
import logging
import json
from typing import Annotated
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode

logger = logging.getLogger("config")


class Settings(BaseSettings):
    APP_NAME: str = "Mara Market Intelligence API"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_PUBLISHABLE_KEY", ""))
    
    # Path to NSE companies catalog (deterministic from module location)
    COMPANIES_CSV_PATH: str = os.getenv(
        "COMPANIES_CSV_PATH",
        str(Path(__file__).resolve().parent.parent / "companies.csv")
    )
    
    # Security & CORS (strict explicit origins; no wildcards allowed with credentials)
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        os.getenv("FRONTEND_URL", "https://stock-dashboard.vercel.app"),
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return []
            value = json.loads(value) if value.startswith("[") else value.split(",")
        return [origin.strip().rstrip("/") for origin in value if origin and origin.strip()]
    
    # Internal scheduled refresh secret (used by GitHub Actions / external cron)
    # Default provided ONLY for local development. Prohibited in production.
    INTERNAL_REFRESH_SECRET: str = os.getenv("INTERNAL_REFRESH_SECRET", "dev_secret_local_only")
    
    # Redis Cache (Upstash Redis free tier URL e.g. rediss://default:xxx@xxx.upstash.io:6379)
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    
    # In-memory L1 cache TTLs (seconds)
    L1_MARKET_OVERVIEW_TTL: int = 300       # 5 minutes
    L1_STOCK_OVERVIEW_TTL: int = 1800       # 30 minutes
    L1_STOCK_HISTORY_TTL: int = 1800        # 30 minutes
    L1_INDICATORS_TTL: int = 3600           # 1 hour
    L1_SCREENER_TTL: int = 1800             # 30 minutes

    @model_validator(mode="after")
    def validate_security(self):
        insecure_placeholders = [
            "apex_internal_secret_change_in_prod",
            "replace_with_a_secure_generated_secret_token",
            "dev_secret_local_only",
            "change_me",
            "secret",
            "",
        ]
        
        # Enforce strict secret and distributed cache in production
        if self.ENVIRONMENT == "production":
            if not self.SUPABASE_URL.strip() or not self.SUPABASE_KEY.strip():
                raise ValueError(
                    "FATAL SECURITY MISCONFIGURATION: SUPABASE_URL and SUPABASE_KEY must be configured "
                    "in production to verify account access."
                )
            if not self.INTERNAL_REFRESH_SECRET or self.INTERNAL_REFRESH_SECRET in insecure_placeholders:
                raise ValueError(
                    "FATAL SECURITY MISCONFIGURATION: INTERNAL_REFRESH_SECRET must be explicitly set "
                    "via environment variable in production and cannot use default placeholders."
                )
            if not self.REDIS_URL or not self.REDIS_URL.strip():
                raise ValueError(
                    "FATAL CONFIGURATION ERROR: REDIS_URL must be explicitly configured in production "
                    "to support multi-worker Uvicorn distributed locking and persistent L2 caching."
                )
        
        # Ensure no wildcard in CORS origins when credentials are enabled
        if "*" in self.CORS_ORIGINS:
            logger.warning("Wildcard '*' detected in CORS_ORIGINS with credentials enabled. Removing wildcard.")
            self.CORS_ORIGINS = [orig for orig in self.CORS_ORIGINS if orig != "*"]
            
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
