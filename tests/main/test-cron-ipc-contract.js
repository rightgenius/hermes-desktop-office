const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const configStoreJs = fs.readFileSync(path.join(root, 'src', 'main', 'config-store.js'), 'utf8');
const ipcHandlersJs = fs.readFileSync(path.join(root, 'src', 'main', 'ipc-handlers.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(root, 'src', 'preload', 'index.js'), 'utf8');

describe('IPC handler idempotent wrapper', () => {
  test('wrapper function does not infinitely recurse into itself', () => {
    // Find the handle(...) wrapper body. It must delegate to ipcMain.handle,
    // not call itself. (A sed-based global rename once left a stub that
    // called handle(channel, listener) instead of ipcMain.handle(...), causing
    // stack overflow and "No handler registered for config-get" failures.)
    const wrapperMatch = ipcHandlersJs.match(
      /function\s+handle\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/,
    );
    assert.ok(wrapperMatch, 'handle() wrapper function should be defined');
    const body = wrapperMatch[1];
    // The wrapper must reference ipcMain.handle(...) internally
    assert.match(body, /ipcMain\.handle\(/, 'wrapper must call ipcMain.handle internally');
    // The wrapper must NOT call handle(channel, ...) recursively
    // (only ipcMain.handle is allowed, not bare handle)
    assert.doesNotMatch(
      body,
      /(?<!\.)\bhandle\s*\(\s*channel\s*,/,
      'wrapper must not recursively call handle(channel, ...)',
    );
  });

  test('wrapper tracks registered channels for idempotent re-setup', () => {
    assert.match(
      ipcHandlersJs,
      /registeredChannels\s*=\s*new\s+Set\(\)/,
      'registeredChannels Set should be defined',
    );
    const wrapperMatch = ipcHandlersJs.match(
      /function\s+handle\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/,
    );
    assert.match(wrapperMatch[1], /registeredChannels\.add\(/);
  });
});

describe('cron execution log IPC contract', () => {
  test('config defaults cron log storage to 100 MB', () => {
    assert.match(configStoreJs, /cronLogMaxMb\s*:\s*100/);
  });

  test('main process exposes log list, detail, clear, and settings handlers', () => {
    // Match either the raw `ipcMain.handle(...)` form (legacy) or the
    // idempotent `handle(...)` wrapper introduced to support repeated
    // setupIPCHandlers() calls (e.g. macOS dock reactivation).
    for (const channel of [
      'cron:logs:list',
      'cron:logs:get',
      'cron:logs:clear',
      'cron:logs:settings:get',
      'cron:logs:settings:set',
    ]) {
      const re = new RegExp(`(?:ipcMain\\.)?handle\\('${channel.replaceAll(':', '\\:')}'`);
      assert.match(ipcHandlersJs, re);
    }
    assert.match(ipcHandlersJs, /new CronManager\(agentManager,\s*mainWindow,\s*\{[\s\S]*configStore/);
  });

  test('preload exposes every log operation and a removable update listener', () => {
    assert.match(preloadJs, /cronLogsList:\s*\(options\)\s*=>\s*ipcRenderer\.invoke\('cron:logs:list'/);
    assert.match(preloadJs, /cronLogsGet:\s*\(runId\)\s*=>\s*ipcRenderer\.invoke\('cron:logs:get'/);
    assert.match(preloadJs, /cronLogsClear:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('cron:logs:clear'/);
    assert.match(preloadJs, /cronLogSettingsGet:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('cron:logs:settings:get'/);
    assert.match(preloadJs, /cronLogSettingsSet:\s*\(maxMb\)\s*=>\s*ipcRenderer\.invoke\('cron:logs:settings:set'/);
    assert.match(preloadJs, /onCronLogUpdated:\s*\(fn\)\s*=>\s*\{/);
    assert.match(preloadJs, /ipcRenderer\.removeListener\('cron-log-updated',\s*handler\)/);
  });
});
