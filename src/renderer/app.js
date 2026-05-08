// Hermes Desktop for Office - Main Renderer Script

// ============================
// Navigation
// ============================
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

function showPage(pageName) {
  pages.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  const targetPage = document.getElementById(`page-${pageName}`);
  const targetNav = document.querySelector(`.nav-item[data-page="${pageName}"]`);
  if (targetPage) targetPage.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
}

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (page) showPage(page);
  });
});

// ============================
// Utility
// ============================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateStatus(indicatorId, status, text) {
  const el = document.getElementById(indicatorId);
  if (!el) return;
  el.className = `status-indicator ${status}`;
  el.querySelector('.status-text').textContent = text;
}

// ============================
// Settings Page
// ============================
const gatewayInput = document.getElementById('gateway-url');
const apiTokenInput = document.getElementById('api-token');
const toggleTokenBtn = document.getElementById('toggle-token');
const saveConfigBtn = document.getElementById('save-config');
const testConnectionBtn = document.getElementById('test-connection');

if (toggleTokenBtn) {
  toggleTokenBtn.addEventListener('click', () => {
    apiTokenInput.type = apiTokenInput.type === 'password' ? 'text' : 'password';
  });
}

async function loadConfig() {
  try {
    const config = await window.api.invoke('config-get');
    if (gatewayInput) gatewayInput.value = config.gatewayUrl || '';
    if (apiTokenInput) apiTokenInput.value = config.apiToken || '';
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

if (saveConfigBtn) {
  saveConfigBtn.addEventListener('click', async () => {
    try {
      await window.api.invoke('config-save', {
        gatewayUrl: gatewayInput.value,
        apiToken: apiTokenInput.value,
      });
      saveConfigBtn.textContent = '已保存 ✓';
      setTimeout(() => { saveConfigBtn.textContent = '保存配置'; }, 2000);
    } catch (err) {
      saveConfigBtn.textContent = '保存失败';
      setTimeout(() => { saveConfigBtn.textContent = '保存配置'; }, 2000);
    }
  });
}

if (testConnectionBtn) {
  testConnectionBtn.addEventListener('click', async () => {
    const url = gatewayInput.value.trim();
    const token = apiTokenInput.value.trim();
    if (!url) {
      testConnectionBtn.textContent = '请输入 Gateway URL';
      setTimeout(() => { testConnectionBtn.textContent = '测试连接'; }, 2000);
      return;
    }
    testConnectionBtn.textContent = '测试中...';
    testConnectionBtn.disabled = true;
    try {
      const response = await fetch(url + '/health', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        testConnectionBtn.textContent = '连接成功 ✓';
      } else {
        testConnectionBtn.textContent = `连接失败: ${response.status}`;
      }
    } catch (err) {
      testConnectionBtn.textContent = `连接失败: ${err.message}`;
    }
    setTimeout(() => {
      testConnectionBtn.textContent = '测试连接';
      testConnectionBtn.disabled = false;
    }, 3000);
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

if (sendBtn) {
  sendBtn.addEventListener('click', sendMessage);
}

if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  chatInput.value = '';
  setTimeout(() => {
    addMessage('Agent 暂未连接，请在日志页面启动 Agent 后重试。', 'agent');
  }, 500);
}

// ============================
// Auth Page
// ============================
const authFeishuBtn = document.getElementById('auth-feishu');
const authDingtalkBtn = document.getElementById('auth-dingtalk');
const runDiagBtn = document.getElementById('run-diagnostic');
const diagResult = document.getElementById('diagnostic-result');

function updateAuthStatus(elementId, result) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (result.success) {
    el.innerHTML = `<span class="status-badge auth">已授权: ${result.userName || ''}</span>`;
  } else {
    el.innerHTML = `<span class="status-badge error">授权失败: ${result.error || '未知错误'}</span>`;
  }
}

if (authFeishuBtn) {
  authFeishuBtn.addEventListener('click', async () => {
    authFeishuBtn.disabled = true;
    authFeishuBtn.textContent = '授权中...';
    try {
      const result = await window.api.invoke('auth-feishu');
      updateAuthStatus('feishu-status', result);
      if (result.success) updateStatus('status-feishu', 'success', `飞书: 已授权`);
    } catch (err) {
      updateAuthStatus('feishu-status', { success: false, error: err.message });
    }
    authFeishuBtn.disabled = false;
    authFeishuBtn.textContent = '开始授权';
  });
}

if (authDingtalkBtn) {
  authDingtalkBtn.addEventListener('click', async () => {
    authDingtalkBtn.disabled = true;
    authDingtalkBtn.textContent = '授权中...';
    try {
      const result = await window.api.invoke('auth-dingtalk');
      updateAuthStatus('dingtalk-status', result);
      if (result.success) updateStatus('status-dingtalk', 'success', `钉钉: 已授权`);
    } catch (err) {
      updateAuthStatus('dingtalk-status', { success: false, error: err.message });
    }
    authDingtalkBtn.disabled = false;
    authDingtalkBtn.textContent = '开始授权';
  });
}

if (runDiagBtn) {
  runDiagBtn.addEventListener('click', async () => {
    runDiagBtn.disabled = true;
    runDiagBtn.textContent = '诊断中...';
    diagResult.textContent = '正在运行诊断...';
    try {
      const result = await window.api.invoke('run-diagnostic');
      diagResult.textContent = result.output || result.error;
    } catch (err) {
      diagResult.textContent = `诊断失败: ${err.message}`;
    }
    runDiagBtn.disabled = false;
    runDiagBtn.textContent = '运行诊断';
  });
}

// ============================
// Logs Page
// ============================
const agentStartBtn = document.getElementById('agent-start');
const agentStopBtn = document.getElementById('agent-stop');
const agentRestartBtn = document.getElementById('agent-restart');
const logViewer = document.getElementById('log-viewer');

function appendLog(text) {
  if (!logViewer) return;
  logViewer.textContent += text + '\n';
  logViewer.scrollTop = logViewer.scrollHeight;
}

if (agentStartBtn) {
  agentStartBtn.addEventListener('click', async () => {
    appendLog('[INFO] 启动 Agent...');
    try {
      const config = await window.api.invoke('config-get');
      await window.api.invoke('agent-start', config);
      updateStatus('status-agent', 'success', 'Agent: 运行中');
      appendLog('[INFO] Agent 已启动');
    } catch (err) {
      appendLog(`[ERROR] Agent 启动失败: ${err.message}`);
    }
  });
}

if (agentStopBtn) {
  agentStopBtn.addEventListener('click', async () => {
    appendLog('[INFO] 停止 Agent...');
    try {
      await window.api.invoke('agent-stop');
      updateStatus('status-agent', 'error', 'Agent: 已停止');
      appendLog('[INFO] Agent 已停止');
    } catch (err) {
      appendLog(`[ERROR] Agent 停止失败: ${err.message}`);
    }
  });
}

if (agentRestartBtn) {
  agentRestartBtn.addEventListener('click', async () => {
    appendLog('[INFO] 重启 Agent...');
    try {
      const config = await window.api.invoke('config-get');
      await window.api.invoke('agent-restart', config);
      updateStatus('status-agent', 'success', 'Agent: 运行中');
      appendLog('[INFO] Agent 已重启');
    } catch (err) {
      appendLog(`[ERROR] Agent 重启失败: ${err.message}`);
    }
  });
}

// ============================
// Listen for logs from main process
// ============================
if (window.api) {
  window.api.on('agent-log', (data) => {
    appendLog(`[${data.level}] ${data.message}`);
  });
  window.api.on('agent-status', (data) => {
    updateStatus('status-agent', data.running ? 'success' : 'error',
      `Agent: ${data.running ? '运行中' : '已停止'}`);
  });
}

// ============================
// Init
// ============================
loadConfig();
updateStatus('status-agent', 'error', 'Agent: 未启动');
updateStatus('status-feishu', 'error', '飞书: 未授权');
updateStatus('status-dingtalk', 'error', '钉钉: 未授权');
