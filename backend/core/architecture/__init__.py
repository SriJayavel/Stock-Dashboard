"""
Architecture Enforcement Module

This module provides runtime validation of architectural rules to ensure:
- Zero coupling between features (Delete a Feature = Zero Ripple)
- Dependency inversion (protocols over concretions)
- Single source of truth for constants
- Contract compliance for all adapters

Usage:
    from backend.core.architecture import enforce_architecture
    enforce_architecture()  # Run in tests or as pre-commit hook
"""

from .enforcer import ArchitectureEnforcer, ArchitectureRules, Violation, ViolationSeverity

__all__ = [
    "ArchitectureEnforcer",
    "ArchitectureRules",
    "Violation",
    "ViolationSeverity",
]

def enforce_architecture(strict: bool = True) -> list:
    """Enforce all architecture rules."""
    enforcer = ArchitectureEnforcer()
    return enforcer.enforce(strict=strict)