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
