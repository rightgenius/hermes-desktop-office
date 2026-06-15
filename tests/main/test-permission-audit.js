'use strict';

// Unit tests for permission-audit helpers in src/renderer/app.js.
// We extract pure functions via Function() eval since app.js is meant
// to run in a browser context (relies on window, document, etc.).

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'renderer', 'app.js'),
  'utf8',
);

// 提取目标函数体（用正则找 function declaration 到下一个 "function " 或 EOF）
function extractFunction(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^]*?\\n\\}`, 'm');
  const m = appJs.match(re);
  if (!m) throw new Error(`function ${name} not found in app.js`);
  return m[0];
}

describe('formatCronPermissionTime', () => {
  const fn = new Function(extractFunction('formatCronPermissionTime') + '; return formatCronPermissionTime;')();

  test('formats ISO timestamp with zero-padding', () => {
    assert.strictEqual(fn('2026-06-15T01:23:45.000Z').match(/2026-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)[0].length, 19);
  });

  test('handles missing input gracefully', () => {
    assert.strictEqual(fn(''), '');
    assert.strictEqual(fn(null), '');
    assert.strictEqual(fn(undefined), '');
  });

  test('returns the raw input when invalid date', () => {
    assert.strictEqual(fn('not-a-date'), 'not-a-date');
  });

  test('produces YYYY-MM-DD HH:MM:SS format', () => {
    const out = fn('2026-01-02T03:04:05.000Z');
    assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('permission audit rendering — filter logic smoke test', () => {
  // We don't load app.js's renderCronPermissionList (it touches DOM).
  // Instead we replicate the filter logic here to document expected behavior.

  function filterEntries(entries, { decisionFilter, jobFilter, searchRaw }) {
    let searchRegex = null;
    if (searchRaw) {
      try { searchRegex = new RegExp(searchRaw, 'i'); } catch { searchRegex = null; }
    }
    return entries.filter((e) => {
      if (jobFilter && e.jobId !== jobFilter) return false;
      if (decisionFilter) {
        if (e.type !== 'decision') return false;
        if (e.decision !== decisionFilter) return false;
      }
      if (searchRaw) {
        const haystack = `${e.command || ''} ${e.rule_id || ''} ${e.description || ''}`;
        if (searchRegex) {
          if (!searchRegex.test(haystack)) return false;
        } else if (!haystack.toLowerCase().includes(searchRaw.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }

  const sample = [
    { type: 'policy_applied', jobId: 'job-1', policy: 'denylist_auto_authorize', timestamp: '2026-06-15T01:00:00Z' },
    { type: 'decision', decision: 'auto_approve', jobId: 'job-1', rule_id: null, command: 'ls -la /tmp', description: '安全命令', timestamp: '2026-06-15T01:00:01Z' },
    { type: 'decision', decision: 'denylist_blocked', jobId: 'job-1', rule_id: 'net.reverse_ssh', command: 'ssh -R 80:host:80 user@x', description: 'SSH 反向转发', timestamp: '2026-06-15T01:00:02Z' },
    { type: 'decision', decision: 'denylist_blocked', jobId: 'job-2', rule_id: 'cred.read_aws_creds', command: 'cat ~/.aws/credentials', description: '读 AWS 凭证', timestamp: '2026-06-15T01:00:03Z' },
  ];

  test('no filter returns everything', () => {
    assert.strictEqual(filterEntries(sample, {}).length, 4);
  });

  test('decision filter excludes policy_applied', () => {
    const out = filterEntries(sample, { decisionFilter: 'auto_approve' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].decision, 'auto_approve');
  });

  test('decision filter deny only', () => {
    const out = filterEntries(sample, { decisionFilter: 'denylist_blocked' });
    assert.strictEqual(out.length, 2);
    assert.ok(out.every((e) => e.decision === 'denylist_blocked'));
  });

  test('job filter scopes to one task', () => {
    const out = filterEntries(sample, { jobFilter: 'job-2' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].jobId, 'job-2');
  });

  test('search by substring (non-regex) matches command text', () => {
    const out = filterEntries(sample, { searchRaw: 'ssh' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].rule_id, 'net.reverse_ssh');
  });

  test('search by regex matches rule_id', () => {
    const out = filterEntries(sample, { searchRaw: 'cred\\.' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].rule_id, 'cred.read_aws_creds');
  });

  test('invalid regex falls back to substring match', () => {
    const out = filterEntries(sample, { searchRaw: '[invalid(' });
    assert.strictEqual(out.length, 0);
  });

  test('combined filters AND together', () => {
    const out = filterEntries(sample, { decisionFilter: 'denylist_blocked', jobFilter: 'job-1' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].rule_id, 'net.reverse_ssh');
  });
});

describe('permission audit — HTML structure integrity', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'),
    'utf8',
  );

  test('cron-audit-tabs container exists', () => {
    assert.match(html, /id="cron-audit-tabs"/);
  });

  test('two tab buttons present', () => {
    const tabs = html.match(/data-cron-audit-tab="([^"]+)"/g) || [];
    assert.strictEqual(tabs.length, 2);
    assert.ok(tabs.some((t) => t.includes('executions')));
    assert.ok(tabs.some((t) => t.includes('permissions')));
  });

  test('two panel containers present', () => {
    const panels = html.match(/data-cron-audit-panel="([^"]+)"/g) || [];
    assert.strictEqual(panels.length, 2);
  });

  test('permission filters rendered', () => {
    for (const id of [
      'cron-permission-decision-filter',
      'cron-permission-job-filter',
      'cron-permission-search',
      'cron-permission-refresh',
      'cron-permission-stats',
      'cron-permission-list',
    ]) {
      assert.ok(html.includes(`id="${id}"`), `${id} missing from HTML`);
    }
  });
});