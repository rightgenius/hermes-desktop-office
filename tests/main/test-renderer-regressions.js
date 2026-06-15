const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const appJs = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const ipcHandlersJs = fs.readFileSync(path.join(root, 'src', 'main', 'ipc-handlers.js'), 'utf8');

describe('renderer regressions', () => {
  test('session title tooltip is cleaned when the session list re-renders', () => {
    assert.match(appJs, /function\s+hideSessionTitleTooltip\s*\(/);
    assert.match(appJs, /function\s+showSessionTitleTooltip\s*\(/);

    const renderSessionListBody = appJs.match(/function\s+renderSessionList\s*\(\)\s*\{([\s\S]*?)sessionList\.querySelectorAll\('\.session-item'\)/);
    assert.ok(renderSessionListBody, 'renderSessionList body should be findable');
    assert.match(renderSessionListBody[1], /hideSessionTitleTooltip\s*\(\s*\)/);
  });

  test('chat bubbles force long links to wrap inside the bubble', () => {
    const bubbleRule = stylesCss.match(/\.message-bubble\s*\{([\s\S]*?)\}/);
    assert.ok(bubbleRule, '.message-bubble rule should exist');
    assert.match(bubbleRule[1], /overflow-wrap\s*:\s*anywhere/);

    const linkRule = stylesCss.match(/\.message-bubble\s+a\s*\{([\s\S]*?)\}/);
    assert.ok(linkRule, '.message-bubble a rule should exist');
    assert.match(linkRule[1], /overflow-wrap\s*:\s*anywhere/);
    assert.match(linkRule[1], /word-break\s*:\s*break-word/);
  });

  test('logs page exposes filtering, search, export, and count controls', () => {
    assert.match(indexHtml, /id="log-level-filter"/);
    assert.match(indexHtml, /id="log-search"/);
    assert.match(indexHtml, /id="export-logs"/);
    assert.match(indexHtml, /id="log-counts"/);

    assert.match(appJs, /function\s+renderLogs\s*\(/);
    assert.match(appJs, /filterLogEntries\s*\(/);
    assert.match(appJs, /formatLogExport\s*\(/);
    assert.match(appJs, /log-line-time/);

    assert.match(stylesCss, /\.log-line\.error/);
    assert.match(stylesCss, /\.log-line\.warn/);
    assert.match(stylesCss, /\.log-line\.debug/);
  });

  test('chat shows immediate feedback while a new session agent is initializing', () => {
    assert.match(appJs, /case\s+'initializing':/);
    assert.match(appJs, /正在初始化会话/);
    assert.match(appJs, /session-initializing/);
  });

  test('manual agent actions only report success when the IPC result succeeds', () => {
    assert.match(appJs, /const\s+result\s*=\s*await\s*\(action\s*===\s*'start'/);
    assert.match(appJs, /if\s*\(\s*!result\?\.success\s*\)/);
    assert.match(appJs, /throw\s+new\s+Error\(result\?\.error/);
  });

  test('agent status distinguishes startup from ready and does not wait after ready', () => {
    assert.match(appJs, /data\.running\s*\?\s*'pending'\s*:\s*'error'/);
    assert.match(appJs, /status\s*===\s*'pending'\s*\?\s*'启动中'/);
    const tryStartHandler = ipcHandlersJs.match(
      /ipcMain\.handle\('try-start-agent'[\s\S]*?\n  \}\);/,
    );
    assert.ok(tryStartHandler, 'try-start-agent handler should be findable');
    assert.doesNotMatch(tryStartHandler[0], /setTimeout\(resolve,\s*3000\)/);
  });

  test('interactive prompts always expose safe close and terminal cleanup', () => {
    assert.match(appJs, /class="prompt-close"/);
    assert.match(appJs, /function\s+cancelPendingPrompt\s*\(/);
    assert.match(appJs, /pendingPrompt\.type\s*===\s*'approval_request'\s*\?\s*'deny'\s*:\s*''/);
    assert.match(appJs, /removePromptOverlay\s*\(\s*\)\s*;\s*pendingPrompt\s*=\s*\{\s*type/);
    assert.match(appJs, /function\s+removePromptOverlay\s*\(\s*sessionId\s*=\s*null\s*\)/);
    assert.match(appJs, /removePromptOverlay\s*\(\s*sessionId\s*\)/);
    assert.match(stylesCss, /\.prompt-close\s*\{/);
  });

  test('chat input does not send Enter while an IME composition is active', () => {
    assert.match(appJs, /chatInput\.addEventListener\('compositionstart'/);
    assert.match(appJs, /chatInput\.addEventListener\('compositionend'/);
    assert.match(appJs, /e\.isComposing/);
    assert.match(appJs, /e\.keyCode\s*===\s*229/);
  });

  test('cron page exposes execution audit logs and bounded storage controls', () => {
    for (const id of [
      'cron-log-max-mb',
      'cron-log-usage',
      'cron-log-save-limit',
      'cron-log-job-filter',
      'cron-log-refresh',
      'cron-log-clear',
      'cron-log-list',
      'cron-log-detail',
    ]) {
      assert.match(indexHtml, new RegExp(`id="${id}"`));
    }

    assert.match(appJs, /function\s+loadCronLogs\s*\(/);
    assert.match(appJs, /function\s+renderCronLogList\s*\(/);
    assert.match(appJs, /function\s+renderCronLogDetail\s*\(/);
    assert.match(appJs, /window\.api\.cronLogSettingsSet/);
    assert.match(appJs, /window\.api\.cronLogsClear/);
    assert.match(appJs, /window\.api\.onCronLogUpdated/);
    assert.match(appJs, /class="btn btn-secondary btn-logs"/);

    const detailBody = appJs.match(/function\s+renderCronLogDetail\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(detailBody, 'renderCronLogDetail body should be findable');
    assert.match(detailBody[1], /escapeHtml\s*\(/);

    assert.match(stylesCss, /\.cron-audit-grid/);
    assert.match(stylesCss, /\.cron-log-entry\.console-error/);
    assert.match(stylesCss, /\.cron-log-run\.selected/);
  });
});
