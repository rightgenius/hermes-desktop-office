const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AgentManager,
  ensureExternalSkillsDirInConfig,
  resolveHermesPath,
} = require('../../src/main/agent-manager');

function makeManager() {
  const sent = [];
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => sent.push({ channel, payload }),
    },
  };
  return { manager: new AgentManager(mainWindow), sent };
}

describe('AgentManager bridge events', () => {
  test('marks the process ready only after the bridge reports warmup completion', () => {
    const { manager, sent } = makeManager();
    manager.running = true;
    manager.ready = false;

    manager._handleBridgeMessage({
      type: 'ready',
      startup_ms: 3210,
    });

    assert.strictEqual(manager.ready, true);
    assert.deepStrictEqual(
      sent.filter(({ channel }) => channel === 'agent-status').map(({ payload }) => payload),
      [{ running: true, ready: true }],
    );
    assert.match(
      sent.find(({ channel }) => channel === 'agent-log').payload.message,
      /3210ms/,
    );
  });

  test('forwards session initialization before model generation starts', () => {
    const { manager, sent } = makeManager();

    manager._handleBridgeMessage({
      type: 'initializing',
      session_id: 'session-1',
    });

    assert.deepStrictEqual(sent, [
      {
        channel: 'agent-response',
        payload: {
          event: 'initializing',
          data: '',
          sessionId: 'session-1',
        },
      },
    ]);
  });

  test('startup errors stop the unusable bridge process and clear running state', () => {
    const { manager } = makeManager();
    let killed = false;
    manager.running = true;
    manager.ready = false;
    manager.process = {
      kill: () => {
        killed = true;
      },
    };

    manager._handleBridgeMessage({
      type: 'startup_error',
      message: 'warmup failed',
    });

    assert.strictEqual(killed, true);
    assert.strictEqual(manager.running, false);
    assert.strictEqual(manager.ready, false);
  });

  test('forwards background self-improvement review summaries without completing the turn', () => {
    const { manager, sent } = makeManager();

    manager._handleBridgeMessage({
      type: 'background_review',
      session_id: 'session-1',
      text: '💾 Self-improvement review: office-docx updated',
    });

    assert.deepStrictEqual(sent, [
      {
        channel: 'agent-response',
        payload: {
          event: 'background_review',
          data: '💾 Self-improvement review: office-docx updated',
          sessionId: 'session-1',
        },
      },
      {
        channel: 'agent-log',
        payload: {
          level: 'info',
          message: '💾 Self-improvement review: office-docx updated',
        },
      },
    ]);
    assert.strictEqual(manager.sessionStates.get('session-1'), undefined);
  });

  test('sessionless bridge errors terminate every generating renderer session', () => {
    const { manager, sent } = makeManager();
    manager.sessionStates.set('session-1', { isGenerating: true });
    manager.sessionStates.set('session-2', { isGenerating: false });
    manager.sessionStates.set('session-3', { isGenerating: true });

    manager._handleBridgeMessage({
      type: 'error',
      session_id: '',
      message: 'Invalid JSON',
    });

    assert.strictEqual(manager.sessionStates.get('session-1').isGenerating, false);
    assert.strictEqual(manager.sessionStates.get('session-2').isGenerating, false);
    assert.strictEqual(manager.sessionStates.get('session-3').isGenerating, false);
    assert.deepStrictEqual(
      sent.filter(({ channel }) => channel === 'agent-response').map(({ payload }) => payload),
      [
        { event: 'error', data: 'Invalid JSON', sessionId: 'session-1' },
        { event: 'error', data: 'Invalid JSON', sessionId: 'session-3' },
      ]
    );
  });
});

describe('AgentManager Hermes config updates', () => {
  test('adds an external skills directory without corrupting adjacent YAML sections', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-'));
    const configPath = path.join(home, 'config.yaml');
    fs.writeFileSync(configPath, [
      'model:',
      '  default: test-model',
      'skills:',
      '  external_dirs: []',
      'providers: {}',
      '',
    ].join('\n'));

    const result = ensureExternalSkillsDirInConfig(home, '/tmp/office skills');
    const updated = fs.readFileSync(configPath, 'utf8');

    assert.strictEqual(result.success, true);
    assert.match(updated, /external_dirs:\s*\n\s+- ['"]?\/tmp\/office skills['"]?/);
    assert.match(updated, /^providers: \{\}$/m);
    assert.doesNotMatch(updated, /provi\s+external_dirs/);
  });

  test('backs up and repairs the known malformed external_dirs insertion pattern', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-repair-'));
    const configPath = path.join(home, 'config.yaml');
    fs.writeFileSync(configPath, [
      'model:',
      '  default: test-model',
      'providers: {}',
      'skills:',
      '  external_dirs: []',
      'provi  external_dirs:',
      '    - "/old/office-skills"',
      '- /current/office-skills',
      'ders: {}',
      'plugins:',
      '  enabled: []',
      '',
    ].join('\n'));

    const result = ensureExternalSkillsDirInConfig(home, '/new/office-skills');
    const updated = fs.readFileSync(configPath, 'utf8');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.recovered, true);
    assert.ok(result.backupPath);
    assert.strictEqual(fs.existsSync(result.backupPath), true);
    assert.match(updated, /^providers: \{\}$/m);
    assert.match(updated, /\/old\/office-skills/);
    assert.match(updated, /\/current\/office-skills/);
    assert.match(updated, /\/new\/office-skills/);
    assert.doesNotMatch(updated, /provi\s+external_dirs|^ders:/m);
  });

  test('does not overwrite YAML corruption that does not match the known recovery pattern', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-invalid-'));
    const configPath = path.join(home, 'config.yaml');
    const invalid = 'model:\n  default: test\n- unexpected\n';
    fs.writeFileSync(configPath, invalid);

    const result = ensureExternalSkillsDirInConfig(home, '/new/office-skills');

    assert.strictEqual(result.success, false);
    assert.strictEqual(fs.readFileSync(configPath, 'utf8'), invalid);
  });
});

describe('AgentManager runtime path resolution', () => {
  test('packaged app selects Resources hermes-agent even when the asar path exists', () => {
    const existingPaths = new Set([
      '/app.asar/src/hermes-agent/cli.py',
      '/resources/hermes-agent/cli.py',
    ]);

    const result = resolveHermesPath({
      isPackaged: true,
      devPath: '/app.asar/src/hermes-agent',
      prodPath: '/resources/hermes-agent',
      existsSync: (candidate) => existingPaths.has(candidate),
    });

    assert.deepStrictEqual(result, {
      hermesPath: '/resources/hermes-agent',
      isProduction: true,
    });
  });
});
