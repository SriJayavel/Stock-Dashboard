"""
Event Bus Protocol - Defines the contract for event-driven communication.
Decouples services from each other via domain events.
"""
from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4
from typing_extensions import Protocol
from collections import defaultdict


@dataclass(frozen=True)
class DomainEvent:
    """Base domain event."""
    event_type: str
    aggregate_id: str  # e.g., "stock:AAPL", "user:123", "watchlist:456"
    payload: dict
    timestamp: datetime = field(default_factory=datetime.utcnow)
    event_id: str = field(default_factory=lambda: str(uuid4()))
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "aggregate_id": self.aggregate_id,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat() + "Z",
            "correlation_id": self.correlation_id,
            "causation_id": self.causation_id,
        }


# Standard event types
class EventTypes:
    # Market data
    MARKET_DATA_UPDATED = "market.data.updated"
    PRICE_TICK = "market.price.tick"
    CANDLE_CLOSED = "market.candle.closed"

    # Cache
    CACHE_WARMED = "cache.warmed"
    CACHE_INVALIDATED = "cache.invalidated"
    CACHE_REFRESH_STARTED = "cache.refresh.started"
    CACHE_REFRESH_COMPLETED = "cache.refresh.completed"

    # User actions
    USER_WATCHLIST_CHANGED = "user.watchlist.changed"
    USER_ALERT_TRIGGERED = "user.alert.triggered"
    USER_PREFERENCES_UPDATED = "user.preferences.updated"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"

    # Research
    RESEARCH_COMPLETED = "research.completed"
    STOCK_RESEARCH_COMPLETED = "stock.research.completed"
    DEEP_RESEARCH_COMPLETED = "deep_research.completed"

    # Analytics
    SCREENER_COMPLETED = "screener.completed"
    BACKTEST_COMPLETED = "backtest.completed"
    PORTFOLIO_UPDATED = "portfolio.updated"
    CORRELATION_COMPUTED = "correlation.computed"

    # System
    MARKET_OPEN = "system.market.open"
    MARKET_CLOSE = "system.market.close"
    HEALTH_CHECK_FAILED = "system.health.failed"

    @classmethod
    def all(cls) -> List[str]:
        """Get all event types."""
        return [
            cls.MARKET_DATA_UPDATED,
            cls.PRICE_TICK,
            cls.CANDLE_CLOSED,
            cls.CACHE_WARMED,
            cls.CACHE_INVALIDATED,
            cls.CACHE_REFRESH_STARTED,
            cls.CACHE_REFRESH_COMPLETED,
            cls.USER_WATCHLIST_CHANGED,
            cls.USER_ALERT_TRIGGERED,
            cls.USER_PREFERENCES_UPDATED,
            cls.USER_LOGIN,
            cls.USER_LOGOUT,
            cls.RESEARCH_COMPLETED,
            cls.STOCK_RESEARCH_COMPLETED,
            cls.DEEP_RESEARCH_COMPLETED,
            cls.SCREENER_COMPLETED,
            cls.BACKTEST_COMPLETED,
            cls.PORTFOLIO_UPDATED,
            cls.CORRELATION_COMPUTED,
            cls.MARKET_OPEN,
            cls.MARKET_CLOSE,
            cls.HEALTH_CHECK_FAILED,
        ]


class EventHandler(Protocol):
    """Protocol for event handlers."""

    async def __call__(self, event: DomainEvent) -> None:
        """Handle an event."""
        ...


class EventBusProtocol(Protocol):
    """Protocol for event bus."""

    async def publish(self, event: DomainEvent) -> None:
        """Publish an event to all subscribers."""
        ...

    async def publish_many(self, events: List[DomainEvent]) -> None:
        """Publish multiple events."""
        ...

    def subscribe(self, event_type: str, handler: EventHandler) -> str:
        """Subscribe to an event type. Returns subscription ID."""
        ...

    def unsubscribe(self, subscription_id: str) -> None:
        """Unsubscribe using subscription ID."""
        ...

    async def wait_for(self, event_type: str, aggregate_id: str, timeout: float = 30.0) -> Optional[DomainEvent]:
        """Wait for a specific event (for testing/integration)."""
        ...


# In-memory implementation for testing/local development
class InMemoryEventBus:
    """Simple in-memory event bus implementation."""

    def __init__(self):
        self._subscribers: dict[str, List[tuple[str, EventHandler]]] = defaultdict(list)
        self._subscription_counter = 0
        self._waiters: dict[str, List[asyncio.Future]] = defaultdict(list)

    async def publish(self, event: DomainEvent) -> None:
        # Notify direct subscribers
        for _, handler in self._subscribers.get(event.event_type, []):
            try:
                await handler(event)
            except Exception:
                # Log but don't stop other handlers
                import logging
                logging.getLogger("event_bus").exception(f"Handler failed for {event.event_type}")

        # Notify wildcard subscribers
        for _, handler in self._subscribers.get("*", []):
            try:
                await handler(event)
            except Exception:
                import logging
                logging.getLogger("event_bus").exception(f"Wildcard handler failed for {event.event_type}")

        # Notify waiters
        key = f"{event.event_type}:{event.aggregate_id}"
        for future in self._waiters.get(key, []):
            if not future.done():
                future.set_result(event)
        self._waiters[key] = [f for f in self._waiters[key] if not f.done()]

    async def publish_many(self, events: List[DomainEvent]) -> None:
        for event in events:
            await self.publish(event)

    def subscribe(self, event_type: str, handler: EventHandler) -> str:
        self._subscription_counter += 1
        sub_id = f"sub_{self._subscription_counter}"
        self._subscribers[event_type].append((sub_id, handler))
        return sub_id

    def unsubscribe(self, subscription_id: str) -> None:
        # Remove by subscription ID
        for event_type, handlers in self._subscribers.items():
            self._subscribers[event_type] = [(sid, h) for sid, h in handlers if sid != subscription_id]

    async def wait_for(self, event_type: str, aggregate_id: str, timeout: float = 30.0) -> Optional[DomainEvent]:
        import asyncio
        future = asyncio.get_event_loop().create_future()
        key = f"{event_type}:{aggregate_id}"
        self._waiters[key].append(future)
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self._waiters[key] = [f for f in self._waiters[key] if not f.done()]


# Global event bus instance (can be replaced in tests)
_event_bus: Optional[EventBusProtocol] = None


def get_event_bus() -> EventBusProtocol:
    """Get the global event bus instance."""
    global _event_bus
    if _event_bus is None:
        _event_bus = InMemoryEventBus()
    return _event_bus


def set_event_bus(bus: EventBusProtocol) -> None:
    """Set the global event bus (for testing)."""
    global _event_bus
    _event_bus = bus


# Helper for publishing common events
async def emit_market_data_updated(symbol: str, data: dict) -> None:
    """Emit market data updated event."""
    await get_event_bus().publish(DomainEvent(
        event_type=EventTypes.MARKET_DATA_UPDATED,
        aggregate_id=f"stock:{symbol}",
        payload={"symbol": symbol, "data": data}
    ))


async def emit_cache_warmed(namespace: str, keys: List[str]) -> None:
    """Emit cache warmed event."""
    await get_event_bus().publish(DomainEvent(
        event_type=EventTypes.CACHE_WARMED,
        aggregate_id=f"cache:{namespace}",
        payload={"namespace": namespace, "keys": keys}
    ))


async def emit_price_tick(symbol: str, price: float, timestamp: int) -> None:
    """Emit price tick for WebSocket push."""
    await get_event_bus().publish(DomainEvent(
        event_type=EventTypes.PRICE_TICK,
        aggregate_id=f"stock:{symbol}",
        payload={"symbol": symbol, "price": price, "timestamp": timestamp}
    ))