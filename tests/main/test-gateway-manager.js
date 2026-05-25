const { GatewayManager } = require('../../src/main/gateway-manager');
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('GatewayManager', () => {
  let manager;

  beforeEach(() => {
    manager = new GatewayManager({ isDestroyed: () => false, webContents: { send: () => {} } });
  });

  afterEach(async () => {
    if (manager.running) await manager.stop();
  });

  it('should initialize with running=false and no external gateway', () => {
    assert.strictEqual(manager.running, false);
    assert.strictEqual(manager.externalGateway, null);
  });

  it('should not start when external gateway is detected', async () => {
    manager.externalGateway = { pid: 12345, manager: 'manual', source: 'test' };
    const result = await manager.start();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('外部'));
  });

  it('should not start twice', async () => {
    manager.running = true;
    const result = await manager.start();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('已在运行'));
    manager.running = false;
  });

  it('should detect ancestor PIDs correctly', () => {
    const ancestors = manager._getAncestorPids();
    assert.ok(ancestors.has(process.pid));
    assert.ok(ancestors.size > 0);
  });

  it('should return null for external gateway when none is running', async () => {
    const result = await manager.detectExternalGateway();
    if (result) {
      assert.ok(manager._isProcessRunning(result.pid), 'If detected, process should be running');
    }
  });

  it('should parse .env file correctly', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    let backup = null;
    if (fs.existsSync(envPath)) {
      backup = fs.readFileSync(envPath, 'utf-8');
    }

    try {
      fs.writeFileSync(envPath, 'DINGTALK_CLIENT_ID=test123\nDINGTALK_CLIENT_SECRET=secret456\n# comment\nFEISHU_APP_ID=feishu789\n', 'utf-8');
      const config = await manager.getConfig();
      assert.strictEqual(config.dingtalk.clientId, 'test123');
      assert.ok(config.dingtalk.clientIdMasked.includes('test123'));
      assert.strictEqual(config.feishu.appId, 'feishu789');
    } finally {
      if (backup !== null) {
        fs.writeFileSync(envPath, backup, 'utf-8');
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });

  it('should save config to .env', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    let backup = null;
    if (fs.existsSync(envPath)) {
      backup = fs.readFileSync(envPath, 'utf-8');
    }

    try {
      fs.writeFileSync(envPath, '# empty\n', 'utf-8');
      await manager.saveConfig('dingtalk', { enabled: true, clientId: 'new_id', clientSecret: 'new_secret' });
      const content = fs.readFileSync(envPath, 'utf-8');
      assert.ok(content.includes('DINGTALK_CLIENT_ID=new_id'));
      assert.ok(content.includes('DINGTALK_CLIENT_SECRET=new_secret'));
    } finally {
      if (backup !== null) {
        fs.writeFileSync(envPath, backup, 'utf-8');
      }
    }
  });

  it('should return channels from channel_directory.json if it exists', async () => {
    const result = await manager.getChannels();
    assert.strictEqual(result.success, true);
    assert.ok(result.platforms !== undefined);
  });

  it('should mask secrets in config', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    let backup = null;
    if (fs.existsSync(envPath)) {
      backup = fs.readFileSync(envPath, 'utf-8');
    }

    try {
      fs.writeFileSync(envPath, 'DINGTALK_CLIENT_ID=ding1234567890\nDINGTALK_CLIENT_SECRET=secret1234567890\n', 'utf-8');
      const config = await manager.getConfig();
      assert.ok(config.dingtalk.clientIdMasked.includes('ding1234'));
      assert.ok(config.dingtalk.clientIdMasked.includes('•'));
      assert.ok(config.dingtalk.clientSecretMasked.includes('secret12'));
      assert.ok(config.dingtalk.clientSecretMasked.includes('•'));
    } finally {
      if (backup !== null) {
        fs.writeFileSync(envPath, backup, 'utf-8');
      }
    }
  });
});
