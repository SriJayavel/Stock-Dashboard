# Mara Stock Terminal — Foundation Audit

**Date**: 2026-10-09  
**Auditor**: Claude Code (via RTK-optimized workflow)  
**Objective**: Assess current UI foundation against planned improvements for simplicity, professionalism, and performance

## Executive Summary

The Mara Stock Terminal shows a strong TradingView-inspired foundation with comprehensive design tokens and component styling. However, the UI can be simplified for better professionalism and user comfort through targeted refinements to spacing, typography, color usage, and component consistency.

## Current State Assessment

### ✅ Strengths (What's Working Well)
1. **Complete Design System**: Extensive CSS variable foundation (`--bg`, `--surface`, `--accent`, etc.)
2. **TradingView Alignment**: Proper implementation of TradingView design patterns
3. **Responsive Framework**: Media queries for mobile/tablet/desktop breakpoints
4. **Component Library**: Well-defined styles for charts, tables, modals, drawers, etc.
5. **Dark Theme**: Professional dark color scheme with appropriate contrast
6. **RTK Integration**: Token-efficient command execution already in place

### ⚠️ Areas for Improvement (Foundation Gaps)
Based on comparison with PLAN.md "Phase 1: Foundation Improvements":

#### 1. Design Token Refinement Needed
- **Redundant Variables**: `--accent-cyan` and `--accent-blue` both `#2962ff` (lines 116, 197)
- **Inconsistent Naming**: Some variables use full names, others abbreviated
- **Missing Semantic Tokens**: Limited use of `--text-primary`, `--text-secondary` variations
- **Opacity Inconsistencies**: Mixed use of `rgba()` and hex values for transparencies

#### 2. Spacing & Density Optimization
- **Current**: `--density-font-ui: 13px` (good increase from 12px)
- **Opportunity**: 
  - Standardize spacing multiples (4px/8px grid)
  - Review component padding/margin consistency
  - Optimize dense tables/lists for readability

#### 3. Typography Hierarchy
- **Current**: Good font stack but limited hierarchy
- **Opportunity**:
  - Clearer heading scale (h1-h6)
  - Better body text vs. UI font differentiation
  - Improved monospace contexts for code/data

#### 4. Color Usage Refinement
- **Current**: Rich color scales available
- **Opportunity**:
  - Reduce visual noise by limiting accent usage
  - Improve status color consistency (gain/loss)
  - Better background/layer separation

#### 5. Component Consistency
- **Current**: Good base styles
- **Opportunity**:
  - Standardize border-radius application
  - Consistent hover/active/focus states
  - Unified transition timing/functions

## Specific Recommendations for Simple & Professional UI

### Immediate Quick Wins (1-2 hours effort)

#### A. Design Token Cleanup
```css
/* Remove redundancies */
/* Replace --accent-cyan and --accent-blue with single --accent-blue */

/* Add semantic tokens */
--text-primary: #d1d4dc;
--text-secondary: #8a8d96;
--text-tertiary: #686f7d;
--bg-layer-1: #11141d;
--bg-layer-2: #1a1d27;
--bg-layer-3: #202430;
```

#### B. Spacing Standardization
Adopt 4px grid system:
```css
/* Update density tokens */
--density-xxxs: 2px;
--density-xxs: 4px;
--density-xs: 6px;
--density-sm: 8px;
--density-md: 12px;
--density-lg: 16px;
--density-xl: 24px;
```

#### C. Typography Scale
```css
--font-size-xxs: 10px;
--font-size-xs: 11px;
--font-size-sm: 12px;
--font-size-base: 13px;
--font-size-lg: 14px;
--font-size-xl: 16px;
--font-size-2xl: 18px;
--font-size-3xl: 20px;
--font-size-4xl: 24px;
```

#### D. Color Usage Guidelines
1. **Primary Accent**: `--accent: #2962ff` (for interactive elements)
2. **Status Colors**: 
   - Gain: `--gain: #22ab94`
   - Loss: `--loss: #f23645`
   - Warning: `--warning: #fbbf24`
3. **Background Layering**:
   - Layer 1 (deep): `--bg-deep: #0d0d0d`
   - Layer 2 (surface): `--bg-surface: #1a1d27`
   - Layer 3 (elevated): `--bg-elevated: #202430`

### Phase 1 Implementation Plan (Prioritized)

#### Week 1-2 Focus: Foundation Improvements
1. **Days 1-2**: Design token cleanup & standardization
2. **Days 3-4**: Spacing & typography system implementation
3. **Days 5-6**: Color usage refinement & component consistency
4. **Days 7-8**: Layout component updates (headers, nav, panels)

## Action Items for Efficient Execution

### Immediate Next Steps (Choose One):

1. **Design Token Audit & Refactor**
   - Run RTK-optimized search for token usage
   - Create token mapping spreadsheet
   - Implement systematic replacements

2. **Global Header & Navigation Refactor**
   - Standardize `--shell-header-h`, `--shell-workspace-bar-h`
   - Improve visual hierarchy in mara-global-header
   - Refine workspace tab active states

3. **Card/Panel Base Style Standardization**
   - Create base `.terminal-card` class with consistent:
     - Border-radius: `var(--radius-md)`
     - Border: `1px solid var(--border)`
     - Background: `var(--bg-surface)`
     - Shadow: `var(--shadow-card)`
     - Padding: Standardized spacing

4. **Typography Scale Implementation**
   - Define heading hierarchy (h1-h6)
   - Standardize body/text sizes
   - Update all text-using components

## RTK-Optimized Workflow Recommendations

To maintain speed during implementation:

1. **Batch CSS Changes**: Use `rtk sed` for token replacements
2. **Component Testing**: Update one workspace at a time
3. **RTK Gain Monitoring**: Track token savings during refactor
4. **Progressive Validation**: Use browser devtools to verify changes

## Success Metrics for Foundation Work

- ✅ Reduced CSS file size by removing redundancies
- ✅ Improved color contrast ratios (WCAG AA minimum)
- ✅ Standardized spacing creates cleaner visual rhythm
- ✅ Consistent component behavior reduces cognitive load
- ✅ Faster UI rendering through simplified CSS selectors

## Recommendation: Start with Design Token Audit

Given that `terminal.css` shows recent modifications and serves as the foundation for all components, I recommend beginning with a **comprehensive design token audit** to:

1. Eliminate redundancies (like duplicate accent colors)
2. Establish semantic naming conventions
3. Prepare foundation for spacing/typography improvements
4. Create immediate visual simplification through cleaner variable usage

This approach aligns with your goal of making the UI simple and professional while maximizing impact per hour of effort.

Would you like me to proceed with the design token audit, or would you prefer to start with a specific component refactor?