# Stock Dashboard UI Redesign Plan

## Problem Statement
The current stock dashboard interface is overly complex with 6 main workspaces (Markets, Discover, Analyze, Compare, Research, Monitor), each containing multiple sub-panels and controls. This creates information overload and poor user experience.

## Redesign Goals
1. Simplify interface to 3-4 core functions
2. Implement bento-grid layouts for information presentation
3. Apply warm monochrome palette with strategic pastel accents
4. Use generous whitespace and proper typographic hierarchy
5. Streamline chart controls to essential controls only
6. Implement progressive disclosure for advanced features
7. Create consistent sidebar navigation
8. Reduce visual noise and improve information hierarchy

## Core Functions to Preserve
1. **Market Analysis** (Chart + Technical Indicators + Price Action)
2. **Watchlist Management** (Symbols, prices, quick stats)
3. **Research & Notes** (Fundamental data, news, personal notes)
4. **Screening** (Basic filtering - optional/progressive disclosure)

## Design Principles Applied

### From Minimalist-UI
- Warm monochrome palette (#FFFFFF/#F7F6F3 canvas)
- Structural borders: #EAEAEA or rgba(0,0,0,0.06)
- Accent colors: Pale Red (#FDEBEC), Pale Blue (#E1F3FE), Pale Green (#EDF3EC), Pale Yellow (#FBF3DB)
- Typography: SF Pro Display/Geist Sans for UI, Newsreader/Playfair Display for headings
- Bento-grid layouts with asymmetrical CSS Grid
- Ultra-flat components with crisp 8px-12px border-radius
- Generous internal padding (24px-40px)

### From Better-Layout
- Group with space, not lines (2x intra-group spacing for inter-group)
- Keep controls distinct from content
- Align to shared edges
- Order by importance (top-to-bottom, leading-to-trailing)
- Hint at hidden content with progressive disclosure
- Breathing room between targets (12px minimum)

### From Better-Typography
- Sensible type scale with semantic names
- Heading sizes descend with level
- Line-height by role (headings ~1.1, body 1.5-1.6)
- Letter-spacing by size (negative for large headings)
- Cap measure at 60-75 characters per line
- Wrap deliberately (balance for headings, pretty for descriptions)
- Tabular numbers on changing values
- Truncate without losing content (tooltip/expandable view)

### From Better-UI
- Concentric border radius (outer = inner + padding)
- Optical over geometric alignment
- Shadows for elevation, borders for structure
- Interruptible animations (CSS transitions)
- Split and stagger enter animations (~100ms stagger)
- Subtle exit animations (small fixed translateY)
- Contextual icon animations (opacity, scale, blur)
- Image outlines (1px outline at low opacity)
- Scale on press (scale(0.96))
- Skip animation on page load (initial={false})
- Suppress transitions on theme switch
- Transition only what changes (exact properties)
- Use will-change sparingly (transform, opacity, filter)
- Match icon stroke to text weight (1.5px beside regular text)
- One SVG, recolored per state (currentColor)
- Motion restraint (150ms or less for high-frequency interactions)

### From Design-Taste-Frontend
- Design Read: Financial dashboard for active traders/investors, with a professional/trustworthy language, leaning toward institutional/data visualization aesthetic
- Dial Settings:
  - DESIGN_VARIANCE: 5 (slightly asymmetric but balanced)
  - MOTION_INTENSITY: 3 (subtle, professional motion)
  - VISUAL_DENSITY: 3 (airy, readable data presentation)

## Implementation Approach

### Phase 1: Simplify Navigation Structure
- Replace 6 workspace tabs with 3-4 core functions in sidebar
- Use icon-only sidebar with tooltips for clean appearance
- Remove workspace sub-navigation bars where possible

### Phase 2: Redesign Main Workspace (Analyze Focus)
- Make chart the central focus with minimal controls
- Implement bento-grid layout for supporting data
- Reduce chart toolbar to essential controls only (symbol, timeframe, chart type)
- Move indicators to collapsible panel
- Create bento-grid for key metrics (price, change, volume, key indicators)

### Phase 3: Streamline Supporting Functions
- Combine Watchlist and Alerts into unified sidebar
- Simplify Research panel to essential tabs (News, Notes, Fundamentals)
- Move advanced features (screener, backtest, scenario lab) to progressive disclosure

### Phase 4: Apply Visual Polish
- Implement warm monochrome color system
- Apply consistent typography hierarchy
- Add subtle motion and micro-interactions
- Ensure proper spacing and alignment throughout
- Add image outlines and proper icon styling

## Files to Modify
1. frontend/index.html - Simplify structure, remove unused workspaces
2. frontend/src/styles/terminal.css - Update color tokens, spacing, typography
3. frontend/src/main.js - Simplify workspace logic, update event handlers
4. frontend/src/chart.js - Simplify chart controls
5. frontend/src/watchlist.js - Simplify watchlist interface
6. frontend/src/notebook.js - Keep as-is (already focused)
7. frontend/src/alerts.js - Integrate with sidebar
8. frontend/src/report_generator.js - Keep as-is
9. frontend/src/screener_builder.js - Move to progressive disclosure
10. frontend/src/backtester.js - Move to progressive disclosure

## Success Metrics
- Reduction in visible controls by ~60%
- Clear visual hierarchy guiding user attention
- Consistent spacing and alignment
- Improved readability through better typography
- Maintained core functionality while reducing complexity
