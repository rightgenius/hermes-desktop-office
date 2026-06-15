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

  test('can start the Agent with the bundled Python runtime', async () => {
    // CI 环境没有 LLM provider secret —— Agent 启动会卡在
    // "No LLM provider configured"。本地保留这条 case 验证真实链路。
    test.skip(Boolean(process.env.CI), 'CI 环境不调用 LLM（依赖 LLM provider secret）');

    const result = await page.evaluate(async () => {
      await window.api.agentStop().catch(() => {});
      const config = await window.api.configGet();
      return new Promise((resolve) => {
        let settled = false;
        let startRequested = false;
        let removeLogListener = () => {};
        let removeStatusListener = () => {};
        const logs = [];

        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          removeLogListener();
          removeStatusListener();
          resolve(value);
        };

        removeLogListener = window.api.onAgentLog((entry) => {
          logs.push(`[${entry.level}] ${entry.message}`);
          if (entry.message.includes('Agent 已就绪')) {
            finish({ success: true });
          }
        });
        removeStatusListener = window.api.onAgentStatus((status) => {
          if (startRequested && !status.running) {
            finish({
              success: false,
              error: `Agent exited before ready:\n${logs.join('\n')}`,
            });
          }
        });

        const timeout = setTimeout(() => {
          finish({
            success: false,
            error: `Timed out waiting for Agent ready:\n${logs.join('\n')}`,
          });
        }, 30000);

        startRequested = true;
        window.api.agentStart(config).then((startResult) => {
          if (!startResult.success) finish(startResult);
        }).catch((error) => {
          finish({ success: false, error: error.message });
        });
      });
    });

    expect(result.success, result.error || 'Agent failed to become ready').toBe(true);
  });
});
