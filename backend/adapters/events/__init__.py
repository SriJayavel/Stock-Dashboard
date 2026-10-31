"""
Events Adapters - Implementations of EventBusProtocol.
"""
from .websocket_events import WebSocketEventBus

# InMemoryEventBus is defined in core.contracts.events
from backend.core.contracts.events import InMemoryEventBus

__all__ = [
    "WebSocketEventBus",
    "InMemoryEventBus",
]