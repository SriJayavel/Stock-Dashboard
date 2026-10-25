const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("http://localhost:8080");
  await page.waitForLoadState("networkidle");
  
  // Navigate to markets workspace
  await page.click('[data-workspace="markets"]');
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: "markets_full.png", fullPage: true });
  
  // Check for section blocks
  const sections = await page.$$('.ws-section-block');
  console.log(`Found ${sections.length} section blocks`);
  
  for (let i = 0; i < sections.length; i++) {
    const box = await sections[i].boundingBox();
    if (box) {
      console.log(`Section ${i}: x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)}, w=${box.width.toFixed(0)}, h=${box.height.toFixed(0)}`);
    }
  }
  
  // Check for unavailable badges
  const unavailable = await page.$$('.market-data-state.unavailable');
  console.log(`Found ${unavailable.length} unavailable badges`);
  for (let i = 0; i < unavailable.length; i++) {
    const text = await unavailable[i].textContent();
    const box = await unavailable[i].boundingBox();
    const styles = await unavailable[i].evaluate(el => getComputedStyle(el));
    console.log(`  Badge ${i}: '${text}' at x=${box?.x?.toFixed(0)}, y=${box?.y?.toFixed(0)}`);
    console.log(`    bg: ${styles.backgroundColor}, color: ${styles.color}, border: ${styles.borderColor}`);
  }
  
  // Check section borders
  const firstSection = await page.$('.ws-section-block');
  if (firstSection) {
    const styles = await firstSection.evaluate(el => getComputedStyle(el));
    console.log(`First section border-top: ${styles.borderTopWidth} ${styles.borderTopColor}`);
    console.log(`First section padding-top: ${styles.paddingTop}`);
  }
  
  const secondSection = await page.$('.ws-section-block:nth-child(2)');
  if (secondSection) {
    const styles = await secondSection.evaluate(el => getComputedStyle(el));
    console.log(`Second section border-top: ${styles.borderTopWidth} ${styles.borderTopColor}`);
    console.log(`Second section padding-top: ${styles.paddingTop}`);
  }
  
  await page.waitForTimeout(5000);
  await browser.close();
})();
