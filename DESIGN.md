# MARA design system for Stitch

## 1. Visual theme and atmosphere

MARA is an equities research terminal for Indian and global markets. It should feel like a working analyst’s desk. Give prices, charts, and source dates the strongest hierarchy. Keep controls close to the data they affect.

- **Density 8/10.** Compact tables, small labels, and room to read across rows.
- **Layout variance 5/10.** Keep the shell predictable. Use an asymmetric split when the main analysis needs a secondary inspector.
- **Motion 2/10.** Tie movement to an action, a data change, or a pending result.

The first screen starts with a left-aligned workspace title and the data for that route. On Markets, use the compact snapshot strip, session context, and Global benchmarks table. Use actual sparklines as the first visual. Skip a marketing hero, stock photography, and a promotional CTA.

## 2. Color palette and roles

Use Midnight Canvas and a single amber interaction accent. Gains and losses have semantic colors and an explicit sign or direction glyph.

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| Midnight Canvas | `#101521` | `#F8FAFC` | Workspace background and shell |
| Raised Slate | `#171E2B` | `#FFFFFF` | Tables, chart tools, drawers |
| Hover Slate | `#232C3C` | `#F8FAFC` | Hover and selected-row surfaces |
| Hairline | `#323F53` | `#E2E8F0` | One-pixel dividers and bounds |
| Reading Ink | `#F3F2EF` | `#1E293B` | Titles, prices, primary text |
| Secondary Ink | `#B1BACB` | `#525E71` | Labels, units, timestamps |
| Amber | `#EAC47A` | `#80551B` | Active navigation, focus, selected filters |
| Gain Mint | `#5CD9BE` | `#00715E` | Positive price or return movement |
| Loss Coral | `#FFA08E` | `#A9362D` | Negative price or return movement |

Use secondary ink for flat returns. Heatmaps blend gradually from the panel surface toward gain or loss, with zero as the neutral midpoint. Print the signed return on each tile. Keep ordinary status labels neutral and use text such as “NSE open” or “Cached” to convey state.

## 3. Typography

- **Display and UI.** Use the current `system-ui, sans-serif` stack. Use 600 weight for headings and controls, 400–500 for body and labels, and `-0.025em` tracking for workspace titles. If Stitch requires named faces, use Geist and Geist Mono. Keep the implementation’s system stacks unless typography changes are part of the brief.
- **Scale.** Use 12px labels, 13px table text, 14px body text, 16px primary inputs, 20px section headings, and 28–32px workspace titles. Cap prose at 65ch.
- **Numbers.** Use `ui-monospace, monospace` with `tabular-nums lining-nums` for prices, signed deltas, yields, timestamps, and model outputs. Right-align comparable values. Keep units visible. Use ₹ and Indian grouping for NSE and BSE assets, with each global quote in its own currency. Label the clock IST where it represents Indian exchange time.

## 4. Components and states

- **Controls.** Use 6px corners and a 2px amber keyboard focus ring. Use neutral fills on hover. Reserve amber for the current route, selected control, or primary action. Use a 1px press offset only when it adds clear feedback.
- **Tables.** Use a 36px compact row and a 48px comfortable row. Align prices, changes, highs, and lows on the right. Mark the selected row with a thin amber inset rule. Keep sort and column controls in the table header area. Open quote provenance from the value on hover, focus, or tap. Keep source, timestamp, and calculation basis readable in that disclosure.
- **Panels.** Use 8px corners, a one-pixel border, and a solid surface. Prefer dividers to nested cards. Use an outline and a slightly raised surface for an overlay.
- **Inputs.** Keep labels above form fields, errors below, and validation near the control it concerns. The command palette keeps its own visible shortcut and supports actions such as `>AAPL scenarios`.
- **Loading and empty states.** Reserve the space occupied by loaded content. Match skeleton rows to the final table. Omit missing metrics and empty sectors. If an entire dataset is unavailable, show one sentence and an action such as Retry or View earnings.
- **Data state.** Use one Demo badge beside MARA when synthetic data is active. Keep fixture attribution in quote details and exported outputs. Give cached quotes an actual source timestamp where available. Use “Time unavailable” when there is no timestamp.
- **Research runs.** Show the symbol, phase, elapsed time, and Cancel while a run is active. Keep steps collapsed until opened. Follow new entries only while the reader is at the bottom. Offer Jump to latest when they scroll up.

## 5. Layout and responsive behavior

Use a 56px desktop header with the MARA mark, command search, six workspace destinations, and utilities. The main content maxes out at 96rem (1536px). Use a 4px spacing base, 12–16px between related controls or rows of content, and 24–32px between sections.

| Workspace | Primary surface |
| --- | --- |
| Markets | Snapshot strip, benchmark table, and IST sessions. Use the same quote state for the strip and table. Place sector performance and cross-asset quotes below. |
| Discover | Screener filters and results. Analyze is a direct row action. |
| Analyze | Price chart first. Indicators and settings open on demand. |
| Compare | Selected instruments and comparison metrics on the same scale or period. |
| Research | Company facts and dated results, with News, Earnings, Delta, Anomalies, and Scenarios reachable from the subnav. |
| Monitor | Watchlist and alerts, with each state labeled in text. |

On wide layouts, use a main column and a narrower optional drawer. Below 768px, stack main sections and use an overlay for drawers. At a benchmark container width below 36rem (576px), show labeled stacked rows. Keep the document inside the viewport. Give compact desktop actions a larger tap area on touch layouts, targeting 44px for standalone controls. The snapshot strip may scroll horizontally within its own region.

## 6. Motion and interaction

Use 180ms ease-out for small UI transitions. Animate opacity or transforms. A price update may briefly tint the changed value without moving the row. A pending request may show a skeleton shimmer while it is active. Keep settled data, tab selection, and completed runs still. Honor reduced motion by removing shimmer and movement. Keep keyboard focus and scroll position steady across quote updates.

## 7. Patterns to avoid

- Avoid pure black, neon glows, gradient lettering, and colors that compete with amber for interaction.
- Avoid generic campaign heroes, three equal feature cards, oversized pills, stock imagery, and decorative motion.
- Keep the software UI sans-serif. Avoid Inter, generic serif display faces, decorative cursors, and emoji as control labels.
- Avoid invented quotes, fictitious companies, and filler metrics. Use approved fixtures with their attribution when a demo needs sample data.
- Keep a single snapshot strip and a detailed table on Markets. Avoid a second marquee, repeated environment banners, and duplicate feed counters.
- Write labels like “Global benchmarks,” “Trading sessions (IST),” and “24h return and breadth.” Avoid promotional language and instructions that repeat what a control already says.
