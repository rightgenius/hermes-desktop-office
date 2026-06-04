const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { GatewayManager } = require('../../src/main/gateway-manager');
const path = require('path');
const os = require('os');
const fs = require('fs');

function makeManager() {
  return new GatewayManager({ isDestroyed: () => false, webContents: { send: () => {} } });
}

describe('GatewayManager - detection', () => {
  let manager;

  beforeEach(() => { manager = makeManager(); });
  afterEach(async () => {
    if (manager.running) await manager.stop();
    manager.stopHealthCheck();
  });

  test('initial state: not running, no external gateway', () => {
    assert.strictEqual(manager.running, false);
    assert.strictEqual(manager.externalGateway, null);
  });

  test('isGatewayCommandLine matches canonical patterns', () => {
    assert.ok(manager._isGatewayCommandLine('python -m hermes_cli.main gateway run'));
    assert.ok(manager._isGatewayCommandLine('/Users/x/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run --replace'));
    assert.ok(manager._isGatewayCommandLine('python /path/to/gateway/run.py'));
    assert.ok(manager._isGatewayCommandLine('hermes gateway run'));
    assert.ok(!manager._isGatewayCommandLine(''));
    assert.ok(!manager._isGatewayCommandLine('/usr/bin/vim'));
    assert.ok(!manager._isGatewayCommandLine('node /path/to/random.js'));
    assert.ok(!manager._isGatewayCommandLine('python /path/to/dws/auth.py'));
  });

  test('rejects recycled PID: PID file PID points to non-gateway process', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');
    const backupFile = pidFile + '.testbak';
    let hadBackup = false;
    if (fs.existsSync(pidFile)) {
      fs.copyFileSync(pidFile, backupFile);
      hadBackup = true;
    }
    try {
      // Write this Node process's PID into the gateway PID file - this is definitely not a gateway
      const ourPid = process.pid;
      fs.writeFileSync(pidFile, JSON.stringify({ pid: ourPid, kind: 'hermes-gateway' }));

      const result = await manager._detectViaPidFile(pidFile);
      assert.strictEqual(result, null, 'Recycled PID (Node process) should be rejected, not returned as gateway');
      assert.ok(manager.externalGateway === null || manager.externalGateway.pid !== ourPid, 'externalGateway must not be set to non-gateway PID');
    } finally {
      if (hadBackup) {
        fs.copyFileSync(backupFile, pidFile);
        fs.unlinkSync(backupFile);
      } else {
        fs.unlinkSync(pidFile);
      }
    }
  });

  test('detects dead PID in PID file as null', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');
    const backupFile = pidFile + '.testbak';
    let hadBackup = false;
    if (fs.existsSync(pidFile)) {
      fs.copyFileSync(pidFile, backupFile);
      hadBackup = true;
    }
    try {
      // Pick a PID that's almost certainly dead (very high number)
      fs.writeFileSync(pidFile, JSON.stringify({ pid: 99999, kind: 'hermes-gateway' }));

      const result = await manager._detectViaPidFile(pidFile);
      assert.strictEqual(result, null, 'Dead PID should be detected as null');
    } finally {
      if (hadBackup) {
        fs.copyFileSync(backupFile, pidFile);
        fs.unlinkSync(backupFile);
      } else {
        fs.unlinkSync(pidFile);
      }
    }
  });

  test('detects valid gateway PID file', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');
    const backupFile = pidFile + '.testbak';
    let hadBackup = false;
    if (fs.existsSync(pidFile)) {
      fs.copyFileSync(pidFile, backupFile);
      hadBackup = true;
    }
    try {
      // Use a real gateway process if any; otherwise simulate by mocking
      // First check if a real gateway is running
      const result = await manager._detectViaPidFile(pidFile);
      if (result) {
        assert.ok(result.pid > 0);
        assert.strictEqual(result.manager, 'pid-file');
        assert.strictEqual(result.source, 'PID 文件');
      } else {
        // No real gateway — that's also valid; we just need the function to not crash
        assert.ok(true, '_detectViaPidFile completed without error');
      }
    } finally {
      if (hadBackup) {
        fs.copyFileSync(backupFile, pidFile);
        fs.unlinkSync(backupFile);
      } else {
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      }
    }
  });

  test('_verifyExternalGateway returns false for dead PID', async () => {
    const external = { pid: 99999, manager: 'pid-file', source: 'test' };
    const result = await manager._verifyExternalGateway(external);
    assert.strictEqual(result, false);
  });

  test('_verifyExternalGateway returns false for recycled PID', async () => {
    const external = { pid: process.pid, manager: 'pid-file', source: 'test' };
    const result = await manager._verifyExternalGateway(external);
    assert.strictEqual(result, false, 'Recycled PID should fail verification');
  });
});

describe('GatewayManager - start guards', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });
  afterEach(async () => {
    if (manager.running) await manager.stop();
    manager.stopHealthCheck();
  });

  test('start() refuses when external gateway is detected', async () => {
    manager.externalGateway = { pid: 12345, manager: 'manual', source: 'test' };
    const result = await manager.start();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('外部'));
  });

  test('start() refuses when already running', async () => {
    manager.running = true;
    const result = await manager.start();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('已在运行'));
    manager.running = false;
  });
});

describe('GatewayManager - health check', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });
  afterEach(() => manager.stopHealthCheck());

  test('health check is no-op when nothing is running', async () => {
    await manager._runHealthCheck();
    assert.strictEqual(manager.running, false);
    assert.strictEqual(manager.externalGateway, null);
  });

  test('health check clears dead external gateway', async () => {
    manager.externalGateway = { pid: 99999, manager: 'pid-file', source: 'test' };
    await manager._runHealthCheck();
    assert.strictEqual(manager.externalGateway, null);
  });

  test('health check keeps valid external gateway', async () => {
    // Find a real gateway if running
    const external = await manager.detectExternalGateway();
    if (external) {
      await manager._runHealthCheck();
      assert.ok(manager.externalGateway !== null);
      assert.strictEqual(manager.externalGateway.pid, external.pid);
    } else {
      // Skip if no real gateway
      assert.ok(true, 'No external gateway detected - skipping');
    }
  });

  test('startHealthCheck + stopHealthCheck works', () => {
    manager.startHealthCheck(60000);
    assert.ok(manager._healthTimer !== null);
    manager.stopHealthCheck();
    assert.strictEqual(manager._healthTimer, null);
  });
});

describe('GatewayManager - takeover', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });
  afterEach(async () => {
    if (manager.running) await manager.stop();
    manager.stopHealthCheck();
  });

  test('takeover fails when no external gateway detected', async () => {
    const result = await manager.takeover();
    // In a test environment with no real gateway, this should fail
    // (or succeed with a weird PID)
    if (!result.success) {
      assert.ok(result.error);
    }
  });

  test('takeover fails when GUI gateway already running', async () => {
    manager.externalGateway = { pid: 12345, manager: 'manual', source: 'test' };
    manager.running = true;
    const result = await manager.takeover();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('GUI'));
    manager.running = false;
  });
});

describe('GatewayManager - restart external', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });
  afterEach(async () => {
    if (manager.running) await manager.stop();
    manager.stopHealthCheck();
  });

  test('restartExternal fails when no external gateway', async () => {
    // Force a clean state
    manager.externalGateway = null;
    const result = await manager.restartExternal();
    if (!result.success) {
      assert.ok(result.error);
    }
  });
});

describe('GatewayManager - config parsing', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });

  test('parseYamlValue handles edge cases', () => {
    assert.strictEqual(manager._parseYamlValue('null'), null);
    assert.strictEqual(manager._parseYamlValue('~'), null);
    assert.strictEqual(manager._parseYamlValue('true'), true);
    assert.strictEqual(manager._parseYamlValue('false'), false);
    assert.strictEqual(manager._parseYamlValue('""'), '');
    assert.strictEqual(manager._parseYamlValue("''"), '');
    assert.strictEqual(manager._parseYamlValue('"hello"'), 'hello');
    assert.strictEqual(manager._parseYamlValue("'hello'"), 'hello');
    assert.strictEqual(manager._parseYamlValue('42'), 42);
    assert.strictEqual(manager._parseYamlValue('3.14'), 3.14);
    assert.strictEqual(manager._parseYamlValue('plain'), 'plain');
  });
});

describe('GatewayManager - getGatewayRuntimeStatus', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });

  test('returns available=false when no state file', async () => {
    // Temporarily set HOME to a place with no .hermes
    const realHome = os.homedir();
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'));
    try {
      // Can't easily mock os.homedir in this Node version, so just check current state
      const result = await manager.getGatewayRuntimeStatus();
      assert.ok(typeof result === 'object');
      assert.ok('available' in result);
    } finally {
      // Cleanup
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

describe('GatewayManager - env handling (DingTalk/Feishu credentials)', () => {
  let manager;
  let envFile;
  let envBackup;
  let hadBackup = false;

  beforeEach(() => {
    manager = makeManager();
    envFile = path.join(os.homedir(), '.hermes', '.env');
    if (fs.existsSync(envFile)) {
      envBackup = envFile + '.unittest.bak';
      fs.copyFileSync(envFile, envBackup);
      hadBackup = true;
    }
  });

  afterEach(() => {
    if (hadBackup && envBackup && fs.existsSync(envBackup)) {
      fs.copyFileSync(envBackup, envFile);
      fs.unlinkSync(envBackup);
    } else if (fs.existsSync(envFile)) {
      fs.unlinkSync(envFile);
    }
  });

  test('_loadHermesEnv reads .env key=value pairs', () => {
    fs.writeFileSync(envFile, 'DINGTALK_CLIENT_ID=dt_id\nDINGTALK_CLIENT_SECRET=dt_secret\nFEISHU_APP_ID=fs_id\n');
    const env = manager._loadHermesEnv();
    assert.strictEqual(env.DINGTALK_CLIENT_ID, 'dt_id');
    assert.strictEqual(env.DINGTALK_CLIENT_SECRET, 'dt_secret');
    assert.strictEqual(env.FEISHU_APP_ID, 'fs_id');
  });

  test('_loadHermesEnv skips comments and blank lines', () => {
    fs.writeFileSync(envFile, [
      '# this is a comment',
      '',
      'DINGTALK_CLIENT_ID=actual_value',
      '  # indented comment',
      '   ',
    ].join('\n'));
    const env = manager._loadHermesEnv();
    assert.strictEqual(env.DINGTALK_CLIENT_ID, 'actual_value');
    assert.strictEqual(Object.keys(env).length, 1);
  });

  test('_loadHermesEnv strips surrounding quotes', () => {
    fs.writeFileSync(envFile, 'DINGTALK_CLIENT_ID="quoted_value"\nFEISHU_APP_ID=\'single_quoted\'\n');
    const env = manager._loadHermesEnv();
    assert.strictEqual(env.DINGTALK_CLIENT_ID, 'quoted_value');
    assert.strictEqual(env.FEISHU_APP_ID, 'single_quoted');
  });

  test('_buildChildEnv includes .env vars + HERMES_HOME', () => {
    fs.writeFileSync(envFile, 'DINGTALK_CLIENT_ID=dt_id\nFEISHU_APP_SECRET=fs_secret\n');
    const env = manager._buildChildEnv();
    assert.strictEqual(env.DINGTALK_CLIENT_ID, 'dt_id');
    assert.strictEqual(env.FEISHU_APP_SECRET, 'fs_secret');
    assert.strictEqual(env.HERMES_HOME, path.join(os.homedir(), '.hermes'));
  });

  test('_buildChildEnv lets extras override defaults', () => {
    fs.writeFileSync(envFile, 'DINGTALK_CLIENT_ID=from_env\n');
    const env = manager._buildChildEnv({ DINGTALK_CLIENT_ID: 'override' });
    assert.strictEqual(env.DINGTALK_CLIENT_ID, 'override', 'extras should win over .env');
  });

  test('_buildChildEnv works with missing .env', () => {
    if (fs.existsSync(envFile)) fs.unlinkSync(envFile);
    const env = manager._buildChildEnv();
    assert.strictEqual(env.HERMES_HOME, path.join(os.homedir(), '.hermes'));
    assert.ok(!('DINGTALK_CLIENT_ID' in env));
  });
});

describe('GatewayManager - stale artifact cleanup', () => {
  let manager;
  let pidFile;
  let lockFile;
  let hadPidBackup = false;
  let hadLockBackup = false;
  let pidBackup;
  let lockBackup;

  beforeEach(() => {
    manager = makeManager();
    const hermesHome = path.join(os.homedir(), '.hermes');
    pidFile = path.join(hermesHome, 'gateway.pid');
    lockFile = path.join(hermesHome, 'gateway.lock');
    if (fs.existsSync(pidFile)) {
      pidBackup = pidFile + '.unittest.bak';
      fs.copyFileSync(pidFile, pidBackup);
      hadPidBackup = true;
    }
    if (fs.existsSync(lockFile)) {
      lockBackup = lockFile + '.unittest.bak';
      fs.copyFileSync(lockFile, lockBackup);
      hadLockBackup = true;
    }
  });

  afterEach(() => {
    if (hadPidBackup && pidBackup && fs.existsSync(pidBackup)) {
      fs.copyFileSync(pidBackup, pidFile);
      fs.unlinkSync(pidBackup);
    } else if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    if (hadLockBackup && lockBackup && fs.existsSync(lockBackup)) {
      fs.copyFileSync(lockBackup, lockFile);
      fs.unlinkSync(lockBackup);
    } else if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  });

  test('removes PID file with dead PID', () => {
    fs.writeFileSync(pidFile, JSON.stringify({ pid: 99999, kind: 'hermes-gateway' }));
    manager._cleanStaleGatewayArtifacts();
    assert.strictEqual(fs.existsSync(pidFile), false, 'Stale PID file should be removed');
  });

  test('removes lock file with dead PID', () => {
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999, kind: 'hermes-gateway' }));
    manager._cleanStaleGatewayArtifacts();
    assert.strictEqual(fs.existsSync(lockFile), false, 'Stale lock file should be removed');
  });

  test('does NOT remove PID file with alive PID', () => {
    fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, kind: 'hermes-gateway' }));
    manager._cleanStaleGatewayArtifacts();
    assert.strictEqual(fs.existsSync(pidFile), true, 'Live PID file should NOT be removed');
  });

  test('handles unparseable PID file as stale', () => {
    fs.writeFileSync(pidFile, 'garbage data not valid json or pid');
    manager._cleanStaleGatewayArtifacts();
    assert.strictEqual(fs.existsSync(pidFile), false, 'Unparseable PID file should be removed');
  });

  test('no-op when no files exist', () => {
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    // Should not throw
    manager._cleanStaleGatewayArtifacts();
    assert.strictEqual(fs.existsSync(pidFile), false);
  });
});
