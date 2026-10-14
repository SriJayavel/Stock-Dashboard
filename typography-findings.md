# Typography Findings Review

## Violations of Better-Typography Principles

| Severity | Location | Before | After | Why |
|----------|----------|--------|-------|-----|
| MEDIUM | frontend/src/styles/terminal.css:36 | `font-size: clamp(38px, 5.2vw, 58px);` | `font-size: var(--font-size-4xl);` | Violates "Use a type scale with semantic names" - hard-coded values bypass the established typographic scale. |
| MEDIUM | frontend/src/styles/terminal.css:37 | `font-size: 15px;` | `font-size: var(--font-size-lg);` | Violates "Use a type scale with semantic names" - hard-coded pixel value instead of scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:40 | `font-size: 15px;` | `font-size: var(--font-size-lg);` | Violates "Use a type scale with semantic names" - hard-coded pixel value instead of scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:48 | `font-size: 23px;` | `font-size: var(--font-size-3xl);` | Violates "Use a type scale with semantic names" - hard-coded pixel value instead of scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:49 | `font-size: var(--font-size-base);` | `font-size: var(--font-size-base);` | Already compliant - using scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:54 | `font-size: var(--font-size-xs);` | `font-size: var(--font-size-xs);` | Already compliant - using scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:73 | `font-size: var(--font-size-xs);` | `font-size: var(--font-size-xs);` | Already compliant - using scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:78 | `font-size: var(--font-size-xs);` | `font-size: var(--font-size-xs);` | Already compliant - using scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:80 | `font-size: var(--font-size-xs);` | `font-size: var(--font-size-xs);` | Already compliant - using scale variable. |
| MEDIUM | frontend/src/styles/terminal.css:91 | `font-size: clamp(36px, 10vw, 48px);` | `font-size: var(--font-size-3xl);` | Violates "Use a type scale with semantic names" - hard-coded values bypass the established typographic scale. |
| MEDIUM | frontend/src/styles/terminal.css:36 | `line-height: 1.06;` | `line-height: 1.1;` | Violates "Line-height by role" - headings should have tighter line-height around 1.1. |
| MEDIUM | frontend/src/styles/terminal.css:37 | `line-height: 1.75;` | `line-height: 1.6;` | Violates "Line-height by role" - body copy should be 1.5 to 1.6. |
| MEDIUM | frontend/src/styles/terminal.css:49 | `line-height: 1.65;` | `line-height: 1.6;` | Violates "Line-height by role" - slightly high for body copy, should be 1.5 to 1.6. |
| MEDIUM | frontend/src/styles/terminal.css:73 | `line-height: 1.5;` | `line-height: 1.5;` | Already compliant - appropriate for body copy. |
| MEDIUM | frontend/src/styles/terminal.css:78 | `line-height: 1.7;` | `line-height: 1.6;` | Violates "Line-height by role" - too high for body copy, should be 1.5 to 1.6. |
| MEDIUM | frontend/src/styles/terminal.css:83 | `line-height: 1.2;` | `line-height: 1.2;` | Acceptable - tight line-height for short text/labels. |
| MEDIUM | frontend/src/styles/terminal.css:29 | `letter-spacing: -.2px;` | `letter-spacing: -0.02em;` | Violates "Letter-spacing by size" - should use relative units (em) for scalability. Value may need adjustment. |
| MEDIUM | frontend/src/styles/terminal.css:33 | `letter-spacing: 1.1px;` | `letter-spacing: 0.08em;` | Violates "Letter-spacing by size" - should use relative units (em) for scalability. Value may need adjustment. |
| MEDIUM | frontend/src/styles/terminal.css:36 | `letter-spacing: -2.6px;` | `letter-spacing: -0.2em;` | Violates "Letter-spacing by size" - should use relative units (em) for scalability. Value may need adjustment. |
| MEDIUM | frontend/src/styles/terminal.css:39 | `letter-spacing: .4px;` | `letter-spacing: 0.03em;` | Violates "Letter-spacing by size" - should use relative units (em) for scalability. Value may need adjustment. |
| MEDIUM | frontend/src/styles/terminal.css:46 | `letter-spacing: 0;` | `letter-spacing: 0;` | Already compliant - no letter-spacing for body copy is correct. |
| MEDIUM | frontend/src/styles/terminal.css:48 | `letter-spacing: -.5px;` | `letter-spacing: -0.04em;` | Violates "Letter-spacing by size" - should use relative units (em) for scalability. Value may need adjustment. |
| MEDIUM | frontend/src/styles/terminal.css:32 | `max-width: 560px;` | `max-width: 42rem;` | Violates "Cap the measure" - should use relative units (rem/chars) for scalability and consistent measure. |
| MEDIUM | frontend/src/styles/terminal.css:37 | `max-width: 430px;` | `max-width: 32rem;` | Violates "Cap the measure" - should use relative units (rem/chars) for scalability and consistent measure. |
| LOW | Multiple locations | `user-select: none;` | Review each instance | Potential overuse - verify user-select: none is only applied to draggable/gesture-driven surfaces where selection interferes, not broadly across interface. |