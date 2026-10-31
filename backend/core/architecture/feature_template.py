"""
Feature Template - Copy this directory structure when creating a new feature.

Each feature MUST follow this structure to ensure:
1. Auto-discovery by main.py
2. Contract compliance via protocol tests
3. Zero coupling with other features
4. Consistent API patterns

Structure:
features/{feature_name}/
├── __init__.py           # Public exports ONLY
├── contracts.py          # Protocol definition (REQUIRED)
├── service.py            # Business logic (REQUIRED)
├── api.py                # FastAPI router (REQUIRED)
├── models.py             # Pydantic DTOs (REQUIRED)
├── domain.py             # Pure domain logic (optional)
├── tests/
│   ├── __init__.py
│   ├── test_contract.py  # Contract tests (REQUIRED)
│   ├── test_service.py   # Unit tests
│   └── test_api.py       # Integration tests
└── README.md             # Feature documentation
"""

# Feature template files content
FEATURE_TEMPLATE = {
    "__init__.py": '''"""
{feature_name} Feature - Public API exports only.
"""
from .contracts import {FeatureName}Protocol
from .service import {FeatureName}Service
from .api import router

__all__ = [
    "{FeatureName}Protocol",
    "{FeatureName}Service",
    "router",
]
''',

    "contracts.py": '''"""
{feature_name} Contracts - Protocol definition for {feature_name}.
All implementations MUST satisfy this protocol.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from backend.core.domain.models import {DomainModel}


class {FeatureName}Protocol(ABC):
    """Protocol for {feature_name} operations."""

    @abstractmethod
    async def get_{feature_name}(self, user_id: str) -> List[{DomainModel}]:
        """Get {feature_name} for user."""
        ...

    @abstractmethod
    async def create_{feature_name}(self, user_id: str, data: {DomainModel}) -> {DomainModel}:
        """Create new {feature_name}."""
        ...

    @abstractmethod
    async def update_{feature_name}(self, user_id: str, item_id: str, data: {DomainModel}) -> {DomainModel}:
        """Update {feature_name}."""
        ...

    @abstractmethod
    async def delete_{feature_name}(self, user_id: str, item_id: str) -> None:
        """Delete {feature_name}."""
        ...
''',

    "service.py": '''"""
{feature_name} Service - Pure business logic.
Depends ONLY on protocols from core.contracts, never on concrete adapters.
"""
from typing import List, Optional
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.events import EventBusProtocol, emit_{feature_name}_event
from .contracts import {FeatureName}Protocol
from .models import {DomainModel}


class {FeatureName}Service:
    """Business logic for {feature_name}."""

    def __init__(
        self,
        cache: CacheProtocol,
        event_bus: EventBusProtocol,
    ):
        self._cache = cache
        self._events = event_bus

    async def get_{feature_name}(self, user_id: str) -> List[{DomainModel}]:
        """Get {feature_name} for user."""
        # Check cache first
        cached = await self._cache.get("feature:{feature_name}", f"user:{user_id}")
        if cached:
            return cached

        # ... business logic here ...

        # Emit event
        await emit_{feature_name}_event(user_id, "retrieved", {{"count": len(result)}})
        return result

    async def create_{feature_name}(self, user_id: str, data: {DomainModel}) -> {DomainModel}:
        """Create new {feature_name}."""
        # ... validation and business logic ...

        # Invalidate cache
        await self._cache.delete("feature:{feature_name}", f"user:{user_id}")

        # Emit event
        await emit_{feature_name}_event(user_id, "created", data.dict())
        return result

    async def update_{feature_name}(self, user_id: str, item_id: str, data: {DomainModel}) -> {DomainModel}:
        """Update {feature_name}."""
        # ... business logic ...

        # Invalidate cache
        await self._cache.delete("feature:{feature_name}", f"user:{user_id}")

        # Emit event
        await emit_{feature_name}_event(user_id, "updated", {{"id": item_id, **data.dict()}})
        return result

    async def delete_{feature_name}(self, user_id: str, item_id: str) -> None:
        """Delete {feature_name}."""
        # ... business logic ...

        # Invalidate cache
        await self._cache.delete("feature:{feature_name}", f"user:{user_id}")

        # Emit event
        await emit_{feature_name}_event(user_id, "deleted", {{"id": item_id}})
''',

    "api.py": '''"""
{feature_name} API - FastAPI routes.
Thin layer: only HTTP concerns, delegates to service.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from backend.api.dependencies import get_{feature_name}_service
from .contracts import {FeatureName}Protocol
from .models import {DomainModel}Create, {DomainModel}Response, {DomainModel}Update

router = APIRouter(prefix="/api/{feature_name}", tags=["{feature_name}"])


@router.get("", response_model=List[{DomainModel}Response])
async def get_{feature_name}(
    service: {FeatureName}Protocol = Depends(get_{feature_name}_service),
    # user_id from auth middleware
):
    """Get {feature_name} for current user."""
    return await service.get_{feature_name}(user_id="current_user")


@router.post("", response_model={DomainModel}Response, status_code=status.HTTP_201_CREATED)
async def create_{feature_name}(
    data: {DomainModel}Create,
    service: {FeatureName}Protocol = Depends(get_{feature_name}_service),
):
    """Create new {feature_name}."""
    return await service.create_{feature_name}(user_id="current_user", data=data)


@router.put("/{{item_id}}", response_model={DomainModel}Response)
async def update_{feature_name}(
    item_id: str,
    data: {DomainModel}Update,
    service: {FeatureName}Protocol = Depends(get_{feature_name}_service),
):
    """Update {feature_name}."""
    return await service.update_{feature_name}(user_id="current_user", item_id=item_id, data=data)


@router.delete("/{{item_id}}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_{feature_name}(
    item_id: str,
    service: {FeatureName}Protocol = Depends(get_{feature_name}_service),
):
    """Delete {feature_name}."""
    await service.delete_{feature_name}(user_id="current_user", item_id=item_id)
''',

    "models.py": '''"""
{feature_name} Models - Pydantic DTOs for API requests/responses.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from backend.core.domain.models import {DomainModel} as Domain{DomainModel}


class {DomainModel}Base(BaseModel):
    """Base {domain_model} fields."""
    # Add fields here matching Domain{DomainModel}
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class {DomainModel}Create({DomainModel}Base):
    """Request model for creating {feature_name}."""
    pass


class {DomainModel}Update(BaseModel):
    """Request model for updating {feature_name}."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None


class {DomainModel}Response({DomainModel}Base):
    """Response model for {feature_name}."""
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
''',

    "tests/test_contract.py": '''"""
Contract Tests - Verify all implementations satisfy {FeatureName}Protocol.
Run: pytest features/{feature_name}/tests/test_contract.py -v
"""
import pytest
from typing import List

from backend.features.{feature_name}.contracts import {FeatureName}Protocol
from backend.features.{feature_name}.service import {FeatureName}Service
from backend.core.contracts.cache import CacheProtocol
from backend.core.contracts.events import EventBusProtocol


class Test{FeatureName}Contract:
    """Contract tests that ALL implementations must pass."""

    @pytest.fixture
    async def cache(self) -> CacheProtocol:
        from backend.adapters.cache.memory_cache import MemoryCache
        return MemoryCache()

    @pytest.fixture
    async def event_bus(self) -> EventBusProtocol:
        from backend.core.contracts.events import InMemoryEventBus
        return InMemoryEventBus()

    @pytest.fixture
    async def service(self, cache: CacheProtocol, event_bus: EventBusProtocol) -> {FeatureName}Protocol:
        return {FeatureName}Service(cache=cache, event_bus=event_bus)

    @pytest.mark.asyncio
    async def test_get_{feature_name}_returns_list(self, service: {FeatureName}Protocol):
        """get_{feature_name} should return a list."""
        result = await service.get_{feature_name}("test_user")
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_create_{feature_name}_returns_item(self, service: {FeatureName}Protocol):
        """create_{feature_name} should return created item."""
        from .models import {DomainModel}Create
        data = {DomainModel}Create(name="Test")
        result = await service.create_{feature_name}("test_user", data)
        assert result.name == "Test"

    @pytest.mark.asyncio
    async def test_delete_{feature_name}_removes_item(self, service: {FeatureName}Protocol):
        """delete_{feature_name} should remove item."""
        from .models import {DomainModel}Create
        data = {DomainModel}Create(name="Test")
        created = await service.create_{feature_name}("test_user", data)
        await service.delete_{feature_name}("test_user", created.id)
        result = await service.get_{feature_name}("test_user")
        assert len(result) == 0
''',
}


def generate_feature(feature_name: str, domain_model: str = None) -> dict:
    """Generate feature template files."""
    feature_name_pascal = feature_name.title().replace("_", "")
    domain_model = domain_model or feature_name_pascal

    replacements = {
        "feature_name": feature_name,
        "FeatureName": feature_name_pascal,
        "DomainModel": domain_model,
        "domain_model": domain_model.lower(),
    }

    result = {}
    for filename, content in FEATURE_TEMPLATE.items():
        for key, value in replacements.items():
            content = content.replace(f"{{{key}}}", value)
        result[filename] = content

    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python -m backend.core.architecture.feature_template <feature_name> [DomainModel]")
        sys.exit(1)

    feature_name = sys.argv[1]
    domain_model = sys.argv[2] if len(sys.argv) > 2 else None

    files = generate_feature(feature_name, domain_model)

    for filename, content in files.items():
        print(f"=== {filename} ===")
        print(content)
        print()