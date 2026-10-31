"""
Contract Tests - Verify all auth implementations comply with AuthProvider protocol.
Run: pytest backend/tests/contract/test_auth_protocol.py -v
"""
import pytest
from backend.core.contracts.auth import AuthProvider, User, Session, Permissions
from backend.adapters.auth.dev_auth import DevAuthProvider


class TestAuthContract:
    """Contract tests that ALL auth implementations must pass."""

    @pytest.fixture(params=["dev"])
    async def auth(self, request) -> AuthProvider:
        """Fixture providing different auth implementations."""
        if request.param == "dev":
            yield DevAuthProvider()
        # Supabase requires real credentials - run separately in integration tests

    @pytest.mark.asyncio
    async def test_verify_token_returns_user(self, auth: AuthProvider):
        """verify_token should return a User object."""
        # Dev auth requires a valid session token
        session = await auth.create_session("test@example.com", "test_password")
        user = await auth.verify_token(session.access_token)
        assert isinstance(user, User)
        assert user.id is not None
        assert user.email is not None

    @pytest.mark.asyncio
    async def test_verify_invalid_token_raises(self, auth: AuthProvider):
        """Invalid tokens should raise ValueError."""
        with pytest.raises(ValueError):
            await auth.verify_token("")

    @pytest.mark.asyncio
    async def test_create_session_returns_session(self, auth: AuthProvider):
        """create_session should return a Session."""
        session = await auth.create_session("test@example.com", "test_password")
        assert isinstance(session, Session)
        assert session.user.email == "test@example.com"
        assert session.access_token is not None

    @pytest.mark.asyncio
    async def test_refresh_session(self, auth: AuthProvider):
        """refresh_session should return new session."""
        session = await auth.create_session("test@example.com", "test_password")
        new_session = await auth.refresh_session(session.refresh_token)
        assert isinstance(new_session, Session)
        assert new_session.access_token != session.access_token

    @pytest.mark.asyncio
    async def test_revoke_session(self, auth: AuthProvider):
        """revoke_session should invalidate session."""
        session = await auth.create_session("test@example.com", "test_password")
        await auth.revoke_session(session.access_token)
        # Token should now be invalid
        with pytest.raises(ValueError):
            await auth.verify_token(session.access_token)

    @pytest.mark.asyncio
    async def test_get_user_by_id(self, auth: AuthProvider):
        """get_user_by_id should return User or None."""
        session = await auth.create_session("test@example.com", "test_password")
        user = await auth.get_user_by_id(session.user.id)
        assert user is not None
        assert user.id == session.user.id

        # Non-existent user
        user = await auth.get_user_by_id("nonexistent")
        assert user is None

    @pytest.mark.asyncio
    async def test_check_permission(self, auth: AuthProvider):
        """check_permission should return boolean."""
        session = await auth.create_session("test@example.com", "test_password")
        user = await auth.verify_token(session.access_token)

        # User has default permissions
        assert await auth.check_permission(user, Permissions.READ_MARKET_DATA) is True
        assert await auth.check_permission(user, Permissions.USE_SCREENER) is True

        # Non-existent permission should return False
        assert await auth.check_permission(user, "nonexistent:permission") is False

    @pytest.mark.asyncio
    async def test_password_hash_verify(self, auth: AuthProvider):
        """hash_password and verify_password should work together."""
        password = "test_password_123"
        hashed = await auth.hash_password(password)
        assert hashed != password
        assert await auth.verify_password(password, hashed) is True
        assert await auth.verify_password("wrong", hashed) is False


class TestPermissions:
    """Test permissions constants."""

    def test_all_permissions_defined(self):
        """All expected permissions should exist."""
        perms = Permissions.all()
        expected = [
            "read:market_data", "read:research", "read:analytics",
            "use:screener", "use:backtester", "use:alerts",
            "use:notebook", "use:reports",
            "admin:users", "admin:cache", "admin:system",
        ]
        for exp in expected:
            assert exp in perms, f"Missing permission: {exp}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])