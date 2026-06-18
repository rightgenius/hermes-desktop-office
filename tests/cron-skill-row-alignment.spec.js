// E2E regression: cron modal skill list — checkbox must be vertically aligned
// with the skill title (first line of .cron-skill-name) even when the source
// badge ("内置"/"agent") wraps to a second line.
//
// This locks in the fix for the bug where Chromium blockified the flex-item
// children's `display: grid` down to `display: block`, causing the checkbox
// to drift up to a separate line above the name.

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCREENSHOT_DIR = path.join(os.tmpdir(), 'hermes-cron-skill-test');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

test.describe('Cron modal skill list alignment', () => {
  test.setTimeout(60000);

  let electronApp;
  let page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development' },
    });
    page = await electronApp.firstWindow({ timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    // Wait for both the preload (window.api) and the renderer's app.js
    // (showPage, openCronModal) to be ready. Poll until both exist.
    await page.waitForFunction(
      () => typeof window.api !== 'undefined' && typeof window.showPage === 'function',
      null,
      { timeout: 20000, polling: 200 },
    );
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('checkbox top aligns with skill title even when source badge wraps', async () => {
    // 1. Switch to the cron page and open the new-task modal. This triggers
    //    loadCronSkillPicker() which renders .cron-skill-row elements.
    await page.evaluate(() => {
      showPage('cron');
      openCronModal();
    });

    // 2. Wait for at least 3 skill rows to render.
    await page.waitForFunction(
      () => document.querySelectorAll('.cron-skill-row').length >= 3,
      null,
      { timeout: 10000 },
    );

    // 3. Screenshot the skill list for visual verification.
    const skillList = page.locator('#cron-skill-list');
    await skillList.screenshot({
      path: path.join(SCREENSHOT_DIR, 'cron-skill-list.png'),
    });

    // 4. Measure the checkbox vs name baseline for every visible row.
    //    Invariant: |checkbox.top - name.firstChild.top| <= 2px (sub-pixel
    //    tolerance). Without the !important on display:grid, Chromium
    //    blockifies the flex item and the delta is 15-25px.
    const measurements = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.cron-skill-row'));
      return rows.map((row, i) => {
        const cb = row.querySelector('input[type="checkbox"]');
        const nameSpan = row.querySelector('.cron-skill-name > span:first-child');
        const cbRect = cb?.getBoundingClientRect();
        const nameRect = nameSpan?.getBoundingClientRect();
        return {
          index: i,
          name: nameSpan?.textContent || null,
          cbTop: cbRect?.top ?? null,
          nameTop: nameRect?.top ?? null,
          delta: cbRect && nameRect ? cbRect.top - nameRect.top : null,
        };
      });
    });

    const offending = measurements.filter((m) => Math.abs(m.delta ?? 0) > 2);
    if (offending.length > 0) {
      console.log('Misaligned rows:');
      for (const m of offending.slice(0, 5)) {
        console.log(
          `  [${m.index}] ${m.name}: cb.top=${m.cbTop?.toFixed(1)} ` +
          `name.top=${m.nameTop?.toFixed(1)} Δ=${m.delta?.toFixed(1)}px`,
        );
      }
    }
    console.log(
      `Screenshot: ${path.join(SCREENSHOT_DIR, 'cron-skill-list.png')}`,
    );

    expect(offending, 'checkbox should align with the name title').toHaveLength(0);
  });
});
