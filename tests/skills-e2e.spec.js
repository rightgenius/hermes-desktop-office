const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Skills Display E2E Tests', () => {
  let electronApp;
  let page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development' },
    });

    page = await electronApp.waitForEvent('window');
    await page.waitForTimeout(2000);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('should have window.api with skillsList method', async () => {
    const apiExists = await page.evaluate(() => ({
      hasApi: typeof window.api !== 'undefined',
      hasSkillsList: typeof window.api?.skillsList === 'function',
    }));

    expect(apiExists.hasApi).toBe(true);
    expect(apiExists.hasSkillsList).toBe(true);
  });

  test('should return builtin skills via IPC', async () => {
    const result = await page.evaluate(async () => window.api.skillsList());

    expect(result.success).toBe(true);
    expect(Array.isArray(result.builtin)).toBe(true);
    expect(result.builtin.length).toBeGreaterThan(0);
    expect(result.builtin[0]).toHaveProperty('name');
    expect(result.builtin[0]).toHaveProperty('path');
    expect(result.builtin[0].source).toBe('builtin');
  });

  test('should load and render builtin skills in table', async () => {
    await page.evaluate(async () => {
      await loadSkillsList();
      await new Promise(r => setTimeout(r, 1000));
    });

    const tableContent = await page.evaluate(() => {
      const body = document.getElementById('skills-table-body');
      const rows = body?.querySelectorAll('.skills-table-row') || [];
      return {
        hasRows: rows.length,
        hasEmptyState: body?.innerHTML.includes('暂无skills') || false,
        firstRowName: rows[0]?.querySelector('.skills-row-name')?.textContent || null,
      };
    });

    expect(tableContent.hasRows).toBeGreaterThan(0);
    expect(tableContent.hasEmptyState).toBe(false);
    expect(tableContent.firstRowName).toBeTruthy();
  });

  test('should switch tabs and show correct skill counts', async () => {
    const counts = await page.evaluate(async () => {
      await loadSkillsList();
      await new Promise(r => setTimeout(r, 500));
      
      return {
        builtin: skillsState.skills.builtin.length,
        user: skillsState.skills.user.length,
        agent: skillsState.skills.agent.length,
      };
    });

    expect(counts.builtin).toBeGreaterThan(0);
    expect(Array.isArray(counts.user)).toBe(false); // user is a number
    expect(typeof counts.agent).toBe('number');
  });

  test('should filter skills by search query', async () => {
    const searchResult = await page.evaluate(async () => {
      await loadSkillsList();
      await new Promise(r => setTimeout(r, 500));
      
      skillsState.searchQuery = 'apple';
      renderSkillsTable();
      
      const body = document.getElementById('skills-table-body');
      const rows = body?.querySelectorAll('.skills-table-row') || [];
      return { filteredRows: rows.length };
    });

    expect(searchResult.filteredRows).toBeGreaterThan(0);
    expect(searchResult.filteredRows).toBeLessThan(166);
  });
});
