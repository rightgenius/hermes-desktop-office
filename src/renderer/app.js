// Hermes Desktop for Office - Main Renderer Script

// ============================
// Navigation
// ============================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => showPage(item.dataset.page));
});

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(`page-${pageName}`);
  const nav = document.querySelector(`.nav-item[data-page="${pageName}"]`);
  if (target) target.classList.add('active');
  if (nav) nav.classList.add('active');
}

// ============================
// Utility
// ============================
function updateStatus(id, status, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `status-indicator ${status}`;
  el.querySelector('.status-text').textContent = text;
}

function setBtnState(btn, text, duration = 2000) {
  btn.textContent = text;
  setTimeout(() => {
    const defaults = { 'save-config': '保存配置', 'test-connection': '测试连接', 'auth-feishu': '开始授权', 'auth-dingtalk': '开始授权', 'run-diagnostic': '运行诊断' };
    btn.textContent = defaults[btn.id] || text;
  }, duration);
}

// ============================
// Settings Page
// ============================
const els = {
  gatewayUrl: document.getElementById('gateway-url'),
  apiToken: document.getElementById('api-token'),
  toggleToken: document.getElementById('toggle-token'),
  saveConfig: document.getElementById('save-config'),
  testConnection: document.getElementById('test-connection'),
  workspacePath: document.getElementById('workspace-path'),
  browseFolder: document.getElementById('browse-folder'),
  autoStart: document.getElementById('auto-start'),
};

if (els.toggleToken) {
  els.toggleToken.addEventListener('click', () => {
    els.apiToken.type = els.apiToken.type === 'password' ? 'text' : 'password';
  });
}

if (els.browseFolder) {
  els.browseFolder.addEventListener('click', async () => {
    try {
      const path = await window.api.configBrowseFolder();
      if (path) {
        els.workspacePath.value = path;
      }
    } catch (err) {
      console.error('Browse folder failed:', err);
    }
  });
}

if (els.saveConfig) {
  els.saveConfig.addEventListener('click', async () => {
    try {
      await window.api.configSave({
        gatewayUrl: els.gatewayUrl.value,
        apiToken: els.apiToken.value,
        workspacePath: els.workspacePath.value,
        autoStart: els.autoStart.checked,
      });
      setBtnState(els.saveConfig, '已保存 ✓');
    } catch (err) {
      setBtnState(els.saveConfig, '保存失败');
    }
  });
}

if (els.testConnection) {
  els.testConnection.addEventListener('click', async () => {
    const url = els.gatewayUrl.value.trim();
    if (!url) { setBtnState(els.testConnection, '请输入 Gateway URL'); return; }
    els.testConnection.textContent = '测试中...';
    els.testConnection.disabled = true;
    try {
      const res = await fetch(url + '/health', {
        headers: { 'Authorization': `Bearer ${els.apiToken.value}` },
        signal: AbortSignal.timeout(5000),
      });
      setBtnState(els.testConnection, res.ok ? '连接成功 ✓' : `失败: ${res.status}`);
    } catch (err) {
      setBtnState(els.testConnection, `失败: ${err.message}`);
    }
    setTimeout(() => { els.testConnection.textContent = '测试连接'; els.testConnection.disabled = false; }, 3000);
  });
}

async function loadConfig() {
  try {
    const config = await window.api.configGet();
    els.gatewayUrl.value = config.gatewayUrl || '';
    els.apiToken.value = config.apiToken || '';
    els.workspacePath.value = config.workspacePath || '';
    els.autoStart.checked = !!config.autoStart;
  } catch (err) { console.error('Load config failed:', err); }
}

// ============================
// Auth Page
// ============================
const authEls = {
  feishuBtn: document.getElementById('auth-feishu'),
  feishuReauth: document.getElementById('reauth-feishu'),
  feishuVersion: document.getElementById('feishu-version'),
  feishuStatus: document.getElementById('feishu-status'),
  feishuUser: document.getElementById('feishu-user'),
  feishuUserRow: document.getElementById('feishu-user-row'),
  dingtalkBtn: document.getElementById('auth-dingtalk'),
  dingtalkReauth: document.getElementById('reauth-dingtalk'),
  dingtalkVersion: document.getElementById('dingtalk-version'),
  dingtalkStatus: document.getElementById('dingtalk-status'),
  dingtalkUser: document.getElementById('dingtalk-user'),
  dingtalkUserRow: document.getElementById('dingtalk-user-row'),
  runDiag: document.getElementById('run-diagnostic'),
  diagResult: document.getElementById('diagnostic-result'),
};

function setAuthState(prefix, authed, userName, version) {
  const statusEl = document.getElementById(`${prefix}-status`);
  const userEl = document.getElementById(`${prefix}-user`);
  const userRowEl = document.getElementById(`${prefix}-user-row`);
  const btnEl = document.getElementById(`auth-${prefix}`);
  const reauthEl = document.getElementById(`reauth-${prefix}`);
  const versionEl = document.getElementById(`${prefix}-version`);

  if (versionEl) versionEl.textContent = version || '-';
  if (authed) {
    statusEl.innerHTML = '<span class="status-badge auth">已授权</span>';
    if (userEl) userEl.textContent = userName || '';
    if (userRowEl) userRowEl.style.display = 'flex';
    if (btnEl) btnEl.style.display = 'none';
    if (reauthEl) reauthEl.style.display = '';
    updateStatus(`status-${prefix}`, 'success', `${prefix === 'feishu' ? '飞书' : '钉钉'}: 已授权`);
  } else {
    statusEl.innerHTML = '<span class="status-badge unauth">未授权</span>';
    if (userRowEl) userRowEl.style.display = 'none';
    if (btnEl) btnEl.style.display = '';
    if (reauthEl) reauthEl.style.display = 'none';
  }
}

async function checkAuthStatus() {
  try {
    const result = await window.api.checkAuthStatus();
    if (result.feishu.authed) {
      setAuthState('feishu', true, result.feishu.userName, result.feishu.version);
    }
    if (result.dingtalk.authed) {
      setAuthState('dingtalk', true, result.dingtalk.userName, result.dingtalk.version);
    }
  } catch (err) { console.error('Check auth failed:', err); }
}

async function doAuth(cli, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = '授权中...请在浏览器中完成操作...';
  try {
    const result = await cli === 'feishu' ? window.api.authFeishu() : window.api.authDingtalk();
    if (result.success) {
      setAuthState(cli, true, result.userName, result.version);
    } else {
      alert(`授权失败: ${result.error}`);
    }
  } catch (err) {
    alert(`授权异常: ${err.message}`);
  }
  btnEl.disabled = false;
  btnEl.textContent = '开始授权';
}

if (authEls.feishuBtn) {
  authEls.feishuBtn.addEventListener('click', () => doAuth('feishu', authEls.feishuBtn));
}
if (authEls.feishuReauth) {
  authEls.feishuReauth.addEventListener('click', () => doAuth('feishu', authEls.feishuReauth));
}
if (authEls.dingtalkBtn) {
  authEls.dingtalkBtn.addEventListener('click', () => doAuth('dingtalk', authEls.dingtalkBtn));
}
if (authEls.dingtalkReauth) {
  authEls.dingtalkReauth.addEventListener('click', () => doAuth('dingtalk', authEls.dingtalkReauth));
}

if (authEls.runDiag) {
  authEls.runDiag.addEventListener('click', async () => {
    authEls.runDiag.disabled = true;
    authEls.runDiag.textContent = '诊断中...';
    authEls.diagResult.style.display = 'block';
    authEls.diagResult.textContent = '正在运行诊断...';
    try {
      const result = await window.api.runDiagnostic();
      authEls.diagResult.textContent = result.output || result.error;
    } catch (err) {
      authEls.diagResult.textContent = `诊断失败: ${err.message}`;
    }
    authEls.runDiag.disabled = false;
    authEls.runDiag.textContent = '运行诊断';
  });
}

// ============================
// Chat Page
// ============================
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-message');
const chatMessages = document.getElementById('chat-messages');

function addMessage(text, sender = 'user') {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  msg.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  chatInput.value = '';
  setTimeout(() => addMessage('Agent 暂未连接，请在日志页面启动 Agent 后重试。', 'agent'), 500);
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

// ============================
// Logs Page
// ============================
const logViewer = document.getElementById('log-viewer');

function appendLog(text) {
  if (!logViewer) return;
  logViewer.textContent += text + '\n';
  logViewer.scrollTop = logViewer.scrollHeight;
}

document.getElementById('clear-logs')?.addEventListener('click', () => { if (logViewer) logViewer.textContent = ''; });

async function agentAction(action) {
  appendLog(`[INFO] ${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'} Agent...`);
  try {
    const config = await window.api.configGet();
    await action === 'start' ? window.api.agentStart(config) : action === 'stop' ? window.api.agentStop() : window.api.agentRestart();
    updateStatus('status-agent', 'success', 'Agent: 运行中');
    appendLog(`[INFO] Agent ${action === 'start' ? '已启动' : action === 'stop' ? '已停止' : '已重启'}`);
  } catch (err) {
    appendLog(`[ERROR] Agent ${action}失败: ${err.message}`);
  }
}

document.getElementById('agent-start')?.addEventListener('click', () => agentAction('start'));
document.getElementById('agent-stop')?.addEventListener('click', () => agentAction('stop'));
document.getElementById('agent-restart')?.addEventListener('click', () => agentAction('restart'));

// ============================
// Listen for events from main process
// ============================
if (window.api) {
  window.api.onAgentLog( (data) => appendLog(`[${data.level}] ${data.message}`));
  window.api.onAgentStatus( (data) => {
    updateStatus('status-agent', data.running ? 'success' : 'error', `Agent: ${data.running ? '运行中' : '已停止'}`);
  });
}

// ============================
// First-Run Wizard
// ============================
async function checkFirstRun() {
  try {
    const isFirst = await window.api.isFirstRun();
    if (isFirst) showWizard();
  } catch (err) { console.error('First run check failed:', err); }
}

function showWizard() {
  const overlay = document.createElement('div');
  overlay.id = 'wizard-overlay';
  overlay.innerHTML = `
    <div class="wizard-modal">
      <div class="wizard-step" data-step="1">
        <h3>欢迎使用 Hermes Desktop</h3>
        <p class="wizard-desc">完成以下步骤即可开始使用</p>
        <div class="form-group">
          <label for="wizard-gateway">Gateway URL</label>
          <input type="text" id="wizard-gateway" placeholder="https://your-gateway-url">
        </div>
        <div class="form-group">
          <label for="wizard-token">API Token</label>
          <input type="password" id="wizard-token" placeholder="输入你的 API Token">
        </div>
        <button class="btn btn-primary wizard-next">下一步</button>
      </div>
      <div class="wizard-step" data-step="2" style="display:none">
        <h3>授权飞书</h3>
        <p class="wizard-desc">点击下方按钮，在浏览器中完成授权</p>
        <button class="btn btn-primary wizard-auth-feishu">开始授权</button>
        <div id="wizard-feishu-status" class="wizard-status"></div>
        <div class="wizard-nav">
          <button class="btn btn-secondary wizard-prev">上一步</button>
          <button class="btn btn-primary wizard-next">下一步</button>
        </div>
      </div>
      <div class="wizard-step" data-step="3" style="display:none">
        <h3>授权钉钉</h3>
        <p class="wizard-desc">点击下方按钮，在浏览器中完成授权</p>
        <button class="btn btn-primary wizard-auth-dingtalk">开始授权</button>
        <div id="wizard-dingtalk-status" class="wizard-status"></div>
        <div class="wizard-nav">
          <button class="btn btn-secondary wizard-prev">上一步</button>
          <button class="btn btn-primary wizard-next">完成</button>
        </div>
      </div>
      <div class="wizard-step" data-step="4" style="display:none">
        <h3>设置完成 🎉</h3>
        <p class="wizard-desc">一切就绪，开始使用吧！</p>
        <button class="btn btn-primary wizard-done">开始使用</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let currentStep = 1;
  const wizardConfig = { gatewayUrl: '', apiToken: '' };

  function goToStep(step) {
    overlay.querySelectorAll('.wizard-step').forEach(s => s.style.display = 'none');
    overlay.querySelector(`.wizard-step[data-step="${step}"]`).style.display = '';
    currentStep = step;
  }

  overlay.querySelector('.wizard-next').addEventListener('click', async () => {
    if (currentStep === 1) {
      wizardConfig.gatewayUrl = document.getElementById('wizard-gateway').value;
      wizardConfig.apiToken = document.getElementById('wizard-token').value;
      await window.api.invoke('config-save', wizardConfig);
      goToStep(2);
    } else if (currentStep === 2) {
      goToStep(3);
    } else if (currentStep === 3) {
      goToStep(4);
    }
  });

  overlay.querySelector('.wizard-prev').addEventListener('click', () => goToStep(currentStep - 1));

  overlay.querySelector('.wizard-auth-feishu').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = '授权中...';
    const statusEl = document.getElementById('wizard-feishu-status');
    try {
      const result = await window.api.authFeishu();
      statusEl.textContent = result.success ? `✓ 已授权: ${result.userName}` : `✗ ${result.error}`;
      if (result.success) setAuthState('feishu', true, result.userName);
    } catch (err) { statusEl.textContent = `✗ ${err.message}`; }
    btn.disabled = false; btn.textContent = '开始授权';
  });

  overlay.querySelector('.wizard-auth-dingtalk').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = '授权中...';
    const statusEl = document.getElementById('wizard-dingtalk-status');
    try {
      const result = await window.api.authDingtalk();
      statusEl.textContent = result.success ? `✓ 已授权: ${result.userName}` : `✗ ${result.error}`;
      if (result.success) setAuthState('dingtalk', true, result.userName);
    } catch (err) { statusEl.textContent = `✗ ${err.message}`; }
    btn.disabled = false; btn.textContent = '开始授权';
  });

  overlay.querySelector('.wizard-done').addEventListener('click', () => {
    overlay.remove();
    checkAuthStatus();
  });
}

// ============================
// Init
// ============================
loadConfig();
checkFirstRun();
updateStatus('status-agent', 'error', 'Agent: 未启动');
