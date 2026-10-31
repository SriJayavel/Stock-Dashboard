"""
Auth Provider Protocol - Defines the contract for authentication.
Implementations: Supabase, Firebase, custom JWT, etc.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional, List
from dataclasses import dataclass
from datetime import datetime
from typing_extensions import Protocol


@dataclass(frozen=True)
class User:
    """Authenticated user."""
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    roles: List[str] = None
    metadata: dict = None
    created_at: Optional[datetime] = None
    last_sign_in: Optional[datetime] = None

    def __post_init__(self):
        if self.roles is None:
            self.roles = []
        if self.metadata is None:
            self.metadata = {}


@dataclass(frozen=True)
class Session:
    """Auth session."""
    user: User
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None
    provider: str = "email"  # email, google, github, etc.


class AuthProvider(Protocol):
    """Protocol for authentication providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""
        ...

    # --- Token Verification ---

    @abstractmethod
    async def verify_token(self, token: str) -> User:
        """Verify access token and return user. Raises on invalid/expired."""
        ...

    @abstractmethod
    async def verify_token_optional(self, token: Optional[str]) -> Optional[User]:
        """Verify token if present, return None if not provided or invalid."""
        ...

    # --- Session Management ---

    @abstractmethod
    async def create_session(self, email: str, password: str) -> Session:
        """Create new session with credentials."""
        ...

    @abstractmethod
    async def refresh_session(self, refresh_token: str) -> Session:
        """Refresh access token using refresh token."""
        ...

    @abstractmethod
    async def revoke_session(self, access_token: str) -> None:
        """Revoke/logout session."""
        ...

    @abstractmethod
    async def revoke_all_sessions(self, user_id: str) -> None:
        """Revoke all sessions for a user."""
        ...

    # --- User Management ---

    @abstractmethod
    async def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        ...

    @abstractmethod
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        ...

    @abstractmethod
    async def update_user(self, user_id: str, updates: dict) -> User:
        """Update user metadata."""
        ...

    @abstractmethod
    async def delete_user(self, user_id: str) -> None:
        """Delete user account."""
        ...

    # --- OAuth ---

    @abstractmethod
    def get_oauth_url(self, provider: str, redirect_url: str) -> str:
        """Get OAuth authorization URL."""
        ...

    @abstractmethod
    async def exchange_oauth_code(self, provider: str, code: str, redirect_url: str) -> Session:
        """Exchange OAuth code for session."""
        ...

    # --- Magic Link / Passwordless ---

    @abstractmethod
    async def send_magic_link(self, email: str, redirect_url: str) -> None:
        """Send magic link email."""
        ...

    @abstractmethod
    async def verify_magic_link(self, token: str) -> Session:
        """Verify magic link token."""
        ...

    # --- Admin ---

    @abstractmethod
    async def list_users(self, page: int = 1, per_page: int = 50) -> List[User]:
        """List all users (admin)."""
        ...

    @abstractmethod
    async def impersonate_user(self, user_id: str) -> Session:
        """Create admin session as another user."""
        ...

    # --- Health ---

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if auth provider is healthy."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Clean up resources."""
        ...


# Permission helpers
class Permissions:
    """Standard permission constants."""

    # Data access
    READ_MARKET_DATA = "read:market_data"
    READ_RESEARCH = "read:research"
    READ_ANALYTICS = "read:analytics"

    # Feature access
    USE_SCREENER = "use:screener"
    USE_BACKTESTER = "use:backtester"
    USE_ALERTS = "use:alerts"
    USE_NOTEBOOK = "use:notebook"
    USE_REPORTS = "use:reports"

    # Admin
    ADMIN_USERS = "admin:users"
    ADMIN_CACHE = "admin:cache"
    ADMIN_SYSTEM = "admin:system"

    @classmethod
    def all(cls) -> List[str]:
        return [
            cls.READ_MARKET_DATA,
            cls.READ_RESEARCH,
            cls.READ_ANALYTICS,
            cls.USE_SCREENER,
            cls.USE_BACKTESTER,
            cls.USE_ALERTS,
            cls.USE_NOTEBOOK,
            cls.USE_REPORTS,
            cls.ADMIN_USERS,
            cls.ADMIN_CACHE,
            cls.ADMIN_SYSTEM,
        ]

    @classmethod
    def default_user_permissions(cls) -> List[str]:
        """Permissions granted to regular users."""
        return [
            cls.READ_MARKET_DATA,
            cls.READ_RESEARCH,
            cls.READ_ANALYTICS,
            cls.USE_SCREENER,
            cls.USE_BACKTESTER,
            cls.USE_ALERTS,
            cls.USE_NOTEBOOK,
            cls.USE_REPORTS,
        ]


def user_has_permission(user: User, permission: str) -> bool:
    """Check if user has a permission (via roles or direct)."""
    # Check direct permissions in metadata
    user_perms = user.metadata.get("permissions", [])
    if permission in user_perms:
        return True

    # Check role-based permissions
    role_perms = {
        "admin": Permissions.all(),
        "premium": Permissions.default_user_permissions() + [cls.USE_BACKTESTER for cls in [Permissions]],
        "user": Permissions.default_user_permissions(),
        "viewer": [cls.READ_MARKET_DATA for cls in [Permissions]],
    }

    for role in user.roles:
        if permission in role_perms.get(role, []):
            return True

    return False