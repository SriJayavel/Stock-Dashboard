"""
Supabase Auth Provider Adapter.
Implements AuthProvider protocol using Supabase.
"""
import logging
from typing import Any, Optional, List
from datetime import datetime

# Optional imports - may not be available in test environment
try:
    from supabase import create_client, Client
    from gotrue.errors import AuthApiError
    SUPABASE_AVAILABLE = True
except ImportError:
    create_client = None
    Client = None
    AuthApiError = Exception
    SUPABASE_AVAILABLE = False

from backend.core.contracts.auth import AuthProvider, User, Session, Permissions
from backend.config import settings

logger = logging.getLogger("supabase_auth")


class SupabaseAuthProvider:
    """Supabase implementation of AuthProvider."""

    name = "supabase"

    def __init__(self):
        if not SUPABASE_AVAILABLE:
            raise ImportError("supabase package not installed. Install with: pip install supabase")
        self._client: Optional[Client] = None
        self._admin_client: Optional[Client] = None

    def _get_client(self) -> Client:
        if self._client is None:
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._client

    def _get_admin_client(self) -> Client:
        if self._admin_client is None:
            self._admin_client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_KEY
            )
        return self._admin_client

    def _map_user(self, gotrue_user) -> User:
        """Map GoTrue user to our User model."""
        return User(
            id=gotrue_user.id,
            email=gotrue_user.email or "",
            name=gotrue_user.user_metadata.get("full_name") or gotrue_user.user_metadata.get("name"),
            avatar_url=gotrue_user.user_metadata.get("avatar_url"),
            roles=gotrue_user.user_metadata.get("roles", []),
            metadata=gotrue_user.user_metadata,
            created_at=datetime.fromisoformat(gotrue_user.created_at.replace('Z', '+00:00')) if gotrue_user.created_at else None,
            last_sign_in=datetime.fromisoformat(gotrue_user.last_sign_in_at.replace('Z', '+00:00')) if gotrue_user.last_sign_in_at else None,
        )

    def _map_session(self, gotrue_session, user: User) -> Session:
        return Session(
            user=user,
            access_token=gotrue_session.access_token,
            refresh_token=gotrue_session.refresh_token,
            expires_at=datetime.fromtimestamp(gotrue_session.expires_at) if gotrue_session.expires_at else None,
            provider=gotrue_session.provider or "email",
        )

    # --- Token Verification ---

    async def verify_token(self, token: str) -> User:
        client = self._get_client()
        try:
            response = client.auth.get_user(token)
            if response.user:
                return self._map_user(response.user)
        except AuthApiError as e:
            logger.debug(f"Token verification failed: {e}")
        raise ValueError("Invalid or expired token")

    async def verify_token_optional(self, token: Optional[str]) -> Optional[User]:
        if not token:
            return None
        try:
            return await self.verify_token(token)
        except ValueError:
            return None

    # --- Session Management ---

    async def create_session(self, email: str, password: str) -> Session:
        client = self._get_client()
        response = client.auth.sign_in_with_password({"email": email, "password": password})
        if response.user and response.session:
            user = self._map_user(response.user)
            return self._map_session(response.session, user)
        raise ValueError("Invalid credentials")

    async def refresh_session(self, refresh_token: str) -> Session:
        client = self._get_client()
        response = client.auth.refresh_session(refresh_token)
        if response.user and response.session:
            user = self._map_user(response.user)
            return self._map_session(response.session, user)
        raise ValueError("Invalid refresh token")

    async def revoke_session(self, access_token: str) -> None:
        client = self._get_client()
        # Sign out the specific session
        try:
            client.auth.sign_out(access_token)
        except Exception:
            pass

    async def revoke_all_sessions(self, user_id: str) -> None:
        admin = self._get_admin_client()
        try:
            admin.auth.admin.sign_out(user_id)
        except Exception as e:
            logger.error(f"Failed to revoke all sessions for {user_id}: {e}")

    # --- User Management ---

    async def get_user(self, user_id: str) -> Optional[User]:
        admin = self._get_admin_client()
        try:
            response = admin.auth.admin.get_user_by_id(user_id)
            if response.user:
                return self._map_user(response.user)
        except Exception:
            pass
        return None

    async def get_user_by_email(self, email: str) -> Optional[User]:
        admin = self._get_admin_client()
        try:
            response = admin.auth.admin.list_users()
            for u in response.users:
                if u.email == email:
                    return self._map_user(u)
        except Exception:
            pass
        return None

    async def update_user(self, user_id: str, updates: dict) -> User:
        admin = self._get_admin_client()
        response = admin.auth.admin.update_user_by_id(user_id, updates)
        return self._map_user(response.user)

    async def delete_user(self, user_id: str) -> None:
        admin = self._get_admin_client()
        admin.auth.admin.delete_user(user_id)

    # --- OAuth ---

    def get_oauth_url(self, provider: str, redirect_url: str) -> str:
        client = self._get_client()
        return client.auth.get_oauth_url(provider, redirect_url)

    async def exchange_oauth_code(self, provider: str, code: str, redirect_url: str) -> Session:
        client = self._get_client()
        response = client.auth.exchange_code_for_session({"auth_code": code})
        if response.user and response.session:
            user = self._map_user(response.user)
            return self._map_session(response.session, user)
        raise ValueError("Invalid OAuth code")

    # --- Magic Link ---

    async def send_magic_link(self, email: str, redirect_url: str) -> None:
        client = self._get_client()
        client.auth.sign_in_with_otp({"email": email, "options": {"redirect_url": redirect_url}})

    async def verify_magic_link(self, token: str) -> Session:
        client = self._get_client()
        response = client.auth.verify_otp({"token": token, "type": "email"})
        if response.user and response.session:
            user = self._map_user(response.user)
            return self._map_session(response.session, user)
        raise ValueError("Invalid magic link")

    # --- Admin ---

    async def list_users(self, page: int = 1, per_page: int = 50) -> List[User]:
        admin = self._get_admin_client()
        response = admin.auth.admin.list_users(page=page, per_page=per_page)
        return [self._map_user(u) for u in response.users]

    async def impersonate_user(self, user_id: str) -> Session:
        admin = self._get_admin_client()
        response = admin.auth.admin.generate_link({"type": "magiclink", "email": user_id})
        # Note: Supabase doesn't directly support impersonation
        # This is a placeholder - implement based on needs
        raise NotImplementedError("Impersonation not directly supported by Supabase")

    # --- Health ---

    async def health_check(self) -> bool:
        try:
            client = self._get_client()
            # Simple health check
            client.auth.get_user("invalid")  # Will fail but confirms connectivity
            return True
        except Exception:
            return False

    async def close(self) -> None:
        # Supabase client doesn't need explicit close
        pass