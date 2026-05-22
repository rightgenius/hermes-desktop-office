const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Collapsible Tool Calls E2E Tests', () => {
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

  async function setupChat() {
    const chatBtn = page.locator('.rail-btn[aria-label="聊天"], .rail-btn:nth-child(1)');
    if (chatBtn) await chatBtn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const chatMessagesEl = document.getElementById('chat-messages');
      if (!chatMessagesEl) throw new Error('#chat-messages not found');
      chatMessagesEl.innerHTML = '';
      const sid = 'test-session-' + Date.now();
      currentSessionId = sid;
      streamingSessions[sid] = { text: '', reasoning: '', toolCalls: {} };
      addMessage('', 'agent', true, '', [], sid);
      return sid;
    });
  }

  test('running tool calls are displayed individually with warning border', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "ls"}');
      addToolCall(s, 't2', 'read', '{"path": "/tmp/foo"}');
    }, sid);

    const result = await page.evaluate(() => {
      const container = document.querySelector('.message-tool-calls');
      const directToolCalls = container?.querySelectorAll(':scope > .message-tool-call') || [];
      const group = container?.querySelector('.message-tool-call-group');
      return {
        directCount: directToolCalls.length,
        hasGroup: !!group,
        firstHasWarningBorder: directToolCalls.length > 0,
      };
    });

    expect(result.directCount).toBe(2);
    expect(result.hasGroup).toBe(false);
  });

  test('running tool shows spinner and executing status', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "ls"}');
    }, sid);

    const result = await page.evaluate(() => {
      const tc = document.querySelector('.message-tool-call');
      const spinner = tc?.querySelector('.spinner');
      const status = tc?.querySelector('.message-tool-call-status');
      return {
        hasSpinner: !!spinner,
        statusClass: status?.classList.contains('running') ? 'running' : 'other',
        statusText: status?.textContent?.trim() || '',
      };
    });

    expect(result.hasSpinner).toBe(true);
    expect(result.statusClass).toBe('running');
    expect(result.statusText).toBe('执行中...');
  });

  test('completed tool calls collapse into a summary group', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "ls"}');
      addToolCall(s, 't2', 'bash', '{"command": "pwd"}');
      addToolCall(s, 't3', 'read', '{"path": "/tmp"}');
      updateToolCall(s, 't1', 'file1\nfile2');
      updateToolCall(s, 't2', '/home');
      updateToolCall(s, 't3', 'content');
    }, sid);

    const result = await page.evaluate(() => {
      const group = document.querySelector('.message-tool-call-group');
      const summary = group?.querySelector('.message-tool-call-group-summary');
      const directToolCalls = document.querySelectorAll('.message-tool-calls > .message-tool-call');
      return {
        hasGroup: !!group,
        isCollapsed: group?.classList.contains('collapsed') || false,
        summaryText: summary?.textContent?.trim() || '',
        directCount: directToolCalls.length,
      };
    });

    expect(result.hasGroup).toBe(true);
    expect(result.isCollapsed).toBe(true);
    expect(result.summaryText).toContain('3 个工具完成');
    expect(result.summaryText).toContain('2 bash');
    expect(result.summaryText).toContain('1 read');
    expect(result.directCount).toBe(0);
  });

  test('clicking group header expands to show individual tool cards', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "ls"}');
      updateToolCall(s, 't1', 'result');
      addToolCall(s, 't2', 'read', '{"path": "/tmp"}');
      updateToolCall(s, 't2', 'content');
    }, sid);

    await page.click('.message-tool-call-group-header');

    const result = await page.evaluate(() => {
      const group = document.querySelector('.message-tool-call-group');
      const innerCards = group?.querySelectorAll('.message-tool-call') || [];
      return {
        isExpanded: group?.classList.contains('expanded') || false,
        cardCount: innerCards.length,
      };
    });

    expect(result.isExpanded).toBe(true);
    expect(result.cardCount).toBe(2);
  });

  test('individual tool cards within group expand to show args/results', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "echo hi"}');
      updateToolCall(s, 't1', 'hi\n');
    }, sid);

    await page.click('.message-tool-call-group-header');
    await page.click('.message-tool-call-group .message-tool-call-header');

    const result = await page.evaluate(() => {
      const card = document.querySelector('.message-tool-call-group .message-tool-call');
      const body = card?.querySelector('.message-tool-call-body');
      const argsText = card?.querySelector('.message-tool-call-args pre')?.textContent || '';
      const resultText = card?.querySelector('.message-tool-call-result pre')?.textContent || '';
      return {
        isExpanded: card?.classList.contains('expanded') || false,
        bodyVisible: body ? getComputedStyle(body).display !== 'none' : false,
        argsText,
        resultText,
      };
    });

    expect(result.isExpanded).toBe(true);
    expect(result.bodyVisible).toBe(true);
    expect(result.argsText).toContain('echo hi');
    expect(result.resultText).toContain('hi');
  });

  test('mixed running and completed shows group + running cards', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "ls"}');
      addToolCall(s, 't2', 'read', '{"path": "/tmp"}');
      addToolCall(s, 't3', 'write', '{"path": "/tmp/out"}');
      updateToolCall(s, 't1', 'done');
      updateToolCall(s, 't2', 'done');
    }, sid);

    const result = await page.evaluate(() => {
      const group = document.querySelector('.message-tool-call-group');
      const directToolCalls = document.querySelectorAll('.message-tool-calls > .message-tool-call');
      const groupSummary = group?.querySelector('.message-tool-call-group-summary')?.textContent?.trim() || '';
      return {
        hasGroup: !!group,
        directCount: directToolCalls.length,
        directToolName: directToolCalls[0]?.querySelector('.message-tool-call-name')?.textContent?.trim() || '',
        summaryText: groupSummary,
      };
    });

    expect(result.hasGroup).toBe(true);
    expect(result.directCount).toBe(1);
    expect(result.directToolName).toBe('write');
    expect(result.summaryText).toContain('2 个工具完成');
  });

  test('error tool calls shown with failure count in summary', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'bash', '{"command": "ls"}');
      addToolCall(s, 't2', 'bash', '{"command": "fail"}');
      updateToolCall(s, 't1', 'ok');
      updateToolCall(s, 't2', 'ERROR: permission denied');
    }, sid);

    const result = await page.evaluate(() => {
      const summary = document.querySelector('.message-tool-call-group-summary')?.textContent?.trim() || '';
      return { summary };
    });

    expect(result.summary).toContain('1 完成');
    expect(result.summary).toContain('1 失败');
  });

  test('session restore renders completed tools as collapsed group', async () => {
    await page.evaluate(() => {
      chatMessages.innerHTML = '';
      const tc = [
        { toolId: 'x1', name: 'bash', args: '{"cmd":"ls"}', result: 'ok', status: 'done' },
        { toolId: 'x2', name: 'read', args: '{}', result: 'data', status: 'done' },
      ];
      addMessage('hello', 'agent', false, '', tc);
    });

    const result = await page.evaluate(() => {
      const group = document.querySelector('.message-tool-call-group');
      const directToolCalls = document.querySelectorAll('.message-tool-calls > .message-tool-call');
      return {
        hasGroup: !!group,
        isCollapsed: group?.classList.contains('collapsed') || false,
        directCount: directToolCalls.length,
      };
    });

    expect(result.hasGroup).toBe(true);
    expect(result.isCollapsed).toBe(true);
    expect(result.directCount).toBe(0);
  });

  test('tool names are displayed in Chinese', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'terminal', '{"command": "ls"}');
      addToolCall(s, 't2', 'read_file', '{"path": "/tmp"}');
      addToolCall(s, 't3', 'skill_view', '{"name": "test"}');
    }, sid);

    const result = await page.evaluate(() => {
      const names = Array.from(document.querySelectorAll('.message-tool-call-name'));
      return names.map(el => el.textContent.trim());
    });

    expect(result).toContain('执行命令');
    expect(result).toContain('读取文件');
    expect(result).toContain('查看技能');
    expect(result).not.toContain('terminal');
    expect(result).not.toContain('read_file');
    expect(result).not.toContain('skill_view');
  });

  test('group summary uses Chinese tool names', async () => {
    const sid = await setupChat();
    await page.evaluate((s) => {
      addToolCall(s, 't1', 'terminal', '{"command": "ls"}');
      addToolCall(s, 't2', 'terminal', '{"command": "pwd"}');
      addToolCall(s, 't3', 'read_file', '{"path": "/tmp"}');
      updateToolCall(s, 't1', 'done');
      updateToolCall(s, 't2', 'done');
      updateToolCall(s, 't3', 'done');
    }, sid);

    const result = await page.evaluate(() => {
      const summary = document.querySelector('.message-tool-call-group-summary')?.textContent?.trim() || '';
      return { summary };
    });

    expect(result.summary).toContain('执行命令');
    expect(result.summary).toContain('读取文件');
    expect(result.summary).not.toContain('terminal');
    expect(result.summary).not.toContain('read_file');
  });
});
