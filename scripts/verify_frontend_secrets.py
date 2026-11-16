#!/usr/bin/env python3
"""
CI Secret Scan — Fails build if backend-only secrets leak into frontend/dist/
Run after `npm run build` in CI pipeline.
"""
import os
import sys
import re
from pathlib import Path

# Backend-only secret patterns that must NEVER appear in frontend build
FORBIDDEN_PATTERNS = [
    (r"SUPABASE_SERVICE_KEY", "Supabase service role key"),
    (r"INTERNAL_REFRESH_SECRET", "Internal cache refresh secret"),
    (r"REDIS_URL", "Redis connection URL"),
    (r"service_role", "Supabase service_role string"),
]

# Allowlisted patterns (safe in frontend)
ALLOWLIST_PATTERNS = [
    r"VITE_SUPABASE_URL",
    r"VITE_SUPABASE_ANON_KEY",
    r"VITE_SUPABASE_PUBLISHABLE_KEY",
    r"VITE_API_BASE_URL",
    r"VITE_API_URL",
]

DIST_DIR = Path("frontend/dist")
JS_FILES = list(DIST_DIR.rglob("*.js")) + list(DIST_DIR.rglob("*.map"))

# JWT pattern — we decode the role claim to distinguish safe anon keys from
# dangerous service_role keys. Supabase anon/publishable keys are safe to embed
# in frontend builds by design; only service_role keys must be blocked.
JWT_PATTERN = re.compile(r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+")


def jwt_role(token):
    """Return the 'role' claim from a JWT, or None if it cannot be decoded."""
    try:
        import base64, json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        return data.get("role")
    except Exception:
        return None


def main():
    if not DIST_DIR.exists():
        print(f"ERROR: {DIST_DIR} not found - run `npm run build` first")
        return 1

    violations = []
    for js_file in JS_FILES:
        try:
            content = js_file.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            print(f"WARN: Could not read {js_file}: {e}")
            continue

        for pattern, description in FORBIDDEN_PATTERNS:
            for match in re.finditer(pattern, content):
                context_start = max(0, match.start() - 50)
                context_end = min(len(content), match.end() + 50)
                context = content[context_start:context_end]

                allowlisted = any(re.search(ap, context) for ap in ALLOWLIST_PATTERNS)
                if not allowlisted:
                    violations.append({
                        "file": js_file.relative_to(DIST_DIR),
                        "pattern": pattern,
                        "description": description,
                        "context": context.strip()
                    })

        # JWT check: only flag tokens whose role claim is service_role
        for match in JWT_PATTERN.finditer(content):
            token = match.group(0)
            role = jwt_role(token)
            if role == "service_role":
                context_start = max(0, match.start() - 50)
                context_end = min(len(content), match.end() + 50)
                violations.append({
                    "file": js_file.relative_to(DIST_DIR),
                    "pattern": "JWT with role=service_role",
                    "description": "Supabase service role key (JWT)",
                    "context": content[context_start:context_end].strip()
                })

    if violations:
        print("FORBIDDEN SECRETS DETECTED IN FRONTEND BUILD:")
        print("=" * 60)
        for v in violations:
            print(f"File: {v['file']}")
            print(f"Pattern: {v['pattern']} ({v['description']})")
            print(f"Context: ...{v['context']}...")
            print("-" * 60)
        print(f"\nTotal violations: {len(violations)}")
        return 1

    print(f"Secret scan passed - {len(JS_FILES)} files checked, no forbidden secrets found")
    return 0

if __name__ == "__main__":
    sys.exit(main())