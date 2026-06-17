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
      /(?:ipcMain\.)?handle\('try-start-agent'[\s\S]*?\n  \}\);/,
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
    // escapeHtml may live in a helper (renderCronLogEntryHTML / renderCronLogDetailHeaderHTML)
    // invoked from renderCronLogDetail — accept either inline usage or a reference to
    // one of those helpers.
    const usesEscaping =
      /escapeHtml\s*\(/.test(detailBody[1]) ||
      /renderCronLogEntryHTML\s*\(/.test(detailBody[1]) ||
      /renderCronLogDetailHeaderHTML\s*\(/.test(detailBody[1]);
    assert.ok(usesEscaping, 'renderCronLogDetail must escape user-controlled content via escapeHtml or its helpers');

    assert.match(stylesCss, /\.cron-audit-grid/);
    assert.match(stylesCss, /\.cron-log-entry\.console-error/);
    assert.match(stylesCss, /\.cron-log-run\.selected/);
  });

  test('cron task cards show concrete next and last run timestamps', () => {
    const renderListBody = appJs.match(/function\s+renderCronList\s*\(\)\s*\{([\s\S]*?)\n\}\n\nfunction\s+/);
    assert.ok(renderListBody, 'renderCronList body should be findable');
    assert.match(renderListBody[1], /formatCronListDateTime\(job\.next_run_at\)/);
    assert.match(renderListBody[1], /formatCronListDateTime\(job\.last_run_at\)/);
    assert.doesNotMatch(renderListBody[1], /formatRelativeTime\(job\.(?:next_run_at|last_run_at)\)/);

    assert.match(appJs, /function\s+formatCronListDateTime\s*\(/);
    assert.doesNotMatch(appJs, /分钟前|分钟后|小时前|小时后|秒前|秒后/);
  });

  test('cron log detail streams new events without re-rendering (live tail)', () => {
    // The watcher polls disk and emits cron-log-updated on every state
    // change. The renderer should append new events to the detail panel
    // rather than re-rendering the whole thing — preserves scroll
    // position, prevents flicker, and makes streaming feel live.
    assert.match(appJs, /function\s+appendCronLogEvents\s*\(/);
    assert.match(appJs, /appendCronLogEvents\(result\.log\)/);
    // The onCronLogUpdated handler should not call selectCronLogRun for
    // incremental updates — only on first selection.
    const handler = appJs.match(/onCronLogUpdated[\s\S]*?\}\s*\);/);
    assert.ok(handler, 'onCronLogUpdated handler should be findable');
    assert.doesNotMatch(handler[0], /await\s+selectCronLogRun\(/);
    // spinner class exists
    assert.match(stylesCss, /\.cron-log-spinner/);
    assert.match(stylesCss, /@keyframes\s+cron-log-spin/);
  });

  test('cron log detail reset preserves the detail skeleton DOM', () => {
    assert.match(appJs, /function\s+showCronLogDetailPlaceholder\s*\(/);
    assert.doesNotMatch(appJs, /cronEls\.logDetail\.innerHTML\s*=/);
    assert.match(stylesCss, /\.cron-log-detail-body\[hidden\][\s\S]*display\s*:\s*none\s*!important/);
    assert.match(stylesCss, /\.cron-log-detail-empty\[hidden\][\s\S]*display\s*:\s*none\s*!important/);
    assert.match(stylesCss, /\.cron-log-detail\s*\{[\s\S]*display\s*:\s*flex/);
  });

  test('cron log detail constrains outer height and scrolls inner content panes', () => {
    const auditGridRule = stylesCss.match(/\.cron-audit-grid\s*\{([\s\S]*?)\n\}/);
    assert.ok(auditGridRule, '.cron-audit-grid rule should exist');
    assert.match(auditGridRule[1], /height\s*:\s*clamp\(420px,\s*calc\(100vh - 180px\),\s*620px\)/);

    const detailRule = stylesCss.match(/\.cron-log-detail\s*\{([\s\S]*?)\n\}/);
    assert.ok(detailRule, '.cron-log-detail rule should exist');
    assert.match(detailRule[1], /overflow\s*:\s*hidden/);

    const eventsRule = stylesCss.match(/\.cron-log-events\s*\{([\s\S]*?)\n\}/);
    assert.ok(eventsRule, '.cron-log-events rule should exist');
    assert.match(eventsRule[1], /overflow\s*:\s*auto/);
    assert.match(eventsRule[1], /min-height\s*:\s*0/);

    const filesContentRule = stylesCss.match(/\.cron-log-files-content\s*\{([\s\S]*?)\n\}/);
    assert.ok(filesContentRule, '.cron-log-files-content rule should exist');
    assert.match(filesContentRule[1], /overflow\s*:\s*auto/);
    assert.match(filesContentRule[1], /min-height\s*:\s*0/);
  });
});
