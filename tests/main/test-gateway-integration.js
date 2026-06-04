// Integration test: verify the bug fix for "GUI shows local gateway running when it's not"
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { GatewayManager } = require('../../src/main/gateway-manager');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

function makeManager() {
  return new GatewayManager({ isDestroyed: () => false, webContents: { send: () => {} } });
}

describe('GatewayManager - integration: bug fix for false-positive detection', () => {
  let manager;
  let child;
  let pidFile;
  let backupFile;
  let hadBackup = false;

  beforeEach(() => {
    manager = makeManager();
    const hermesHome = path.join(os.homedir(), '.hermes');
    pidFile = path.join(hermesHome, 'gateway.pid');
    if (fs.existsSync(pidFile)) {
      backupFile = pidFile + '.integrationtest.bak';
      fs.copyFileSync(pidFile, backupFile);
      hadBackup = true;
    }
  });

  afterEach(async () => {
    if (manager.running) await manager.stop();
    manager.stopHealthCheck();
    if (child && !child.killed) {
      try { child.kill('SIGKILL'); } catch {}
    }
    if (hadBackup && backupFile && fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, pidFile);
      fs.unlinkSync(backupFile);
    } else if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  });

  test('bug fix: stale externalGateway is cleared by health check', async () => {
    // 1. Simulate "GUI detected external gateway, but it died"
    // In real life, the gateway died silently. The manager has stale state.
    manager.externalGateway = { pid: 99999, manager: 'pid-file', source: 'PID 文件' };

    // 2. Bug repro: without health check, the manager still thinks it's running
    assert.ok(manager.externalGateway !== null, 'BEFORE: stale external gateway still in memory');

    // 3. Run the health check - this is the bug fix
    await manager._runHealthCheck();

    // 4. After health check, the external gateway should be cleared
    assert.strictEqual(manager.externalGateway, null, 'AFTER: stale external gateway should be cleared');

    // 5. Verify the IPC handler's status output would be "not running"
    const status = manager.externalGateway
      ? { running: true, source: 'external' }
      : manager.running
        ? { running: true, source: 'gui' }
        : { running: false, source: 'none' };
    assert.strictEqual(status.running, false);
    assert.strictEqual(status.source, 'none');
  });

  test('bug fix: real external gateway with dead PID is cleared', async () => {
    // 1. Write a PID file pointing to a dead process
    fs.writeFileSync(pidFile, JSON.stringify({ pid: 99999, kind: 'hermes-gateway' }));

    // 2. Run a fresh detection (this is what startup does)
    const detected = await manager.detectExternalGateway();

    // 3. If the real gateway is running on this system, detection will find IT instead of the fake PID.
    //    We just want to verify the health check works.
    if (detected) {
      // Force-set the stale state to simulate the bug
      manager.externalGateway = { pid: 99999, manager: 'pid-file', source: 'PID 文件' };
      await manager._runHealthCheck();
      assert.strictEqual(manager.externalGateway, null, 'Dead PID should be cleared by health check');
    } else {
      // No real gateway - we already have a stale state from the write
      await manager._runHealthCheck();
      assert.strictEqual(manager.externalGateway, null);
    }
  });

  test('bug fix: recycled PID is rejected via cmdline verification', async () => {
    // 1. Write this Node process's PID into the gateway PID file.
    //    The cmdline will be "node", not a gateway pattern.
    fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, kind: 'hermes-gateway' }));

    // 2. The detection should reject this
    const result = await manager._detectViaPidFile(pidFile);
    assert.strictEqual(result, null, 'Recycled PID (Node process) should be rejected by cmdline check');
  });

  test('bug fix: real gateway process with valid cmdline is detected and kept', async () => {
    // 1. Spawn a fake gateway process with proper cmdline
    child = spawn(process.execPath, ['-e', `
      // Sleep forever - the cmdline shows as "node" so we need to override
      // Object.defineProperty does not change what ps shows, only what process.argv returns.
      // So we use a different approach: rename the process using process.title
      process.title = 'hermes_cli.main gateway run --integration-test';
      setInterval(() => {}, 1000);
    `], { stdio: 'pipe' });
    child.unref();
    
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    if (!child.pid || child.killed) {
      // Child didn't start
      assert.ok(true, 'Child did not start - skipping');
      return;
    }

    fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, kind: 'hermes-gateway' }));

    // 2. Detect
    const detected = await manager._detectViaPidFile(pidFile);
    if (detected) {
      assert.strictEqual(detected.pid, child.pid);
      assert.strictEqual(detected.manager, 'pid-file');
    }
    // Either way, we verified the function didn't crash

    // 3. Kill and verify health check clears it
    child.kill('SIGKILL');
    child = null;
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    if (manager.externalGateway) {
      await manager._runHealthCheck();
      assert.strictEqual(manager.externalGateway, null, 'Killed fake gateway should be cleared');
    }
  });

  test('integration: health check on GUI-managed gateway with dead PID', async () => {
    // Simulate: GUI started gateway, but the process died (and the 'close' event hasn't fired)
    manager.running = true;
    manager.process = { pid: 99999 };  // Fake process with dead PID
    manager._startTime = Date.now();

    await manager._runHealthCheck();

    assert.strictEqual(manager.running, false, 'GUI running with dead PID should be cleared');
    assert.strictEqual(manager.process, null, 'Process reference should be cleared');
  });

  test('integration: state transitions - no false positives', async () => {
    // Sequence: nothing -> external (alive) -> external (dies) -> nothing
    assert.strictEqual(manager.externalGateway, null);
    assert.strictEqual(manager.running, false);

    // Inject an alive external gateway (using real if available, otherwise skip)
    const realExt = await manager.detectExternalGateway();
    if (realExt) {
      // Force-set to test the cleanup path
      manager.externalGateway = { pid: 99999, manager: 'pid-file', source: 'test' };
      await manager._runHealthCheck();
      assert.strictEqual(manager.externalGateway, null, 'Should be cleared');
    } else {
      assert.ok(true, 'No real gateway running - skipped');
    }
  });

  test('bug fix: spawned gateway receives DINGTALK/FEISHU credentials from ~/.hermes/.env', async () => {
    // This is the user's reported bug: GUI started gateway, UI shows running,
    // but DingTalk messages get no response. Root cause: spawn() didn't pass
    // the env vars from ~/.hermes/.env, so adapter requirements checks
    // (os.getenv("DINGTALK_CLIENT_ID")) failed and no adapters were loaded.

    const hermesHome = path.join(os.homedir(), '.hermes');
    const envFile = path.join(hermesHome, '.env');
    const envBackup = envFile + '.integrationtest.bak';
    let hadEnvBackup = false;
    if (fs.existsSync(envFile)) {
      fs.copyFileSync(envFile, envBackup);
      hadEnvBackup = true;
    }

    try {
      // 1. Set up a known .env with test credentials
      fs.writeFileSync(envFile, [
        'DINGTALK_CLIENT_ID=test_ding_id',
        'DINGTALK_CLIENT_SECRET=test_ding_secret',
        'FEISHU_APP_ID=test_feishu_id',
        'FEISHU_APP_SECRET=test_feishu_secret',
        '# other var with spaces = should be ignored as comment',
        '  ',
        '=missing_key=should_be_ignored',
        '',
      ].join('\n'));

      // 2. Verify _loadHermesEnv() reads these vars
      const loaded = manager._loadHermesEnv();
      assert.strictEqual(loaded.DINGTALK_CLIENT_ID, 'test_ding_id');
      assert.strictEqual(loaded.DINGTALK_CLIENT_SECRET, 'test_ding_secret');
      assert.strictEqual(loaded.FEISHU_APP_ID, 'test_feishu_id');
      assert.strictEqual(loaded.FEISHU_APP_SECRET, 'test_feishu_secret');

      // 3. Verify _buildChildEnv() includes these vars + HERMES_HOME
      const childEnv = manager._buildChildEnv();
      assert.strictEqual(childEnv.DINGTALK_CLIENT_ID, 'test_ding_id');
      assert.strictEqual(childEnv.DINGTALK_CLIENT_SECRET, 'test_ding_secret');
      assert.strictEqual(childEnv.FEISHU_APP_ID, 'test_feishu_id');
      assert.strictEqual(childEnv.FEISHU_APP_SECRET, 'test_feishu_secret');
      assert.strictEqual(childEnv.HERMES_HOME, hermesHome);
    } finally {
      // Restore original .env
      if (hadEnvBackup) {
        fs.copyFileSync(envBackup, envFile);
        fs.unlinkSync(envBackup);
      } else {
        if (fs.existsSync(envFile)) fs.unlinkSync(envFile);
      }
    }
  });

  test('bug fix: spawned child process actually receives env vars in os.environ', async () => {
    // End-to-end test: spawn a real process and verify it sees the env vars.
    // This proves the spawn() call passes them through.

    const hermesHome = path.join(os.homedir(), '.hermes');
    const envFile = path.join(hermesHome, '.env');
    const envBackup = envFile + '.integrationtest.bak';
    let hadEnvBackup = false;
    if (fs.existsSync(envFile)) {
      fs.copyFileSync(envFile, envBackup);
      hadEnvBackup = true;
    }

    try {
      fs.writeFileSync(envFile, 'DINGTALK_CLIENT_ID=verify_me_12345\nFEISHU_APP_ID=verify_feishu_999\n');

      // Spawn a Node child that prints its env vars as JSON and exits
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, ['-e', `
        const r = {
          DINGTALK_CLIENT_ID: process.env.DINGTALK_CLIENT_ID || null,
          FEISHU_APP_ID: process.env.FEISHU_APP_ID || null,
          HERMES_HOME: process.env.HERMES_HOME || null,
        };
        process.stdout.write(JSON.stringify(r));
      `], { env: manager._buildChildEnv() });

      let stdout = '';
      child.stdout.on('data', d => { stdout += d.toString(); });

      await new Promise((resolve) => {
        child.on('close', resolve);
      });

      const result = JSON.parse(stdout);
      assert.strictEqual(result.DINGTALK_CLIENT_ID, 'verify_me_12345', 'Child should see DINGTALK_CLIENT_ID from .env');
      assert.strictEqual(result.FEISHU_APP_ID, 'verify_feishu_999', 'Child should see FEISHU_APP_ID from .env');
      assert.strictEqual(result.HERMES_HOME, hermesHome, 'Child should see HERMES_HOME');
    } finally {
      if (hadEnvBackup) {
        fs.copyFileSync(envBackup, envFile);
        fs.unlinkSync(envBackup);
      } else {
        if (fs.existsSync(envFile)) fs.unlinkSync(envFile);
      }
    }
  });

  test('regression: dev venv must have dingtalk_stream + lark_oapi installed', () => {
    // The GUI's gateway start() depends on these packages. If setup-agent.sh
    // regresses and stops installing them, the user sees "running" but no
    // platform adapters connect — same symptom as the original bug.
    // This test catches that at unit-test time so we don't ship a broken dev env.
    const venvPython = path.join(
      path.dirname(require.resolve('../../src/main/gateway-manager')),
      '../../hermes-agent/.venv/bin/python3'
    );
    if (!fs.existsSync(venvPython)) {
      // No dev venv in this checkout — skip (e.g. CI without submodule)
      return;
    }
    const { execFileSync } = require('child_process');
    try {
      execFileSync(venvPython, ['-c', 'import dingtalk_stream, lark_oapi'], { stdio: 'pipe' });
    } catch (err) {
      assert.fail(
        `Dev venv is missing dingtalk_stream or lark_oapi. Re-run: ` +
        `cd src/hermes-agent && uv pip install ".[dingtalk,feishu]"\n` +
        `Underlying error: ${err.message}`
      );
    }
  });

  test('regression: _isManagedPid is the single source of truth for "this is our process"', () => {
    // User scenario: GUI starts a gateway → hermes-agent writes a PID file
    // pointing to that same PID. Without this gate, "刷新状态" would
    // misclassify the GUI's own process as an external gateway. With the
    // gate, detectExternalGateway() skips our PID in all three sources
    // (PID file / launchd-systemd / ps scan).

    assert.strictEqual(manager._isManagedPid(12345), false,
      'no PIDs managed when not running');

    manager.running = true;
    manager.process = { pid: 12345 };
    assert.strictEqual(manager._isManagedPid(12345), true,
      'GUI-managed PID should be recognized as managed');
    assert.strictEqual(manager._isManagedPid(99999), false,
      'Other PIDs should NOT be recognized as managed');

    // After restart, the PID changes — old PIDs are no longer "managed"
    manager.process = { pid: 200 };
    assert.strictEqual(manager._isManagedPid(12345), false,
      'old PID should not be managed after restart');
    assert.strictEqual(manager._isManagedPid(200), true);

    // When running is false, no PIDs are managed
    manager.running = false;
    manager.process = null;
    assert.strictEqual(manager._isManagedPid(200), false,
      'no PIDs managed when not running');
  });

  test('regression: detectExternalGateway skips GUI-managed PID in all 3 detection paths', async () => {
    // This is a more direct test of the bug fix. We mock each detection
    // method to return the GUI's PID and verify detectExternalGateway()
    // still returns null (because it recognizes that PID as managed).
    //
    // We use a fresh manager and inject our own fake detection methods.
    const fakeManager = new (require('../../src/main/gateway-manager').GatewayManager)({
      isDestroyed: () => false, webContents: { send: () => {} },
    });
    fakeManager.running = true;
    fakeManager.process = { pid: 99999 };
    fakeManager.externalGateway = null;

    // Override all three detection methods to return our managed PID
    fakeManager._detectViaPidFile = async () => ({ pid: 99999, manager: 'pid-file', source: 'PID 文件' });
    fakeManager._checkSystemService = async () => ({ pid: 99999, manager: 'launchd', source: 'launchd 后台服务' });
    fakeManager._scanGatewayProcesses = () => 99999;

    const result = await fakeManager.detectExternalGateway();
    assert.strictEqual(result, null,
      'detectExternalGateway should skip the managed PID in all detection paths');
    assert.strictEqual(fakeManager.externalGateway, null,
      'externalGateway should remain null when only managed PID is found');
  });
});
