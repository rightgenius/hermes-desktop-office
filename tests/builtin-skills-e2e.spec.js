const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Built-in Skills Discovery E2E Tests', () => {
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
      hasAgentSetWorkspace: typeof window.api?.agentSetWorkspace === 'function',
    }));

    expect(apiExists.hasApi).toBe(true);
    expect(apiExists.hasSkillsList).toBe(true);
    expect(apiExists.hasAgentSetWorkspace).toBe(true);
  });

  test('should list builtin skills including office skills via skill scanner', async () => {
    // Retry with wait for window.api to be ready
    let result;
    for (let i = 0; i < 3; i++) {
      try {
        result = await page.evaluate(async () => window.api.skillsList());
        break;
      } catch (err) {
        if (i === 2) throw err;
        await page.waitForTimeout(2000);
      }
    }

    expect(result.success).toBe(true);
    expect(Array.isArray(result.builtin)).toBe(true);
    expect(result.builtin.length).toBeGreaterThan(0);

    const skillNames = result.builtin.map(s => s.name);
    // Check for at least one office skill
    const officeSkills = ['docx', 'pptx', 'xlsx', 'feishu-cli', 'dingtalk-cli-messaging', 'dws'];
    const foundOfficeSkills = officeSkills.filter(name =>
      skillNames.some(sn => sn.toLowerCase().includes(name.toLowerCase()))
    );

    expect(foundOfficeSkills.length).toBeGreaterThan(0);
  });

  test('should resolve office skills path in dev mode', async () => {
    // Verify the skills directory exists
    const skillsPath = path.join(__dirname, '..', 'skills');
    expect(fs.existsSync(skillsPath)).toBe(true);

    const officeSkillsPath = path.join(skillsPath, 'office');
    expect(fs.existsSync(officeSkillsPath)).toBe(true);
  });

  test('should have SKILL.md files in office skills', async () => {
    const officeSkillsPath = path.join(__dirname, '..', 'skills', 'office');
    const entries = fs.readdirSync(officeSkillsPath, { withFileTypes: true });

    const skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    expect(skillDirs.length).toBeGreaterThan(0);

    // Check at least one has SKILL.md
    const hasSkillMd = skillDirs.some(dir => {
      const skillMdPath = path.join(officeSkillsPath, dir, 'SKILL.md');
      return fs.existsSync(skillMdPath);
    });

    expect(hasSkillMd).toBe(true);
  });

  test('agentSetWorkspace should work for skill sessions', async () => {
    const testPath = '/tmp/skill-workspace-test';
    if (!fs.existsSync(testPath)) {
      fs.mkdirSync(testPath, { recursive: true });
    }

    let result;
    for (let i = 0; i < 3; i++) {
      try {
        result = await page.evaluate(async (testPath) => {
          return window.api.agentSetWorkspace('skill-test-session', testPath);
        }, testPath);
        break;
      } catch (err) {
        if (i === 2) throw err;
        await page.waitForTimeout(2000);
      }
    }

    expect(result.success).toBe(true);

    // Cleanup
    try { fs.rmSync(testPath, { recursive: true, force: true }); } catch {}
  });
});
