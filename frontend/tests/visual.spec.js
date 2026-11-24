import { test, expect } from '@playwright/test';

const workspaces = {
  markets: ['/markets', '#markets-indices-table .benchmark-row'],
  discover: ['/discover', '#screener-table-body tr[data-symbol]'],
  analyze: ['/symbol/TCS.NS/chart', '#tv-leg-provenance .provenance-trigger'],
  compare: ['/compare/TCS.NS', '.correlation-table:not(.skeleton-table) tbody tr'],
  research: ['/research/TCS.NS/overview', '#research-latest-quarter'],
  monitor: ['/monitor', '#workspace-watchlist-container tr[data-symbol]'],
};

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });

for (const [theme, colorScheme] of [['dark', 'dark'], ['light', 'light']]) {
  for (const [workspace, [path, ready]] of Object.entries(workspaces)) {
    test(`${workspace} in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.clock.setFixedTime(new Date('2026-11-23T08:00:00Z'));
      await page.addInitScript(value => localStorage.setItem('mara-theme', value), theme);
      await page.goto(`/?freeze=1#${path}`);
      await expect(page.locator(`#workspace-${workspace}`)).toBeVisible();
      await expect(page.locator(ready).filter({ visible: true }).first()).toBeVisible();
      await expect(page).toHaveScreenshot(`${workspace}-${theme}.png`, { maxDiffPixelRatio: 0.001 });
      if (workspace === 'markets' && theme === 'dark') {
        await page.locator('#markets-indices-table .col-price .provenance-trigger').first().hover();
        const card = page.locator('#provenance-card');
        await expect(card).toBeVisible();
        await expect(card).toHaveScreenshot('provenance-detail.png');
      }
    });
  }
}
