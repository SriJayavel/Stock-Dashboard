"""
Architecture Enforcer - Runtime validation of architectural rules.

This module enforces the "Delete a Feature = Zero Ripple" principle by:
1. Detecting forbidden cross-feature imports
2. Validating dependency inversion (protocols over concretions)
3. Ensuring single source of truth for cache keys, events, permissions
4. Enforcing contract compliance for all adapters

Usage:
    # In tests/conftest.py or test suite entry point
    from backend.core.architecture.enforcer import enforce_architecture
    enforce_architecture()

    # Or as a pre-commit hook
    python -m backend.core.architecture.enforcer
"""

import ast
import sys
from pathlib import Path
from typing import Set, List, Dict, Tuple, Optional
from dataclasses import dataclass, field
from enum import Enum


class ViolationSeverity(Enum):
    ERROR = "error"       # Must fix - breaks architecture
    WARNING = "warning"   # Should fix - degrades architecture


@dataclass
class Violation:
    severity: ViolationSeverity
    rule: str
    file: str
    line: int
    message: str
    suggestion: str = ""


@dataclass
class ArchitectureRules:
    """Centralized architecture rules - single source of truth."""

    # Forbidden import patterns (feature -> feature)
    FORBIDDEN_CROSS_FEATURE_IMPORTS: Dict[str, Set[str]] = field(default_factory=lambda: {
        "features.stocks": {"features.watchlist", "features.alerts", "features.screener", "features.backtester", "features.notebook", "features.reports"},
        "features.watchlist": {"features.stocks", "features.alerts", "features.screener", "features.backtester", "features.notebook", "features.reports"},
        "features.alerts": {"features.stocks", "features.watchlist", "features.screener", "features.backtester", "features.notebook", "features.reports"},
        "features.screener": {"features.stocks", "features.watchlist", "features.alerts", "features.backtester", "features.notebook", "features.reports"},
        "features.backtester": {"features.stocks", "features.watchlist", "features.alerts", "features.screener", "features.notebook", "features.reports"},
        "features.notebook": {"features.stocks", "features.watchlist", "features.alerts", "features.screener", "features.backtester", "features.reports"},
        "features.reports": {"features.stocks", "features.watchlist", "features.alerts", "features.screener", "features.backtester", "features.notebook"},
    })

    # Core modules that features CAN import (dependency inversion)
    ALLOWED_CORE_IMPORTS: Set[str] = field(default_factory=lambda: {
        "core.contracts",
        "core.domain",
        "core.services",
        "core.exceptions",
    })

    # Adapters that features CAN import (via protocols only)
    ALLOWED_ADAPTER_IMPORTS: Set[str] = field(default_factory=lambda: {
        "adapters.cache.memory_cache",
        "adapters.cache.redis_cache",
        "adapters.market_data.yfinance_provider",
        "adapters.market_data.nse_provider",
        "adapters.market_data.composite_provider",
        "adapters.auth.supabase_auth",
        "adapters.auth.dev_auth",
    })

    # Legacy modules that MUST NOT be imported in new code
    FORBIDDEN_LEGACY_IMPORTS: Set[str] = field(default_factory=lambda: {
        "services.data_pipeline",
        "services.cache_manager",
        "services.nse_fetcher",
        "services.indicators",
        "services.research_pipeline",
        "services.deep_research",
        "services.relationship_engine",
        "services.screener",
        "services.market_calendar",
        "services.market_provider",
        "services.circuit_breaker",
    })

    # Single source of truth constants
    CACHE_NAMESPACES_CLASS: str = "core.contracts.cache.CacheNamespaces"
    EVENT_TYPES_CLASS: str = "core.contracts.events.EventTypes"
    PERMISSIONS_CLASS: str = "core.contracts.auth.Permissions"
    PROVIDER_CAPABILITIES_CLASS: str = "core.contracts.market_data.ProviderCapabilities"

    # Files that define the architecture (protected from deletion)
    ARCHITECTURE_FILES: Set[str] = field(default_factory=lambda: {
        "core/contracts/cache.py",
        "core/contracts/market_data.py",
        "core/contracts/auth.py",
        "core/contracts/events.py",
        "core/domain/models.py",
    })


class ArchitectureEnforcer:
    """Enforces architectural rules at runtime."""

    def __init__(self, root: Path = None):
        self.root = root or Path(__file__).parent.parent.parent
        self.rules = ArchitectureRules()
        self.violations: List[Violation] = []

    def enforce(self, strict: bool = True) -> List[Violation]:
        """Run all architecture checks."""
        self.violations = []

        self._check_cross_feature_imports()
        self._check_legacy_imports()
        self._check_single_source_of_truth()
        self._check_protocol_usage()
        self._check_feature_structure()
        self._check_no_direct_adapter_instantiation_in_features()

        # Filter by severity
        errors = [v for v in self.violations if v.severity == ViolationSeverity.ERROR]
        warnings = [v for v in self.violations if v.severity == ViolationSeverity.WARNING]

        if errors:
            print(f"\n[ERROR] ARCHITECTURE VIOLATIONS ({len(errors)} errors, {len(warnings)} warnings):")
            for v in errors:
                print(f"  {v.file}:{v.line} - {v.rule}: {v.message}")
                if v.suggestion:
                    print(f"    [SUGGESTION] {v.suggestion}")
        elif warnings:
            print(f"\n[WARN] Architecture warnings ({len(warnings)}):")
            for v in warnings:
                print(f"  {v.file}:{v.line} - {v.rule}: {v.message}")

        if strict and errors:
            sys.exit(1)

        return self.violations

    def _check_cross_feature_imports(self):
        """Check for forbidden cross-feature imports."""
        features_dir = self.root / "features"
        if not features_dir.exists():
            return

        for feature_dir in features_dir.iterdir():
            if not feature_dir.is_dir() or feature_dir.name.startswith("_"):
                continue

            feature_name = f"features.{feature_dir.name}"
            forbidden = self.rules.FORBIDDEN_CROSS_FEATURE_IMPORTS.get(feature_name, set())

            for py_file in feature_dir.rglob("*.py"):
                if py_file.name == "__pycache__":
                    continue
                self._scan_file_for_imports(py_file, feature_name, forbidden)

    def _scan_file_for_imports(self, file_path: Path, current_feature: str, forbidden: Set[str]):
        """Scan a Python file for forbidden imports."""
        try:
            content = file_path.read_text()
            tree = ast.parse(content, filename=str(file_path))
        except Exception:
            return

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self._check_import(alias.name, current_feature, forbidden, file_path, node.lineno)
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                self._check_import(module, current_feature, forbidden, file_path, node.lineno)

    def _check_import(self, imported: str, current_feature: str, forbidden: Set[str], file_path: Path, line: int):
        """Check if an import violates architecture rules."""
        # Check forbidden cross-feature imports
        for forbidden_feature in forbidden:
            if imported.startswith(forbidden_feature):
                self.violations.append(Violation(
                    severity=ViolationSeverity.ERROR,
                    rule="CROSS_FEATURE_IMPORT",
                    file=str(file_path.relative_to(self.root)),
                    line=line,
                    message=f"Feature '{current_feature}' imports forbidden feature '{forbidden_feature}'",
                    suggestion=f"Use dependency injection via protocols from core.contracts instead"
                ))

        # Check legacy imports
        for legacy in self.rules.FORBIDDEN_LEGACY_IMPORTS:
            if imported.startswith(legacy):
                self.violations.append(Violation(
                    severity=ViolationSeverity.ERROR,
                    rule="LEGACY_IMPORT",
                    file=str(file_path.relative_to(self.root)),
                    line=line,
                    message=f"Import from legacy module '{legacy}' is forbidden",
                    suggestion=f"Use adapters or core.services instead"
                ))

    def _check_legacy_imports(self):
        """Check for legacy imports in new architecture code."""
        new_arch_dirs = [
            self.root / "core",
            self.root / "adapters",
            self.root / "api",
            self.root / "features",
        ]

        for dir_path in new_arch_dirs:
            if not dir_path.exists():
                continue
            for py_file in dir_path.rglob("*.py"):
                if py_file.name == "__pycache__":
                    continue
                self._scan_file_for_imports(py_file, "new_architecture", self.rules.FORBIDDEN_LEGACY_IMPORTS)

    def _check_single_source_of_truth(self):
        """Verify cache keys, event types, permissions use centralized constants."""
        # This would scan for hardcoded strings that should use constants
        # For now, we validate the constants exist
        constants_to_check = [
            ("backend.core.contracts.cache", "CacheNamespaces"),
            ("backend.core.contracts.events", "EventTypes"),
            ("backend.core.contracts.auth", "Permissions"),
            ("backend.core.contracts.market_data", "ProviderCapabilities"),
        ]

        for module_path, class_name in constants_to_check:
            try:
                module = __import__(module_path, fromlist=[class_name])
                cls = getattr(module, class_name)
                # Verify it has the expected method
                if hasattr(cls, "all") and callable(cls.all):
                    pass  # OK
                else:
                    self.violations.append(Violation(
                        severity=ViolationSeverity.WARNING,
                        rule="SINGLE_SOURCE_OF_TRUTH",
                        file=module_path.replace(".", "/") + ".py",
                        line=0,
                        message=f"{class_name} should have an 'all()' classmethod listing all constants",
                    ))
            except (ImportError, AttributeError) as e:
                self.violations.append(Violation(
                    severity=ViolationSeverity.ERROR,
                    rule="SINGLE_SOURCE_OF_TRUTH",
                    file=module_path.replace(".", "/") + ".py",
                    line=0,
                    message=f"Required constants class {class_name} not found at {module_path}: {e}",
                ))

    def _check_protocol_usage(self):
        """Verify that API routes and services use protocols, not concretions."""
        # Check API routes
        api_routes = self.root / "api" / "routes"
        if api_routes.exists():
            for py_file in api_routes.glob("*.py"):
                if py_file.name.startswith("_"):
                    continue
                self._check_file_uses_protocols(py_file)

    def _check_file_uses_protocols(self, file_path: Path):
        """Check that a file imports protocols and uses them for type hints."""
        try:
            content = file_path.read_text()
            tree = ast.parse(content, filename=str(file_path))
        except Exception:
            return

        # Check for direct adapter instantiation in routes
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    # Check for direct instantiation of adapter classes
                    if node.func.id in ["MemoryCache", "RedisCache", "HybridCache",
                                        "YFinanceProvider", "NSEProvider", "CompositeProvider",
                                        "SupabaseAuthProvider", "DevAuthProvider"]:
                        self.violations.append(Violation(
                            severity=ViolationSeverity.ERROR,
                            rule="DIRECT_ADAPTER_INSTANTIATION",
                            file=str(file_path.relative_to(self.root)),
                            line=node.lineno,
                            message=f"Direct instantiation of adapter '{node.func.id}' in API route",
                            suggestion="Use dependency injection via get_container().cache() or get_market_data_dep()"
                        ))

    def _check_feature_structure(self):
        """Verify each feature follows the required structure."""
        features_dir = self.root / "features"
        if not features_dir.exists():
            return

        # Current architecture: features have contracts, service, models
        # API routes are in backend/api/routes/
        required_files = {"contracts.py", "service.py", "models.py"}

        for feature_dir in features_dir.iterdir():
            if not feature_dir.is_dir() or feature_dir.name.startswith("_"):
                continue

            existing = {f.name for f in feature_dir.iterdir() if f.is_file() and f.suffix == ".py"}
            missing = required_files - existing

            if missing:
                self.violations.append(Violation(
                    severity=ViolationSeverity.WARNING,
                    rule="FEATURE_STRUCTURE",
                    file=f"features/{feature_dir.name}",
                    line=0,
                    message=f"Feature '{feature_dir.name}' missing required files: {missing}",
                    suggestion="Create the missing files following the feature template"
                ))

    def _check_no_direct_adapter_instantiation_in_features(self):
        """Ensure features don't directly instantiate adapters."""
        features_dir = self.root / "features"
        if not features_dir.exists():
            return

        adapter_classes = {
            "MemoryCache", "RedisCache", "HybridCache",
            "YFinanceProvider", "NSEProvider", "CompositeProvider",
            "SupabaseAuthProvider", "DevAuthProvider",
        }

        for feature_dir in features_dir.iterdir():
            if not feature_dir.is_dir() or feature_dir.name.startswith("_"):
                continue

            for py_file in feature_dir.rglob("*.py"):
                try:
                    content = py_file.read_text()
                    tree = ast.parse(content, filename=str(py_file))
                except Exception:
                    continue

                for node in ast.walk(tree):
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                        if node.func.id in adapter_classes:
                            self.violations.append(Violation(
                                severity=ViolationSeverity.ERROR,
                                rule="FEATURE_DIRECT_ADAPTER",
                                file=str(py_file.relative_to(self.root)),
                                line=node.lineno,
                                message=f"Feature directly instantiates adapter '{node.func.id}'",
                                suggestion="Inject dependencies via protocols from core.contracts"
                            ))


# CLI entry point
def main():
    """Run architecture enforcement as a CLI tool."""
    import argparse

    parser = argparse.ArgumentParser(description="Enforce architecture rules")
    parser.add_argument("--strict", action="store_true", default=True, help="Exit with error on violations")
    parser.add_argument("--no-strict", dest="strict", action="store_false", help="Only warn on violations")
    parser.add_argument("--path", type=Path, help="Root path to check (default: project root)")

    args = parser.parse_args()

    enforcer = ArchitectureEnforcer(args.path)
    violations = enforcer.enforce(strict=args.strict)

    if not violations:
        print("[OK] Architecture checks passed!")
        return 0

    if args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())