const { test, expect, _electron: electron } = require('@playwright/test');

test.describe('Packaged app smoke test', () => {
  test.setTimeout(60000);

  let electronApp;
  let page;

  test.beforeAll(async () => {
    const executablePath = process.env.PACKAGED_APP_PATH;
    expect(executablePath, 'PACKAGED_APP_PATH must point to the packaged executable').toBeTruthy();

    electronApp = await electron.launch({
      executablePath,
      args: process.platform === 'linux' ? ['--no-sandbox'] : [],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

    page = await electronApp.firstWindow({ timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('opens the main window with preload APIs', async () => {
    await expect(page.locator('#page-chat')).toBeVisible();
    await expect(page.locator('#chat-input')).toBeVisible();
    await expect(page.locator('#send-message')).toBeVisible();

    const apiState = await page.evaluate(() => ({
      hasApi: typeof window.api !== 'undefined',
      hasConfigGet: typeof window.api?.configGet === 'function',
      hasAgentSendMessage: typeof window.api?.agentSendMessage === 'function',
      hasSkillsList: typeof window.api?.skillsList === 'function',
      hasSelectAttachments: typeof window.api?.selectAttachments === 'function',
    }));

    expect(apiState).toEqual({
      hasApi: true,
      hasConfigGet: true,
      hasAgentSendMessage: true,
      hasSkillsList: true,
      hasSelectAttachments: true,
    });
  });

  test('can read packaged config and bundled skills', async () => {
    const config = await page.evaluate(async () => window.api.configGet());
    expect(config).toHaveProperty('defaultWorkspacePath');

    const skills = await page.evaluate(async () => window.api.skillsList());
    expect(skills.success).toBe(true);
    expect(Array.isArray(skills.builtin)).toBe(true);
    expect(skills.builtin.length).toBeGreaterThan(0);
  });
});
