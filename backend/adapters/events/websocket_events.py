"""
WebSocket Event Bus Adapter.
Publishes events to connected WebSocket clients for real-time updates.
"""
import asyncio
import json
import logging
from typing import Any, Callable, Awaitable, List, Optional, Set
from dataclasses import dataclass

from backend.core.contracts.events import EventBusProtocol, DomainEvent, EventTypes, EventHandler

logger = logging.getLogger("websocket_events")


@dataclass
class WebSocketConnection:
    """Represents a connected WebSocket client."""
    client_id: str
    websocket: Any  # WebSocket object
    subscriptions: Set[str] = None

    def __post_init__(self):
        if self.subscriptions is None:
            self.subscriptions = set()


class WebSocketEventBus:
    """
    Event bus that broadcasts events to WebSocket clients.

    Features:
    - Subscribe/unsubscribe to event types per connection
    - Automatic reconnection handling
    - Event filtering by aggregate_id
    - Broadcast to all or specific connections
    """

    def __init__(self):
        self._connections: dict[str, WebSocketConnection] = {}
        self._local_handlers: dict[str, List[tuple[int, EventHandler]]] = {}
        self._subscription_counter = 0

    async def publish(self, event: DomainEvent) -> None:
        """Publish event to local handlers and WebSocket clients."""
        # Notify local handlers (for same-process subscribers)
        for _, handler in self._local_handlers.get(event.event_type, []):
            try:
                await handler(event)
            except Exception:
                logger.exception(f"Local handler failed for {event.event_type}")

        # Notify wildcard local handlers
        for _, handler in self._local_handlers.get("*", []):
            try:
                await handler(event)
            except Exception:
                logger.exception(f"Wildcard local handler failed for {event.event_type}")

        # Broadcast to WebSocket clients
        await self._broadcast_to_websockets(event)

    async def publish_many(self, events: List[DomainEvent]) -> None:
        """Publish multiple events."""
        for event in events:
            await self.publish(event)

    def subscribe(self, event_type: str, handler: EventHandler) -> str:
        """Subscribe a local handler to an event type."""
        self._subscription_counter += 1
        sub_id = f"local_sub_{self._subscription_counter}"

        if event_type not in self._local_handlers:
            self._local_handlers[event_type] = []
        self._local_handlers[event_type].append((self._subscription_counter, handler))

        return sub_id

    def unsubscribe(self, subscription_id: str) -> None:
        """Unsubscribe a local handler."""
        # Extract the counter from sub_id like "local_sub_1"
        try:
            target_id = int(subscription_id.split("_")[-1])
        except (ValueError, IndexError):
            return

        for handlers in self._local_handlers.values():
            handlers[:] = [(sid, h) for sid, h in handlers if sid != target_id]
        # Extract the counter from sub_id like "local_sub_1"
        try:
            target_id = int(subscription_id.split("_")[-1])
        except (ValueError, IndexError):
            return

        for handlers in self._local_handlers.values():
            handlers[:] = [h for i, h in enumerate(handlers, 1) if i != target_id]

    async def wait_for(self, event_type: str, aggregate_id: str, timeout: float = 30.0) -> Optional[DomainEvent]:
        """Wait for a specific event (for testing)."""
        future = asyncio.get_event_loop().create_future()

        async def waiter(event: DomainEvent):
            if event.aggregate_id == aggregate_id:
                future.set_result(event)

        sub_id = self.subscribe(event_type, waiter)
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self.unsubscribe(sub_id)

    # --- WebSocket Connection Management ---

    def register_connection(self, client_id: str, websocket: Any) -> WebSocketConnection:
        """Register a new WebSocket connection."""
        conn = WebSocketConnection(client_id=client_id, websocket=websocket)
        self._connections[client_id] = conn
        logger.info(f"WebSocket client connected: {client_id} (total: {len(self._connections)})")
        return conn

    def unregister_connection(self, client_id: str) -> None:
        """Unregister a WebSocket connection."""
        if client_id in self._connections:
            del self._connections[client_id]
            logger.info(f"WebSocket client disconnected: {client_id} (total: {len(self._connections)})")

    def subscribe_client(self, client_id: str, event_type: str) -> bool:
        """Subscribe a WebSocket client to an event type."""
        conn = self._connections.get(client_id)
        if conn:
            conn.subscriptions.add(event_type)
            logger.debug(f"Client {client_id} subscribed to {event_type}")
            return True
        return False

    def unsubscribe_client(self, client_id: str, event_type: str) -> bool:
        """Unsubscribe a WebSocket client from an event type."""
        conn = self._connections.get(client_id)
        if conn:
            conn.subscriptions.discard(event_type)
            logger.debug(f"Client {client_id} unsubscribed from {event_type}")
            return True
        return False

    # --- Broadcasting ---

    async def _broadcast_to_websockets(self, event: DomainEvent) -> None:
        """Broadcast event to all subscribed WebSocket clients."""
        if not self._connections:
            return

        message = json.dumps(event.to_dict())
        dead_connections = []

        for client_id, conn in self._connections.items():
            # Check if client is subscribed to this event type or wildcard
            if "*" in conn.subscriptions or event.event_type in conn.subscriptions:
                try:
                    await conn.websocket.send_text(message)
                except Exception as e:
                    logger.warning(f"Failed to send to {client_id}: {e}")
                    dead_connections.append(client_id)

        # Clean up dead connections
        for client_id in dead_connections:
            self.unregister_connection(client_id)

    async def broadcast_to_client(self, client_id: str, event: DomainEvent) -> bool:
        """Send event to a specific client."""
        conn = self._connections.get(client_id)
        if not conn:
            return False

        try:
            await conn.websocket.send_text(json.dumps(event.to_dict()))
            return True
        except Exception as e:
            logger.warning(f"Failed to send to {client_id}: {e}")
            self.unregister_connection(client_id)
            return False

    def get_connected_clients(self) -> List[str]:
        """Get list of connected client IDs."""
        return list(self._connections.keys())

    def get_client_subscriptions(self, client_id: str) -> Set[str]:
        """Get subscriptions for a client."""
        conn = self._connections.get(client_id)
        return conn.subscriptions if conn else set()

    # --- Health ---

    async def health_check(self) -> bool:
        return True

    async def close(self) -> None:
        """Close all connections and clean up."""
        for client_id, conn in self._connections.items():
            try:
                await conn.websocket.close()
            except Exception:
                pass
        self._connections.clear()
        self._local_handlers.clear()
        logger.info("WebSocket event bus closed")