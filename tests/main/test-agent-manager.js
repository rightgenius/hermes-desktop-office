const { test, describe } = require('node:test');
const assert = require('node:assert');
const { AgentManager } = require('../../src/main/agent-manager');

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
