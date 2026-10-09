# Mara Stock Terminal — Stage 2 Audit: Spacing and Typography

**Date**: 2026-10-09  
**Stage**: 2 (Spacing and Typography - Audit Only Pass)  
**Priorities**: Professional visual hierarchy, compact information density, predictable spacing, readable market data, minimal regression risk  
**Objective**: Audit current spacing and typography usage against planned improvements and priorities

## Executive Summary

The Mara Stock Terminal has a foundational spacing and typography token system in place, but it's underutilized. Current implementation shows inconsistent application of spacing tokens and a lack of typographic scale, leading to inconsistent visual hierarchy and spacing patterns. The density token framework exists but needs broader adoption and a proper typographic hierarchy to meet the stated priorities.

## Current State Analysis

### ✅ Strengths (Existing Foundations)

#### Spacing System
1. **Density Tokens Defined**: 
   - `--density-font-ui: 13px` (UI font size - increased from 12px)
   - `--density-font-mono: 13px` (monospace font size - increased from 12px)
   - `--density-font-caption: 12px` (caption text - increased from 11px)
   - `--density-row-h: 36px` (row height - increased from 32px)
   - `--density-cell-pad-y: 8px` (vertical cell padding - increased from 6px)
   - `--density-cell-pad-x: 12px` (horizontal cell padding - increased from 10px)
2. **Multi-Mode Support**: Default, compact ([data-density="compact"]), and focus ([data-density="focus"]) density modes
3. **Partial Usage**: Density tokens used for padding/gap in header, workspace bar, and status bar

#### Typography System
1. **Font Stacks**: 
   - `--font-sans`: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif
   - `--font-mono`: "JetBrains Mono", "SFMono-Regular", Consolas, monospace
2. **Responsive Techniques**: Use of `clamp()` for fluid typography in auth gate sections

### ⚠️ Areas for Improvement

#### 1. Missing Typographic Scale (Visual Hierarchy)
**Issue**: No defined typographic scale - results in inconsistent font sizing
**Evidence**: 
- Hardcoded font sizes throughout: 9px, 10px, 11px, 12px, 13px, 14px, 15px, 16px, 23px
- Examples:
  - Line 13: `font-size: 14px;` (.auth-gate-brand)
  - Line 14: `font-size: 14px;` (.auth-brand-mark)  
  - Line 20: `font-size: clamp(38px, 5.2vw, 58px);` (.auth-gate-intro h1)
  - Line 21: `font-size: 15px;` (.auth-gate-intro > p)
  - Line 24: `font-size: 15px;` (.auth-preview-value)
  - Line 32: `font-size: 23px;` (.auth-card h2)
  - Line 33: `font-size: 13px;` (.auth-card > p)
  - Line 38: `font-size: 11px;` (.auth-field-label)
  - Line 50: `font-size: 11px;` (.auth-message)
  - Line 55: `font-size: 11px;` (.auth-privacy)
  - Line 57: `font-size: 11px;` (.auth-account)
  - Line 334: `font-size: 15px;`
  - Line 341: `font-size: 9px;`
  - Line 385: `font-size: 11.5px;`
  - Line 390: `font-size: 9.5px;`
  - Line 394: `font-size: 12px;`
  - Line 418: `font-size: 12px;`
  - Line 423: `font-size: 11px;`
  - Line 429: `font-size: 12px;`
  - Line 5345: `font-size: 11px;`
  - Line 5368: `font-size: 11px;`
  - Line 5388: `font-size: 11px;`
  - Line 5510: `font-size: 15px;`
  - Line 5522: `font-size: 16px;`
  - Line 5551: `font-size: 13px;`
  - Line 5560: `font-size: 12px;`
  - Line 5574: `font-size: 12px;`
  - Line 5628: `font-size: 14px;`
  - Line 5651: `font-size: 13px;`
  - Line 5658: `font-size: 11px;`
  - Line 5663: `font-size: 10px;`
  - Line 5673: `font-size: 11px;`
  - Line 5688: `font-size: 12px;`
  - Line 5717: `font-size: 10px;`
  - Line 5738: `font-size: 13px;`
  - Line 5749: `font-size: 13px;`
  - Line 5760: `font-size: 11px;`
  - Line 5777: `font-size: 12px;`
  - Line 5861: `font-size: 11px;`

**Impact**: 
- Inconsistent visual hierarchy (unclear relationship between headings, body text, captions)
- Poor readability due to arbitrary sizing choices
- Difficulty maintaining consistent typography across updates

#### 2. Inconsistent Spacing Token Usage
**Issue**: Density tokens used selectively, not comprehensively
**Evidence**:
- **Used for padding/gap**:
  - Line 313: `padding: 0 var(--density-cell-pad-x);` (mara-global-header)
  - Line 314: `gap: var(--density-cell-pad-x);` (mara-global-header)
  - Line 533: `padding: 0 var(--density-cell-pad-x);` (mara-global-header)
  - Line 635: `padding: var(--density-cell-pad-y) 0;` (mara-nav-rail)
  - Line 636: `gap: var(--density-cell-pad-y);` (mara-nav-rail)
  - Line 910: `padding: 0 var(--density-cell-pad-x);` (mara-status-bar)
  - Line 912: `font-size: var(--density-font-caption);` (mara-status-bar - ONLY font usage found)
- **NOT used for font sizes**: Only `--density-font-caption` seen once for font sizing
- **Hardcoded spacing values**: Many instances of hardcoded px values for padding, margin, gap

**Impact**:
- Inconsistent spacing patterns across components
- Difficulty maintaining uniform density/scales
- Missed opportunity to leverage the existing token system

#### 3. Underutilized Density Font Tokens
**Issue**: `--density-font-ui` and `--density-font-mono` defined but not widely used
**Evidence**: 
- No clear usage found of `var(--density-font-ui)` or `var(--density-font-mono)` for font-sizing
- These tokens appear to be defined but not applied to actual text elements

**Impact**:
- Wasted token definition
- Inconsistent font sizing between UI elements that should share base sizing
- Missed opportunity for consistent typographic foundation

#### 4. Market Data Readability Concerns
**Issue**: Need to verify market data (tables, numbers, financial data) uses appropriate typography
**Areas to Check**:
- Table cell font sizes and spacing
- Numerical data alignment and readability
- Monospace usage for financial figures, symbols, codes
- Header vs. body text distinction in data grids

## Detailed Findings by Priority

### Priority 1: Professional Visual Hierarchy
**Current State**: ❌ Weak
- No typographic scale leads to arbitrary heading/body relationships
- Inconsistent font weights and sizes throughout UI
- Market data headers and values often use similar sizing, reducing scanability

**Required**: 
- Define typographic scale with clear ratios (e.g., 1.25x or 1.5x between steps)
- Establish heading hierarchy (h1-h6) with appropriate sizes
- Define body text variants (base, small, caption)
- Ensure market data has clear visual distinction between labels and values

### Priority 2: Compact Information Density
**Current State**: ⚠️ Partial
- Density tokens increased from previous values (good foundation)
- Compact and focus density modes available
- BUT inconsistent application prevents true compact density

**Required**:
- Apply density tokens consistently to ALL spacing and sizing
- Ensure compact mode actually reduces information density appropriately
- Verify focus mode enhances readability for detailed views

### Priority 3: Predictable Spacing
**Current State**: ⚠️ Inconsistent
- Density tokens used for nav/header/status bar padding/gap
- Not used consistently in tables, cards, panels, modals, drawers
- Hardcoded values create unpredictable spacing patterns

**Required**:
- Audit all padding, margin, gap, and spatial properties
- Convert hardcoded values to use density tokens where appropriate
- Ensure consistent application across all 6 workspaces

### Priority 4: Readable Market Data
**Current State**: ❓ Needs Verification
- Market data appears in tables, grids, charts, panels
- Need to check: font sizes, monospace usage, number formatting, row/column spacing

**Required**:
- Audit market-data-specific components
- Ensure appropriate font sizes for readability
- Verify monospace fonts for numerical data, symbols, codes
- Check row heights and cell padding for data density
- Validate header/body distinction in data grids

### Priority 5: Minimal Regression Risk
**Current State**: ⚠️ Moderate Risk if Changes Made Poorly
- Existing token system provides safe migration path
- But widespread hardcoded values mean many touchpoints for changes
- Visual regressions likely if spacing/typography changed inconsistently

**Required**:
- Create comprehensive usage map before changes
- Implement changes in batches by component/workspace
- Test each workspace independently
- Provide rollback capability
- Document all token usage for future maintainers

## Recommended Improvements

### A. Typographic Scale Definition
Add to `:root` section:
```css
/* Typographic Scale - Based on --density-font-ui (13px) */
--font-size-xxs: 10px;   /* --density-font-ui * 0.77 */
--font-size-xs:  11px;   /* --density-font-ui * 0.85 */ 
--font-size-sm:  12px;   /* --density-font-ui * 0.92 */
--font-size-base: 13px;  /* --density-font-ui */
--font-size-lg:  14px;   /* --density-font-ui * 1.08 */
--font-size-xl:  16px;   /* --density-font-ui * 1.23 */
--font-size-2xl: 18px;   /* --density-font-ui * 1.38 */
--font-size-3xl: 20px;   /* --density-font-ui * 1.54 */
--font-size-4xl: 24px;   /* --density-font-ui * 1.85 */
```

### B. Consistent Density Token Application
Convert hardcoded values to use density tokens:
- **Font sizes**: Replace hardcoded values with --font-size-* tokens
- **Spacing**: Replace hardcoded padding/margin/gap with --density-* tokens
- **Component-specific**: Create component-token mappings (e.g., --card-padding, --table-row-height)

### C. Market Data Specific Enhancements
1. **Typography**:
   - Headers: --font-size-lg or --font-size-xl
   - Values/numbers: --font-size-base or --font-size-lg (monospace)
   - Labels/descriptors: --font-size-sm or --font-size-xs
2. **Spacing**:
   - Row height: --density-row-h (already defined)
   - Cell padding: --density-cell-pad-x/y (already defined)
   - Ensure adequate whitespace for number readability

### D. Implementation Strategy for Minimal Regression
1. **Phase 1**: Define typographic scale tokens (no usage changes)
2. **Phase 2**: Audit and convert font-size usage (workspace by workspace)
3. **Phase 3**: Audit and convert spacing/padding/gap usage (workspace by workspace)
4. **Phase 4**: Validate market data readability across all views
5. **Phase 5**: Test all density modes (default, compact, focus)

## Affected Files
**Primary**: `frontend/src/styles/terminal.css` (all changes)
**Secondary** (if implementing usage changes):
- `frontend/src/main.js` (if hardcoded spacing values)
- `frontend/index.html` (if inline styles)
- Individual component files (if they override base styles excessively)

## Success Metrics for Stage 2
- ✅ Defined typographic scale with clear visual hierarchy
- ✅ Consistent application of density tokens for spacing and sizing
- ✅ Reduced hardcoded font size and spacing values
- ✅ Improved market data readability through consistent typography
- ✅ Preserved or enhanced information density in compact modes
- ✅ Minimal visual regression through systematic, tested implementation

---

**Audit Complete**. Ready to proceed with Stage 2 implementation upon approval, following the user's priorities of professional visual hierarchy, compact information density, predictable spacing, readable market data, and minimal regression risk.