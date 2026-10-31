"""
WebSocket Routes - Live market data.
"""
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, Set, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.websockets import WebSocketState

from backend.core.contracts.events import (
    EventBusProtocol, DomainEvent, get_event_bus, EventTypes
)
from backend.api.dependencies import get_event_bus_dep

router = APIRouter(prefix="/ws", tags=["websocket"])

logger = logging.getLogger("websocket")


class ConnectionManager:
    """Manages WebSocket connections with symbol subscriptions."""

    def __init__(self, event_bus: EventBusProtocol):
        self.active: Dict[str, Set[WebSocket]] = {}  # symbol -> websockets
        self.client_symbols: Dict[WebSocket, Set[str]] = {}  # ws -> symbols
        self._event_bus = event_bus
        self._subscriptions: Dict[str, str] = {}  # event_type -> sub_id
        self._running = False

    async def connect(self, websocket: WebSocket, symbols: List[str]):
        await websocket.accept()
        self.client_symbols[websocket] = set(symbols)

        for symbol in symbols:
            if symbol not in self.active:
                self.active[symbol] = set()
            self.active[symbol].add(websocket)

        logger.info(f"WS connected: {symbols}")

        # Subscribe to price ticks if not already
        if not self._running:
            await self._subscribe_events()

    def disconnect(self, websocket: WebSocket):
        symbols = self.client_symbols.pop(websocket, set())
        for symbol in symbols:
            if symbol in self.active:
                self.active[symbol].discard(websocket)
                if not self.active[symbol]:
                    del self.active[symbol]
        logger.info(f"WS disconnected: {symbols}")

    async def subscribe(self, websocket: WebSocket, symbols: List[str]):
        for symbol in symbols:
            if symbol not in self.active:
                self.active[symbol] = set()
            self.active[symbol].add(websocket)
        self.client_symbols[websocket].update(symbols)
        logger.info(f"WS subscribed: {symbols}")

    async def unsubscribe(self, websocket: WebSocket, symbols: List[str]):
        for symbol in symbols:
            if symbol in self.active:
                self.active[symbol].discard(websocket)
                if not self.active[symbol]:
                    del self.active[symbol]
        self.client_symbols[websocket].difference_update(symbols)
        logger.info(f"WS unsubscribed: {symbols}")

    async def _subscribe_events(self):
        """Subscribe to event bus for price ticks."""
        if self._running:
            return

        self._subscriptions[EventTypes.PRICE_TICK] = self._event_bus.subscribe(
            EventTypes.PRICE_TICK, self._handle_price_tick
        )
        self._running = True

    async def _handle_price_tick(self, event: DomainEvent):
        """Handle price tick event - broadcast to subscribed clients."""
        symbol = event.payload.get("symbol")
        if not symbol or symbol not in self.active:
            return

        message = json.dumps({
            "type": "price_update",
            "symbol": symbol,
            "data": event.payload,
            "timestamp": event.timestamp.isoformat() + "Z"
        })

        disconnected = set()
        for ws in self.active[symbol].copy():
            if ws.client_state == WebSocketState.CONNECTED:
                try:
                    await ws.send_text(message)
                except Exception:
                    disconnected.add(ws)

        for ws in disconnected:
            self.disconnect(ws)

    async def broadcast(self, message: dict):
        """Broadcast to all connected clients."""
        text = json.dumps(message)
        all_ws = set()
        for ws_set in self.active.values():
            all_ws.update(ws_set)

        disconnected = set()
        for ws in all_ws:
            if ws.client_state == WebSocketState.CONNECTED:
                try:
                    await ws.send_text(text)
                except Exception:
                    disconnected.add(ws)

        for ws in disconnected:
            self.disconnect(ws)


# Global manager (set at startup)
_manager: Optional[ConnectionManager] = None


def get_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager(get_event_bus())
    return _manager


@router.websocket("/markets")
async def markets_websocket(
    websocket: WebSocket,
    symbols: Optional[str] = Query(None, description="Comma-separated symbols"),
):
    """WebSocket for live market data.

    Client messages:
    - {"action": "subscribe", "symbols": ["AAPL", "TCS.NS"]}
    - {"action": "unsubscribe", "symbols": ["AAPL"]}
    - {"action": "ping"}

    Server messages:
    - {"type": "price_update", "symbol": "...", "data": {...}, "timestamp": "..."}
    - {"type": "market_status", "status": "live", "message": "...", "timestamp": "..."}
    - {"type": "heartbeat", "timestamp": "..."}
    """
    manager = get_manager()
    initial_symbols = symbols.split(",") if symbols else []

    await manager.connect(websocket, initial_symbols)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                syms = msg.get("symbols", [])

                if action == "subscribe":
                    await manager.subscribe(websocket, syms)
                elif action == "unsubscribe":
                    await manager.unsubscribe(websocket, syms)
                elif action == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(websocket)


async def broadcast_market_status(status: str, message: str = ""):
    """Broadcast market status to all clients."""
    manager = get_manager()
    await manager.broadcast({
        "type": "market_status",
        "status": status,
        "message": message,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })