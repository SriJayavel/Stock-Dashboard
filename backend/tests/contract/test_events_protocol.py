"""
Contract Tests - Verify all event bus implementations comply with EventBusProtocol.
Run: pytest backend/tests/contract/test_events_protocol.py -v
"""
import pytest
import asyncio
from backend.core.contracts.events import EventBusProtocol, DomainEvent, EventTypes
from backend.adapters.events.websocket_events import WebSocketEventBus
from backend.core.contracts.events import InMemoryEventBus


class TestEventBusContract:
    """Contract tests that ALL event bus implementations must pass."""

    @pytest.fixture(params=["memory", "websocket"])
    async def event_bus(self, request) -> EventBusProtocol:
        """Fixture providing different event bus implementations."""
        if request.param == "memory":
            yield InMemoryEventBus()
        elif request.param == "websocket":
            bus = WebSocketEventBus()
            yield bus
            await bus.close()

    @pytest.mark.asyncio
    async def test_publish_subscribe(self, event_bus: EventBusProtocol):
        """Publish and subscribe should work."""
        received = []

        async def handler(event: DomainEvent):
            received.append(event)

        sub_id = event_bus.subscribe(EventTypes.CACHE_WARMED, handler)
        await event_bus.publish(DomainEvent(
            event_type=EventTypes.CACHE_WARMED,
            aggregate_id="test",
            payload={"namespace": "test", "keys": ["key1"]},
        ))

        # Give time for async processing
        await asyncio.sleep(0.1)

        assert len(received) == 1
        assert received[0].event_type == EventTypes.CACHE_WARMED
        assert received[0].payload["namespace"] == "test"

    @pytest.mark.asyncio
    async def test_multiple_subscribers(self, event_bus: EventBusProtocol):
        """Multiple subscribers should all receive events."""
        received_1 = []
        received_2 = []

        async def handler1(event: DomainEvent):
            received_1.append(event)

        async def handler2(event: DomainEvent):
            received_2.append(event)

        event_bus.subscribe(EventTypes.MARKET_DATA_UPDATED, handler1)
        event_bus.subscribe(EventTypes.MARKET_DATA_UPDATED, handler2)

        await event_bus.publish(DomainEvent(
            event_type=EventTypes.MARKET_DATA_UPDATED,
            aggregate_id="test",
            payload={"symbol": "AAPL", "price": 150.0},
        ))

        await asyncio.sleep(0.1)

        assert len(received_1) == 1
        assert len(received_2) == 1

    @pytest.mark.asyncio
    async def test_unsubscribe(self, event_bus: EventBusProtocol):
        """Unsubscribe should stop receiving events."""
        received = []

        async def handler(event: DomainEvent):
            received.append(event)

        sub_id = event_bus.subscribe(EventTypes.STOCK_RESEARCH_COMPLETED, handler)
        event_bus.unsubscribe(sub_id)

        await event_bus.publish(DomainEvent(
            event_type=EventTypes.STOCK_RESEARCH_COMPLETED,
            aggregate_id="test",
            payload={"symbol": "AAPL"},
        ))

        await asyncio.sleep(0.1)

        assert len(received) == 0

    @pytest.mark.asyncio
    async def test_wait_for(self, event_bus: EventBusProtocol):
        """Wait for should return the event."""
        # Start waiting first
        wait_task = asyncio.create_task(
            event_bus.wait_for(EventTypes.SCREENER_COMPLETED, "query_123", timeout=1.0)
        )

        # Give wait_for time to register
        await asyncio.sleep(0.05)

        # Then publish
        await event_bus.publish(DomainEvent(
            event_type=EventTypes.SCREENER_COMPLETED,
            aggregate_id="query_123",
            payload={"query_id": "123", "results": 10},
        ))

        event = await wait_task
        assert event is not None
        assert event.event_type == EventTypes.SCREENER_COMPLETED
        assert event.aggregate_id == "query_123"

    @pytest.mark.asyncio
    async def test_wildcard_subscription(self, event_bus: EventBusProtocol):
        """Wildcard subscription should receive all events."""
        received = []

        async def handler(event: DomainEvent):
            received.append(event)

        event_bus.subscribe("*", handler)

        await event_bus.publish(DomainEvent(
            event_type=EventTypes.CACHE_WARMED,
            aggregate_id="test",
            payload={},
        ))
        await event_bus.publish(DomainEvent(
            event_type=EventTypes.MARKET_DATA_UPDATED,
            aggregate_id="test",
            payload={},
        ))

        await asyncio.sleep(0.1)

        assert len(received) == 2


class TestEventTypes:
    """Test event types constants."""

    def test_all_event_types_defined(self):
        """All expected event types should exist."""
        events = EventTypes.all()
        expected = [
            "cache.warmed",
            "market.data.updated",
            "stock.research.completed",
            "screener.completed",
            "backtest.completed",
            "user.alert.triggered",
            "portfolio.updated",
            "user.login",
            "user.logout",
        ]
        for exp in expected:
            assert exp in events, f"Missing event type: {exp}"