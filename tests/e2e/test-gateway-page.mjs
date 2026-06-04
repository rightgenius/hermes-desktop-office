import { _electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(os.tmpdir(), 'hermes-gateway-e2e');
const HERMES_HOME = path.join(TEST_DIR, '.hermes');

function setupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(HERMES_HOME, { recursive: true });
  fs.writeFileSync(path.join(HERMES_HOME, '.env'), '# test env\n', 'utf-8');
  fs.writeFileSync(path.join(HERMES_HOME, 'config.yaml'), '# test config\n', 'utf-8');
}

function cleanupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function runE2ETests() {
  console.log('=== Gateway Page E2E Tests ===\n');

  setupTestEnv();

  let app;
  let mainWindow;

  try {
    console.log('1. Launching Electron app...');
    app = await _electron.launch({
      args: ['.'],
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, HOME: TEST_DIR, HERMES_HOME },
    });

    mainWindow = await app.firstWindow();
    await mainWindow.waitForLoadState();
    console.log('   ✓ App launched\n');

    console.log('2. Testing Gateway page accessibility...');
    await mainWindow.click('[data-page="gateway"]');
    await mainWindow.waitForSelector('#page-gateway.active');
    const pageTitle = await mainWindow.textContent('#page-gateway h2');
    assert.strictEqual(pageTitle, 'Gateway', 'Page title should be "Gateway"');
    console.log('   ✓ Gateway page accessible\n');

    console.log('3. Testing initial Gateway status...');
    const badge = await mainWindow.textContent('#gateway-status-badge');
    const statusText = await mainWindow.textContent('#gateway-status-text');
    // May detect external gateway if user has one running
    assert.ok(
      badge.includes('未启动') || badge.includes('运行中') || badge.includes('外部') || badge.includes('终端') || badge.includes('launchd') || badge.includes('systemd'),
      `Expected status badge text, got "${badge}"`
    );
    // Status text should show clear "运行中" or "未启动"
    assert.ok(
      statusText.includes('运行中') || statusText.includes('未启动'),
      `Expected clear status text, got "${statusText}"`
    );
    console.log(`   ✓ Initial status: ${badge}, text: ${statusText}\n`);

    console.log('4. Testing platform config fields...');
    const dingtalkSection = await mainWindow.$('#gateway-dingtalk-section');
    const feishuSection = await mainWindow.$('#gateway-feishu-section');
    assert.ok(dingtalkSection, 'DingTalk section should exist');
    assert.ok(feishuSection, 'Feishu section should exist');

    const clientIdInput = await mainWindow.$('#dingtalk-client-id');
    const appIdInput = await mainWindow.$('#feishu-app-id');
    assert.ok(clientIdInput, 'DingTalk client ID input should exist');
    assert.ok(appIdInput, 'Feishu app ID input should exist');
    console.log('   ✓ Platform config fields exist\n');

    console.log('5. Testing guide banners...');
    const dingtalkLink = await mainWindow.$('#gateway-dingtalk-section .gateway-guide-link');
    const feishuLink = await mainWindow.$('#gateway-feishu-section .gateway-guide-link');
    assert.ok(dingtalkLink, 'DingTalk guide link should exist');
    assert.ok(feishuLink, 'Feishu guide link should exist');

    const dingtalkLinkHref = await dingtalkLink.getAttribute('href');
    const feishuLinkHref = await feishuLink.getAttribute('href');
    assert.strictEqual(dingtalkLinkHref, 'https://open-dev.dingtalk.com/');
    assert.strictEqual(feishuLinkHref, 'https://open.feishu.cn/app');
    console.log('   ✓ Guide banners with correct links\n');

    console.log('6. Testing channel list empty state...');
    const channelList = await mainWindow.textContent('#gateway-channels-list');
    assert.ok(channelList.includes('暂无 Channel'), 'Channel list should show empty state');
    console.log('   ✓ Channel list empty state correct\n');

    console.log('7. Testing log viewer...');
    const logViewer = await mainWindow.$('#gateway-log-viewer');
    assert.ok(logViewer, 'Log viewer should exist');
    console.log('   ✓ Log viewer exists\n');

    console.log('8. Testing button visibility...');
    const startBtn = await mainWindow.$('#gateway-start-btn');
    const stopBtn = await mainWindow.$('#gateway-stop-btn');
    const restartBtn = await mainWindow.$('#gateway-restart-btn');
    const restartExternalBtn = await mainWindow.$('#gateway-restart-external-btn');
    const takeoverBtn = await mainWindow.$('#gateway-takeover-btn');
    const recheckBtn = await mainWindow.$('#gateway-recheck-btn');
    const startVisible = await startBtn.isVisible();
    const stopVisible = await stopBtn.isVisible();
    const restartVisible = restartBtn ? await restartBtn.isVisible() : false;
    const restartExternalVisible = restartExternalBtn ? await restartExternalBtn.isVisible() : false;
    const takeoverVisible = takeoverBtn ? await takeoverBtn.isVisible() : false;
    const recheckVisible = recheckBtn ? await recheckBtn.isVisible() : false;
    // If external gateway detected (terminal, launchd, systemd, etc.), show restart-external + takeover + recheck
    const isExternal = badge.includes('终端') || badge.includes('launchd') || badge.includes('systemd') || badge.includes('外部') || badge.includes('PID');
    if (isExternal) {
      assert.ok(!startVisible, 'Start button should be hidden for external gateway');
      assert.ok(!stopVisible, 'Stop button should be hidden for external gateway');
      assert.ok(restartExternalVisible, 'Restart-external button should be visible for external gateway');
      assert.ok(takeoverVisible, 'Takeover button should be visible for external gateway');
      assert.ok(recheckVisible, 'Recheck button should be visible for external gateway');
    } else {
      assert.ok(startVisible, 'Start button should be visible when not running');
      assert.ok(!stopVisible, 'Stop button should be hidden when not running');
      assert.ok(!restartExternalVisible, 'Restart-external button should be hidden when not running');
      assert.ok(!takeoverVisible, 'Takeover button should be hidden when not running');
      assert.ok(recheckVisible, 'Recheck button should always be visible');
    }
    console.log(`   ✓ Button visibility correct (external: ${isExternal})\n`);

    console.log('9. Testing QR auth buttons exist...');
    const dtQrBtn = await mainWindow.$('#dingtalk-qr-auth-btn');
    const fsQrBtn = await mainWindow.$('#feishu-qr-auth-btn');
    assert.ok(dtQrBtn, 'DingTalk QR auth button should exist');
    assert.ok(fsQrBtn, 'Feishu QR auth button should exist');
    console.log('   ✓ QR auth buttons exist\n');

    console.log('10. Testing Gateway status dot in titlebar...');
    const gatewayDot = await mainWindow.$('#status-gateway-dot');
    assert.ok(gatewayDot, 'Gateway status dot should exist in titlebar');
    console.log('   ✓ Gateway status dot exists\n');

    console.log('11. Testing card width is responsive...');
    const statusCard = await mainWindow.$('#gateway-status-card');
    const cardBox = await statusCard.boundingBox();
    const pageBox = await mainWindow.$('#page-gateway');
    const pageBoundingBox = await pageBox.boundingBox();
    // Card should take most of the page width (allowing for padding)
    assert.ok(cardBox.width > pageBoundingBox.width * 0.8, `Card width ${cardBox.width} should be > 80% of page width ${pageBoundingBox.width}`);
    console.log(`   ✓ Card width is responsive (${cardBox.width}px / ${pageBoundingBox.width}px)\n`);

    console.log('12. Testing secret configured hint...');
    // The hint element should exist in the DOM (even if hidden when no secret)
    const dtSecretParent = await mainWindow.$('#dingtalk-client-secret');
    const hintContainer = await dtSecretParent.evaluateHandle(el => el.parentElement.parentElement);
    const hintElements = await hintContainer.$$('.secret-configured-hint');
    assert.ok(hintElements.length > 0, 'Secret hint element should exist in DOM');
    console.log('   ✓ Secret configured hint exists\n');

    console.log('13. Testing recheck button refreshes status...');
    if (recheckBtn) {
      const beforeText = await mainWindow.textContent('#gateway-status-badge');
      await recheckBtn.click();
      await new Promise(r => setTimeout(r, 1500));
      const afterText = await mainWindow.textContent('#gateway-status-badge');
      assert.ok(beforeText.length > 0 && afterText.length > 0, 'Status should still have text after recheck');
      console.log(`   ✓ Recheck button works (badge: ${beforeText.trim()} -> ${afterText.trim()})\n`);
    }

    console.log('=== All E2E tests passed! ===\n');

  } catch (err) {
    console.error('E2E test failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
    cleanupTestEnv();
  }
}

runE2ETests();
