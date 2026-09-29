"""Supabase Auth access-token validation for the private Mara API."""
from hashlib import sha256
from threading import Lock
from typing import Any

import requests
from cachetools import TTLCache
from fastapi import HTTPException, status

from backend.config import settings

_USER_CACHE: TTLCache[str, dict[str, Any]] = TTLCache(maxsize=2048, ttl=30)
_USER_CACHE_LOCK = Lock()


def verify_access_token(token: str) -> dict[str, Any]:
    """Ask Supabase Auth to validate a bearer token and return its user profile.

    Using the Auth user endpoint also supports projects using either asymmetric
    signing keys or Supabase's legacy HS256 signing key without exposing secrets.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mara account access is not configured on this server.",
        )
    if not token or len(token) > 8192:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid account session.")

    cache_key = sha256(token.encode("utf-8")).hexdigest()
    with _USER_CACHE_LOCK:
        cached_user = _USER_CACHE.get(cache_key)
    if cached_user:
        return cached_user

    try:
        response = requests.get(
            f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.SUPABASE_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=(3, 6),
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mara account verification is temporarily unavailable.",
        ) from exc

    if response.status_code in (401, 403):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired. Sign in again.")
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mara account verification is temporarily unavailable.",
        )

    user = response.json()
    user_id = user.get("id")
    if not user_id or not user.get("email"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid account session.")
    profile = {
        "id": user_id,
        "email": user["email"],
        "name": (user.get("user_metadata") or {}).get("full_name") or user["email"],
    }
    with _USER_CACHE_LOCK:
        _USER_CACHE[cache_key] = profile
    return profile
