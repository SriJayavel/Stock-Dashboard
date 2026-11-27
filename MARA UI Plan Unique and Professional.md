# MARA UI Plan: Unique and Professional

Nov 23, 2026 · @JAy

## What the current screen needs

The Markets screen has a solid base: a readable dark theme, right-aligned numbers, red and green sparklines, region badges and a Ctrl K search. Three things hold it back: two components show different prices for the same index, the look is generic, and a few details signal "unfinished".

**Keep:** the dark navy base, right-aligned numeric columns, the market-status pills, intraday sparklines, the command search.

| # | Observation on your screenshot | Why it matters | Fix | Priority |
| --- | --- | --- | --- | --- |
| 1 | The snapshot strip and the table disagree: SENSEX shows ₹80,716.96 (−546.73) in the strip but ₹80,718.96 (−544.73) in the table; BANK NIFTY and NASDAQ also differ | One index with two prices destroys trust in a finance tool faster than any visual flaw | Both components read one shared store entry per symbol; add a test that asserts they match | P0 |
| 2 | The design is a generic dark-navy terminal; nothing says MARA | Reviewers see many look-alike dashboards | Adopt one signature idea (next section) | P0 |
| 3 | "Demo" appears in the banner, a pill and every table row | Repetition turns a useful notice into noise | Keep the banner and the pill; drop the per-row text; show the timestamp once in the table footer | P1 |
| 4 | The timestamp reads 13 Nov while today is 23 Nov | A stale date looks like broken data | Generate demo timestamps relative to today, or label them "Sample data" with no date | P1 |
| 5 | Red and green carry the whole up-or-down meaning | About 1 in 12 men has red-green colour vision deficiency | Add ▲ and ▼ glyphs and use a colour-blind-safe pair | P1 |
| 6 | Small grey text (symbols, update times) looks low contrast on navy | Likely below the WCAG AA ratio of 4.5:1 | Measure with a contrast checker and lighten the text tokens | P1 |
| 7 | The filter bar packs region, refresh, download and asset class onto one line next to the title | Hard to scan, wraps badly on narrow screens | Split into a title row and a filter row; group related controls | P2 |
| 8 | The table has no density toggle or column chooser | Power users expect both in a terminal | Add compact and comfortable densities and a column menu | P2 |

## Design direction: make the epistemic contract visible

Your strongest idea is not visual yet. The backend already separates source data, calculated metrics, attributed context and interpretation, but the UI shows every number the same way. Making that separation visible gives MARA a look no generic dashboard has, and it is easy to explain in an interview: "every number tells you where it came from."

**Signature idea: provenance-first.** Each value wears a small marker for its class, and hovering or focusing it shows the source, time and formula.

| Class | Example in MARA | Visual treatment |
| --- | --- | --- |
| Source data | NIFTY 50 last price | Plain number with a small solid dot; popover shows provider and timestamp |
| Calculated metric | RSI (14), P/E percentile | Number with an ƒ marker; popover shows the formula and its inputs |
| Attributed context | A statement taken from a filing | Left quote bar with a source link |
| Interpretation | Structural observations in Research | Labelled "Interpretation", lighter weight, never in the primary accent colour |

Two supporting principles keep the rest of the interface calm so this idea stands out:

- **India-first details.** Use lakh and crore formatting where Indian users expect it, show an IST session timeline for NSE and BSE, and mark exchange holidays.
- **One accent colour.** Choose one distinctive accent (not default blue) for interactive elements only. Reserve red and green strictly for price direction.

## Phase 1: Foundations (days 1 to 3)

Gate: no hard-coded colours, sizes or fonts remain in component CSS; everything reads from tokens.

- [ ] **Fix the P0 data mismatch** from the table above first, with a test, because it undermines every other improvement.
- [ ] **Design tokens** in one `tokens.css`: colour (surface, text, border, accent, up, down, warning), spacing in steps of 4 px, radii, shadows, z-index and motion durations.
- [ ] **Type scale**: pick two fonts at most, one UI sans and one monospace for numbers, with 5 or 6 fixed sizes. Turn on `font-variant-numeric: tabular-nums` for every numeric cell so digits line up.
- [ ] **Colour semantics**: define up and down colours that stay distinguishable for colour-blind users, and add ▲ and ▼ glyphs beside every change figure.
- [ ] **Contrast pass**: check every text token against its background and lift anything below 4.5:1 (3:1 for large text).
- [ ] **Component inventory**: list the 10 or so repeated pieces (button, chip, pill, card, table, tabs, popover, toast, input, badge) and give each one a single implementation with variants.
- [ ] **Brand mark**: refine the MARA logo into a simple mark that works at 16 px, plus a favicon and social preview image.

## Phase 2: Signature features (days 4 to 8)

Gate: a reviewer can hover any number on any of the six workspaces and see where it came from.

- [ ] **Provenance marker component**: one reusable `<Provenance class source time formula>` element with the four class styles from the table above, keyboard focusable, with a popover that works on touch.
- [ ] **Apply it everywhere**: Markets prices (source), Analyze indicators (calculated), Research dossier (all four classes), Compare multiples (calculated).
- [ ] **Percentile bands instead of verdicts**: show valuation as a position on a historical range bar (for example "P/E at the 72nd percentile of its 5-year range"), which reinforces your no-prediction rule visually.
- [ ] **Session timeline**: replace the row of market-status pills with a 24-hour strip in IST showing NSE, NYSE, LSE and TYO sessions, with a marker for the current time.
- [ ] **Indian number formatting**: lakh and crore for market cap and volumes, with a toggle to international units.
- [ ] **Chart finishing touches**: crosshair read-out with provenance, indicator legend that shows parameters, and a clean empty state when an indicator has too little history.
- [ ] **Command palette upgrade**: extend Ctrl K beyond symbol search to actions ("open Compare with NIFTY and SENSEX", "create alert", "toggle theme").

## Phase 3: Polish and states (days 9 to 12)

Gate: the app never shows a blank area, a raw error or a layout jump.

- [ ] **Loading states**: skeleton rows that match the table layout, so content does not jump when data arrives.
- [ ] **Empty states**: a helpful message and one action for each empty case (no alerts yet, no watchlist items, no search results).
- [ ] **Error and offline states**: a clear message, a retry button and the last known data with its age, instead of a blank panel.
- [ ] **Motion with restraint**: 150 to 200 ms fades and slides on panel changes, a brief highlight when a price ticks, and nothing that loops. Respect `prefers-reduced-motion`.
- [ ] **Light theme**: build it from the same tokens, test charts in both themes, and remember the user's choice.
- [ ] **Responsive layouts**: define three breakpoints. On phones, turn the table into stacked cards and move the six workspaces into a bottom bar.
- [ ] **Table upgrades**: sticky header, density toggle, column chooser, and the filter bar split into two rows.
- [ ] **Microcopy pass**: consistent labels, sentence case, no jargon without a tooltip, and the demo notice worded once.
 
## Phase 4: Accessibility, performance and proof (days 13 to 15)

Gate: audit scores and screenshots you can quote on a resume and show in a README.

- [ ] **Keyboard and screen reader pass**: every control reachable by Tab, visible focus rings, ARIA labels on icon buttons, and table headers announced correctly. Run `axe` in your Playwright suite so it stays fixed.
- [ ] **Lighthouse audit** on the deployed URL for Performance, Accessibility, Best Practices and SEO. Aim for 90 or higher in each, and fix the largest issues (bundle size, chart render time, layout shift).
- [ ] **Visual regression tests**: add Playwright screenshot comparisons for the six workspaces in both themes so polish does not decay.
- [ ] **Screenshot set**: capture the six workspaces in dark and light at one fixed window size, plus a close-up of a provenance popover.
- [ ] **Short design write-up** (`docs/design.md` or a README section): the signature idea, the token system, the type choices and the accessibility results, with before and after screenshots of this Markets page.
- [ ] **Update the demo GIF** and the README header image with the new look.

## Order of work and definition of done

The four phases take about 15 working days, roughly three weeks at 8 to 10 hours a week. Do them in this order, because each one makes the next cheaper.

| Phase | Days | What you have afterwards |
| --- | --- | --- |
| 1. Foundations | 3 | One token system, consistent numbers and colours, no price mismatch |
| 2. Signature features | 5 | Provenance markers, percentile bands, IST session timeline |
| 3. Polish and states | 4 | No blank or broken-looking screens; light theme; mobile layout |
| 4. Accessibility, performance, proof | 3 | Audit scores, visual tests, screenshots and a design write-up |

If you are also following the earlier resume plan, finish this plan's Phase 4 before recording the demo GIF and writing the README, so every screenshot shows the new design.

The UI is done when all of these are true:

- [ ] The strip and the table show identical figures for every index
- [ ] Any number on any workspace opens a provenance popover from mouse, keyboard and touch
- [ ] Lighthouse shows 90 or higher in all four categories on the live URL
- [ ] `axe` reports no serious or critical issues on the six workspaces
- [ ] Dark and light themes both pass the contrast check
- [ ] The README has before and after screenshots and a short design write-up


Libraries won't make the UI unique on their own, but a few small ones fix the weak spots in your screenshot without costing you the "vanilla JS, no framework" selling point. Since you're on Vite and plain ES modules, I'd pick framework-agnostic ones.

Library	Use it for	Why it fits MARA
Radix Colors	Colour scales for your design tokens	Gives accessible dark and light scales, so your contrast and light-theme work gets much easier. It's just CSS variables and works in any stack.
Fontsource with Inter and JetBrains Mono (or IBM Plex Mono)	Self-hosted fonts	Stops layout shift from web fonts. Use the mono font for numbers, with tabular-nums so digits align.
Lucide	Icons	One consistent, tree-shakable SVG set to replace mixed icons.
Floating UI	Provenance popovers, tooltips, dropdowns	Handles positioning, collision and keyboard focus, which are the fiddly parts of your signature feature.
TanStack Table (core) with TanStack Virtual	Sticky headers, column chooser, sorting, large tables	Headless, so it adds logic and not styles, and works without React. Worth it for the Discover screener with its 2,369 tickers.
axe-core with @axe-core/playwright	Accessibility checks in your existing tests	Gives you a concrete "no serious issues" claim for the README.

A few built-ins cover a lot too:

Intl.NumberFormat('en-IN') does lakh and crore grouping with no library.
The View Transitions API gives smooth workspace switches for free.
CSS @container queries help the table collapse cleanly on small screens.

Skip these:

Tailwind or a full component kit (MUI, Ant Design, Bootstrap). They'd make the UI look like everyone else's, which works against your goal.
Replacing your canvas chart with TradingView Lightweight Charts. Your first-party engine is one of the most distinctive things on your resume. If you want a comparison, benchmark yours against it and write that up instead.
A React rewrite. It would cost weeks and add little on top of the plan.

I haven't checked current versions, so look at each package's page on npm before installing. Keep the total under about five new dependencies and check your Vite bundle size afterwards, since a smaller bundle also helps your Lighthouse score.