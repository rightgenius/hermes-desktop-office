const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  createLogEntry,
  filterLogEntries,
  formatLogExport,
  countLogLevels,
} = require('../../src/renderer/log-utils');

describe('renderer log utilities', () => {
  test('parses known log levels and preserves the original message', () => {
    const info = createLogEntry('[INFO] Agent 已启动');
    const error = createLogEntry('[ERROR] Agent start失败: missing key');
    const plain = createLogEntry('bridge connected');

    assert.strictEqual(info.level, 'INFO');
    assert.strictEqual(info.message, 'Agent 已启动');
    assert.strictEqual(info.raw, '[INFO] Agent 已启动');
    assert.strictEqual(error.level, 'ERROR');
    assert.strictEqual(error.message, 'Agent start失败: missing key');
    assert.strictEqual(plain.level, 'INFO');
    assert.strictEqual(plain.message, 'bridge connected');
  });

  test('filters entries by level and case-insensitive search text', () => {
    const entries = [
      createLogEntry('[INFO] Agent 已启动'),
      createLogEntry('[WARN] Gateway token missing'),
      createLogEntry('[ERROR] Agent start failed'),
      createLogEntry('[DEBUG] workspace resolved'),
    ];

    assert.deepStrictEqual(
      filterLogEntries(entries, { level: 'ERROR', query: '' }).map(entry => entry.message),
      ['Agent start failed'],
    );
    assert.deepStrictEqual(
      filterLogEntries(entries, { level: 'ALL', query: 'agent' }).map(entry => entry.level),
      ['INFO', 'ERROR'],
    );
    assert.deepStrictEqual(
      filterLogEntries(entries, { level: 'WARN', query: 'token' }).map(entry => entry.raw),
      ['[WARN] Gateway token missing'],
    );
  });

  test('counts entries by level and formats visible logs for export', () => {
    const entries = [
      createLogEntry('[INFO] Agent 已启动'),
      createLogEntry('[WARN] Gateway token missing'),
      createLogEntry('[ERROR] Agent start failed'),
      createLogEntry('[INFO] Agent 已停止'),
    ];

    assert.deepStrictEqual(countLogLevels(entries), {
      total: 4,
      INFO: 2,
      WARN: 1,
      ERROR: 1,
      DEBUG: 0,
    });

    assert.strictEqual(
      formatLogExport(entries.slice(1, 3)),
      '[WARN] Gateway token missing\n[ERROR] Agent start failed\n',
    );
  });
});
