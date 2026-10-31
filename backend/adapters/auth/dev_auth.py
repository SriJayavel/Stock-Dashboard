"""
Development Auth Provider.
Simple in-memory auth for local development without Supabase.
"""
import logging
import secrets
import hashlib
from typing import Any, Optional, List
from datetime import datetime, timedelta, timezone

from backend.core.contracts.auth import AuthProvider, User, Session, Permissions

logger = logging.getLogger("dev_auth")


class DevAuthProvider:
    """In-memory auth for development."""

    name = "dev"

    def __init__(self):
        self._users: dict[str, User] = {}
        self._sessions: dict[str, Session] = {}  # token -> session
        self._email_to_id: dict[str, str] = {}
        self._password_hashes: dict[str, str] = {}  # user_id -> password_hash

        # Create default dev user
        dev_user = User(
            id="dev_user_123",
            email="dev@local",
            name="Dev User",
            roles=["admin", "user"],
            metadata={"permissions": Permissions.all()},
            created_at=datetime.now(timezone.utc),
        )
        self._users[dev_user.id] = dev_user
        self._email_to_id[dev_user.email] = dev_user.id
        self._password_hashes[dev_user.id] = self._hash_password("dev_password")

    def _create_token(self) -> str:
        return f"dev_{secrets.token_urlsafe(32)}"

    def _hash_password(self, password: str) -> str:
        """Simple password hashing for dev."""
        return hashlib.sha256(password.encode()).hexdigest()

    def _verify_password(self, password: str, hashed: str) -> bool:
        return self._hash_password(password) == hashed

    def _create_session(self, user: User) -> Session:
        token = self._create_token()
        session = Session(
            user=user,
            access_token=token,
            refresh_token=f"refresh_{secrets.token_urlsafe(16)}",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            provider="dev",
        )
        self._sessions[token] = session
        return session

    # --- Token Verification ---

    async def verify_token(self, token: str) -> User:
        session = self._sessions.get(token)
        if not session:
            raise ValueError("Invalid or expired token")
        if session.expires_at and datetime.now(timezone.utc) > session.expires_at:
            del self._sessions[token]
            raise ValueError("Token expired")
        return session.user

    async def verify_token_optional(self, token: Optional[str]) -> Optional[User]:
        if not token:
            return None
        try:
            return await self.verify_token(token)
        except ValueError:
            return None

    # --- Session Management ---

    async def create_session(self, email: str, password: str) -> Session:
        # In dev, accept any password for existing users, or create new
        user = await self.get_user_by_email(email)
        if not user:
            user = User(
                id=f"user_{secrets.token_urlsafe(8)}",
                email=email,
                name=email.split('@')[0],
                roles=["user"],
                metadata={"permissions": Permissions.default_user_permissions()},
                created_at=datetime.now(timezone.utc),
            )
            self._users[user.id] = user
            self._email_to_id[user.email] = user.id
            self._password_hashes[user.id] = self._hash_password(password)
        else:
            # Verify password
            if not self._verify_password(password, self._password_hashes.get(user.id, "")):
                raise ValueError("Invalid password")

        return self._create_session(user)

    async def refresh_session(self, refresh_token: str) -> Session:
        # Find session by refresh token
        for session in self._sessions.values():
            if session.refresh_token == refresh_token:
                return self._create_session(session.user)
        raise ValueError("Invalid refresh token")

    async def revoke_session(self, access_token: str) -> None:
        self._sessions.pop(access_token, None)

    async def revoke_all_sessions(self, user_id: str) -> None:
        to_remove = [
            token for token, session in self._sessions.items()
            if session.user.id == user_id
        ]
        for token in to_remove:
            del self._sessions[token]

    # --- User Management ---

    async def get_user(self, user_id: str) -> Optional[User]:
        return self._users.get(user_id)

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        return self._users.get(user_id)

    async def get_user_by_email(self, email: str) -> Optional[User]:
        user_id = self._email_to_id.get(email)
        if user_id:
            return self._users.get(user_id)
        return None

    async def update_user(self, user_id: str, updates: dict) -> User:
        user = self._users.get(user_id)
        if not user:
            raise ValueError("User not found")

        # Create updated user (dataclass is frozen, so recreate)
        updated = User(
            id=user.id,
            email=updates.get("email", user.email),
            name=updates.get("name", user.name),
            avatar_url=updates.get("avatar_url", user.avatar_url),
            roles=updates.get("roles", user.roles),
            metadata={**user.metadata, **updates.get("metadata", {})},
            created_at=user.created_at,
            last_sign_in=user.last_sign_in,
        )
        self._users[user_id] = updated
        if updated.email != user.email:
            self._email_to_id.pop(user.email, None)
            self._email_to_id[updated.email] = user_id
        return updated

    async def delete_user(self, user_id: str) -> None:
        user = self._users.pop(user_id, None)
        if user:
            self._email_to_id.pop(user.email, None)
        await self.revoke_all_sessions(user_id)

    # --- OAuth ---

    def get_oauth_url(self, provider: str, redirect_url: str) -> str:
        return f"{redirect_url}?dev_oauth={provider}"

    async def exchange_oauth_code(self, provider: str, code: str, redirect_url: str) -> Session:
        # In dev, just create a session
        email = f"{provider}_user@local"
        return await self.create_session(email, "oauth")

    # --- Magic Link ---

    async def send_magic_link(self, email: str, redirect_url: str) -> None:
        logger.info(f"Dev magic link for {email}: {redirect_url}?dev_token=xxx")

    async def verify_magic_link(self, token: str) -> Session:
        # In dev, token is email
        return await self.create_session(token, "magic")

    # --- Admin ---

    async def list_users(self, page: int = 1, per_page: int = 50) -> List[User]:
        users = list(self._users.values())
        start = (page - 1) * per_page
        return users[start:start + per_page]

    async def impersonate_user(self, user_id: str) -> Session:
        user = self._users.get(user_id)
        if not user:
            raise ValueError("User not found")
        return self._create_session(user)

    # --- Password Hashing ---

    async def hash_password(self, password: str) -> str:
        return self._hash_password(password)

    async def verify_password(self, password: str, hashed: str) -> bool:
        return self._verify_password(password, hashed)

    # --- Health ---

    async def health_check(self) -> bool:
        return True

    async def close(self) -> None:
        self._sessions.clear()

    # --- Permissions ---

    async def check_permission(self, user: User, permission: str) -> bool:
        """Check if user has a permission (via roles or direct)."""
        # Check direct permissions in metadata
        user_perms = user.metadata.get("permissions", [])
        if permission in user_perms:
            return True

        # Check role-based permissions
        role_perms = {
            "admin": Permissions.all(),
            "premium": Permissions.default_user_permissions() + [Permissions.USE_BACKTESTER],
            "user": Permissions.default_user_permissions(),
            "viewer": [Permissions.READ_MARKET_DATA],
        }

        for role in user.roles:
            if permission in role_perms.get(role, []):
                return True

        return False