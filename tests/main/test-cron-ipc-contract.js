const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const configStoreJs = fs.readFileSync(path.join(root, 'src', 'main', 'config-store.js'), 'utf8');
const ipcHandlersJs = fs.readFileSync(path.join(root, 'src', 'main', 'ipc-handlers.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(root, 'src', 'preload', 'index.js'), 'utf8');

describe('cron execution log IPC contract', () => {
  test('config defaults cron log storage to 100 MB', () => {
    assert.match(configStoreJs, /cronLogMaxMb\s*:\s*100/);
  });

  test('main process exposes log list, detail, clear, and settings handlers', () => {
    for (const channel of [
      'cron:logs:list',
      'cron:logs:get',
      'cron:logs:clear',
      'cron:logs:settings:get',
      'cron:logs:settings:set',
    ]) {
      assert.match(ipcHandlersJs, new RegExp(`ipcMain\\.handle\\('${channel.replaceAll(':', '\\:')}'`));
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
