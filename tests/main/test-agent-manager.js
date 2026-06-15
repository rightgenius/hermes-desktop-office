const { test, describe } = require('node:test');
const assert = require('node:assert');
const { AgentManager, resolveHermesPath } = require('../../src/main/agent-manager');

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
  test('publishes response and log events internally without changing renderer IPC payloads', () => {
    const { manager, sent } = makeManager();
    const responses = [];
    const logs = [];

    manager.on('response', (event) => responses.push(event));
    manager.on('log', (event) => logs.push(event));

    manager.emitResponse('chunk', 'hello', 'cron-session');
    manager.emitLog('warn', 'console output');

    assert.strictEqual(responses.length, 1);
    assert.deepStrictEqual(
      {
        event: responses[0].event,
        data: responses[0].data,
        sessionId: responses[0].sessionId,
      },
      { event: 'chunk', data: 'hello', sessionId: 'cron-session' }
    );
    assert.match(responses[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(
      {
        level: logs[0].level,
        message: logs[0].message,
      },
      { level: 'warn', message: 'console output' }
    );
    assert.match(logs[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);

    assert.deepStrictEqual(sent, [
      {
        channel: 'agent-response',
        payload: { event: 'chunk', data: 'hello', sessionId: 'cron-session' },
      },
      {
        channel: 'agent-log',
        payload: { level: 'warn', message: 'console output' },
      },
    ]);
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
