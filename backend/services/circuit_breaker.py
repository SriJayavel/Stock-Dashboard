"""
Simple circuit breaker pattern for external API calls.
Prevents cascading failures and allows graceful degradation.
"""
import time
import threading
from typing import Dict, Optional
from backend.config import settings
from backend.services import cache_manager

# In-memory failure tracking (in production, consider using Redis for distributed tracking)
_failure_counts: Dict[str, int] = {}
_last_failure_time: Dict[str, float] = {}
_circuit_open_until: Dict[str, float] = {}
_lock = threading.Lock()

# Configuration
FAILURE_THRESHOLD = getattr(settings, 'EXTERNAL_API_FAILURE_THRESHOLD', 5)
RECOVERY_TIMEOUT = getattr(settings, 'EXTERNAL_API_RECOVERY_TIMEOUT', 60)  # seconds


def record_failure(service_name: str) -> None:
    """Record a failure for the given service."""
    with _lock:
        _failure_counts[service_name] = _failure_counts.get(service_name, 0) + 1
        _last_failure_time[service_name] = time.time()

        # Check if we should open the circuit
        if _failure_counts[service_name] >= FAILURE_THRESHOLD:
            _circuit_open_until[service_name] = time.time() + RECOVERY_TIMEOUT


def record_success(service_name: str) -> None:
    """Record a success for the given service, resetting failure count."""
    with _lock:
        _failure_counts[service_name] = 0
        # If circuit was open, consider closing it on success
        if service_name in _circuit_open_until:
            del _circuit_open_until[service_name]


def is_circuit_open(service_name: str) -> bool:
    """Check if the circuit breaker is open for the given service."""
    with _lock:
        if service_name not in _circuit_open_until:
            return False

        # Check if recovery timeout has passed
        if time.time() >= _circuit_open_until[service_name]:
            # Recovery timeout passed, close circuit and allow trial request
            del _circuit_open_until[service_name]
            _failure_counts[service_name] = 0  # Reset failure count on trial
            return False

        return True


def get_failure_count(service_name: str) -> int:
    """Get current failure count for a service."""
    with _lock:
        return _failure_counts.get(service_name, 0)


def get_circuit_status(service_name: str) -> Dict[str, any]:
    """Get detailed circuit breaker status for monitoring."""
    with _lock:
        failure_count = _failure_counts.get(service_name, 0)
        last_failure = _last_failure_time.get(service_name, 0)
        open_until = _circuit_open_until.get(service_name, 0)

        return {
            "service": service_name,
            "failure_count": failure_count,
            "is_open": service_name in _circuit_open_until,
            "open_until": open_until,
            "seconds_until_retry": max(0, open_until - time.time()) if open_until > 0 else 0,
            "last_failure": last_failure,
        }


def reset_circuit_breaker(service_name: str) -> None:
    """Manually reset the circuit breaker (for admin purposes)."""
    with _lock:
        if service_name in _circuit_open_until:
            del _circuit_open_until[service_name]
        _failure_counts[service_name] = 0
        if service_name in _last_failure_time:
            del _last_failure_time[service_name]