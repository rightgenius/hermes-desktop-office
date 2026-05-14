// Hermes Desktop for Office - Main Renderer Script

// ============================
// Permission Scope Descriptions
// ============================
const SCOPE_DESCRIPTIONS = {
  'approval:instance:read': '读取审批实例',
  'approval:instance:write': '创建/修改审批实例',
  'approval:task:read': '读取审批任务',
  'approval:task:write': '处理审批任务',
  'auth:user.id:read': '读取用户身份',
  'base:app:create': '创建多维表格应用',
  'base:app:read': '读取多维表格应用',
  'base:app:update': '更新多维表格应用',
  'base:app:copy': '复制多维表格应用',
  'base:app:delete': '删除多维表格应用',
  'base:table:create': '创建数据表',
  'base:table:read': '读取数据表',
  'base:table:update': '更新数据表',
  'base:table:delete': '删除数据表',
  'base:record:create': '创建记录',
  'base:record:read': '读取记录',
  'base:record:update': '更新记录',
  'base:record:delete': '删除记录',
  'base:view:read': '读取视图',
  'base:view:write_only': '管理视图',
  'base:field:create': '创建字段',
  'base:field:read': '读取字段',
  'base:field:update': '更新字段',
  'base:field:delete': '删除字段',
  'base:dashboard:create': '创建仪表盘',
  'base:dashboard:read': '读取仪表盘',
  'base:dashboard:update': '更新仪表盘',
  'base:dashboard:delete': '删除仪表盘',
  'base:form:create': '创建表单',
  'base:form:read': '读取表单',
  'base:form:update': '更新表单',
  'base:form:delete': '删除表单',
  'base:workflow:create': '创建工作流',
  'base:workflow:read': '读取工作流',
  'base:workflow:update': '更新工作流',
  'base:workflow:delete': '删除工作流',
  'base:role:create': '创建角色',
  'base:role:read': '读取角色',
  'base:role:update': '更新角色',
  'base:role:delete': '删除角色',
  'base:history:read': '读取操作历史',
  'base:workspace:list': '列出工作区',
  'board:whiteboard:node:create': '创建白板节点',
  'board:whiteboard:node:read': '读取白板节点',
  'board:whiteboard:node:update': '更新白板节点',
  'board:whiteboard:node:delete': '删除白板节点',
  'calendar:calendar:create': '创建日历',
  'calendar:calendar:read': '读取日历',
  'calendar:calendar:update': '更新日历',
  'calendar:calendar:delete': '删除日历',
  'calendar:calendar.event:create': '创建日程',
  'calendar:calendar.event:read': '读取日程',
  'calendar:calendar.event:update': '更新日程',
  'calendar:calendar.event:delete': '删除日程',
  'calendar:calendar.free_busy:read': '读取忙闲状态',
  'contact:user.base:readonly': '读取用户基本信息',
  'contact:user.basic_profile:readonly': '读取用户详细资料',
  'contact:user:search': '搜索用户',
  'docs:document:import': '导入文档',
  'docs:document:export': '导出文档',
  'docs:document:copy': '复制文档',
  'docs:document.content:read': '读取文档内容',
  'docs:document.media:download': '下载文档附件',
  'docs:document.media:upload': '上传文档附件',
  'docs:document.comment:read': '读取文档评论',
  'docs:document.comment:create': '创建文档评论',
  'docs:document.comment:update': '更新文档评论',
  'docs:document.comment:delete': '删除文档评论',
  'docs:document.comment:write_only': '管理文档评论',
  'docs:event:subscribe': '订阅文档事件',
  'docs:permission.member:create': '添加文档成员',
  'docs:permission.member:auth': '管理文档权限',
  'docs:permission.member:apply': '申请文档权限',
  'docs:permission.member:transfer': '转移文档权限',
  'docx:document:create': '创建新版文档',
  'docx:document:readonly': '只读新版文档',
  'docx:document:write_only': '编辑新版文档',
  'drive:file:upload': '上传文件',
  'drive:file:download': '下载文件',
  'drive:file:view_record:readonly': '读取文件查看记录',
  'drive:drive.metadata:readonly': '读取云空间元数据',
  'im:chat:create_by_user': '创建群组',
  'im:chat:read': '读取群组信息',
  'im:chat:update': '更新群组信息',
  'im:chat.members:read': '读取群组成员',
  'im:chat.members:write_only': '管理群组成员',
  'im:message': '发送消息',
  'im:message.send_as_user': '代用户发消息',
  'im:message:readonly': '读取消息',
  'im:message:recall': '撤回消息',
  'im:message.p2p_msg:get_as_user': '读取单聊消息',
  'im:message.group_msg:get_as_user': '读取群聊消息',
  'im:message.pins:read': '读取消息置顶',
  'im:message.pins:write_only': '管理消息置顶',
  'im:message.reactions:read': '读取消息回应',
  'im:message.reactions:write_only': '发送消息回应',
  'mail:event': '邮件事件订阅',
  'mail:user_mailbox:readonly': '只读邮箱',
  'mail:user_mailbox.message:readonly': '只读邮件',
  'mail:user_mailbox.message:modify': '修改邮件',
  'mail:user_mailbox.message.subject:read': '读取邮件主题',
  'mail:user_mailbox.message.body:read': '读取邮件正文',
  'mail:user_mailbox.message.address:read': '读取邮件地址',
  'mail:user_mailbox.mail_contact:read': '读取邮件联系人',
  'mail:user_mailbox.mail_contact:write': '管理邮件联系人',
  'markdown:markdown:read': '读取 Markdown',
  'markdown:markdown:write': '编辑 Markdown',
  'minutes:minutes.basic:read': '读取妙记基础信息',
  'minutes:minutes.media:export': '导出妙记媒体',
  'minutes:minutes.search:read': '搜索妙记',
  'minutes:minutes.upload:write': '上传妙记',
  'okr:okr.content:readonly': '只读 OKR 内容',
  'okr:okr.content:writeonly': '编辑 OKR 内容',
  'okr:okr.period:readonly': '读取 OKR 周期',
  'okr:okr.progress:readonly': '读取 OKR 进展',
  'okr:okr.progress:writeonly': '编辑 OKR 进展',
  'okr:okr.progress:delete': '删除 OKR 进展',
  'okr:okr.progress.file:upload': '上传 OKR 进展附件',
  'okr:okr.setting:read': '读取 OKR 设置',
  'search:docs:read': '搜索文档',
  'search:message': '搜索消息',
  'sheets:spreadsheet:create': '创建电子表格',
  'sheets:spreadsheet:read': '读取电子表格',
  'sheets:spreadsheet:write_only': '编辑电子表格',
  'sheets:spreadsheet.meta:read': '读取表格元数据',
  'sheets:spreadsheet.meta:write_only': '管理表格元数据',
  'slides:presentation:create': '创建幻灯片',
  'slides:presentation:read': '读取幻灯片',
  'slides:presentation:write_only': '编辑幻灯片',
  'slides:presentation:update': '更新幻灯片',
  'space:document:retrieve': '获取空间文档',
  'space:document:move': '移动空间文档',
  'space:document:delete': '删除空间文档',
  'space:document:shortcut': '创建文档快捷方式',
  'space:folder:create': '创建空间文件夹',
  'task:task:read': '读取任务',
  'task:task:write': '创建/更新任务',
  'task:tasklist:read': '读取任务列表',
  'task:tasklist:write': '管理任务列表',
  'task:comment:write': '编写任务评论',
  'vc:meeting.meetingevent:read': '读取会议事件',
  'vc:meeting.search:read': '搜索会议',
  'vc:note:read': '读取会议笔记',
  'vc:record:readonly': '只读会议录制',
  'wiki:wiki:readonly': '只读知识库',
  'wiki:space:create': '创建知识空间',
  'wiki:space:read': '读取知识空间',
  'wiki:space:write_only': '管理知识空间',
  'wiki:space:retrieve': '获取知识空间',
  'wiki:node:create': '创建知识节点',
  'wiki:node:read': '读取知识节点',
  'wiki:node:copy': '复制知识节点',
  'wiki:node:move': '移动知识节点',
  'wiki:node:update': '更新知识节点',
  'wiki:node:retrieve': '获取知识节点',
  'wiki:member:create': '添加知识成员',
  'wiki:member:retrieve': '获取知识成员',
  'wiki:member:update': '更新知识成员',
  'offline_access': '离线访问',
};

function getScopeDescription(scope) {
  return SCOPE_DESCRIPTIONS[scope] || scope;
}

// ============================
// Navigation
// ============================
document.querySelectorAll('.rail-btn').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

document.querySelectorAll('.sidebar-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const cardIndex = item.dataset.card;
    if (!cardIndex) return;
    const settingsPage = document.getElementById('page-settings');
    if (settingsPage && !settingsPage.classList.contains('active')) showPage('settings');
    const cards = settingsPage?.querySelectorAll('.card');
    if (cards && cards[cardIndex]) {
      cards[cardIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
      cards.forEach(c => c.classList.remove('highlight'));
      cards[cardIndex].classList.add('highlight');
      setTimeout(() => cards[cardIndex].classList.remove('highlight'), 2000);
    }
  });
});

// Workspace toggle
document.getElementById('workspace-toggle')?.addEventListener('click', () => {
  const header = document.getElementById('workspace-toggle');
  const tree = document.getElementById('workspace-tree');
  header.classList.toggle('collapsed');
  tree.classList.toggle('collapsed');
});

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.rail-btn').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(`page-${pageName}`);
  const nav = document.querySelector(`.rail-btn[data-page="${pageName}"]`);
  if (target) target.classList.add('active');
  if (nav) nav.classList.add('active');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key >= '1' && e.key <= '3') {
    e.preventDefault();
    const pages = ['chat', 'settings', 'logs'];
    showPage(pages[parseInt(e.key) - 1]);
  }
});

// ============================
// Utility
// ============================
function updateStatus(id, status) {
  const dotEl = document.getElementById(`${id}-dot`);
  if (dotEl) {
    dotEl.className = 'status-dot';
    if (status === 'success') dotEl.classList.add('success');
  }
  // Update titlebar agent status text
  if (id === 'status-agent') {
    const titleStatus = document.getElementById('titlebar-agent-status');
    if (titleStatus) {
      titleStatus.textContent = status === 'success' ? '运行中' : '未启动';
      titleStatus.style.color = status === 'success' ? 'var(--success)' : 'var(--text-primary)';
    }
  }
}

function setBtnState(btn, text, duration = 2000) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, duration);
}

// ============================
// Settings Page
// ============================
const els = {
  provider: document.getElementById('provider'),
  apiKey: document.getElementById('api-key'),
  baseUrl: document.getElementById('base-url'),
  model: document.getElementById('model'),
  workspacePath: document.getElementById('workspace-path'),
  autoStart: document.getElementById('auto-start'),
  saveConfig: document.getElementById('save-config'),
  runSetupWizard: document.getElementById('run-setup-wizard'),
  toggleApiKey: document.getElementById('toggle-api-key'),
  browseFolder: document.getElementById('browse-folder'),
  checkConfig: document.getElementById('check-config'),
  configStatus: document.getElementById('config-status'),
  apiKeyGroup: document.getElementById('api-key-group'),
  baseUrlGroup: document.getElementById('base-url-group'),
  apiKeyHint: document.getElementById('api-key-hint'),
};

// Provider to base_url mapping
const PROVIDER_URLS = {
  'auto': '',
  'anthropic': 'https://api.anthropic.com',
  'openrouter': 'https://openrouter.ai/api/v1',
  'gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'openai': 'https://api.openai.com/v1',
  'deepseek': 'https://api.deepseek.com',
  'zhipuai': 'https://open.bigmodel.cn/api/paas/v4',
  'moonshot': 'https://api.moonshot.cn/v1',
  'minimax': 'https://api.minimax.chat/v1',
  'custom': ''
};

function updateProviderUI() {
  const provider = els.provider.value;
  const hints = {
    'auto': '自动检测已配置的 API Key',
    'anthropic': '需要 ANTHROPIC_API_KEY',
    'openrouter': '需要 OPENROUTER_API_KEY',
    'nous': '需要通过 hermes login 命令授权',
    'gemini': '需要 GOOGLE_API_KEY 或 GEMINI_API_KEY',
    'openai': '需要 OPENAI_API_KEY',
    'deepseek': '需要 DEEPSEEK_API_KEY',
    'zhipuai': '需要 GLM_API_KEY',
    'moonshot': '需要 KIMI_API_KEY',
    'minimax': '需要 MINIMAX_API_KEY',
    'custom': '需要自定义 API Key 和端点 URL',
  };
  
  els.apiKeyHint.textContent = hints[provider] || '';
  
  // Auto-fill base_url for known providers
  if (PROVIDER_URLS[provider]) {
    els.baseUrl.value = PROVIDER_URLS[provider];
  }
  
  if (provider === 'custom') {
    els.baseUrlGroup.style.display = 'block';
  } else {
    els.baseUrlGroup.style.display = 'none';
  }
}

if (els.provider) {
  els.provider.addEventListener('change', updateProviderUI);
}

if (els.toggleApiKey) {
  els.toggleApiKey.addEventListener('click', () => {
    const input = els.apiKey;
    input.type = input.type === 'password' ? 'text' : 'password';
    els.toggleApiKey.textContent = input.type === 'password' ? '👁' : '👁‍🗨';
  });
}

if (els.browseFolder) {
  els.browseFolder.addEventListener('click', async () => {
    try {
      const path = await window.api.configBrowseFolder();
      if (path) els.workspacePath.value = path;
    } catch (err) {
      console.error('Browse folder failed:', err);
      alert('选择目录失败: ' + err.message);
    }
  });
}

if (els.saveConfig) {
  els.saveConfig.addEventListener('click', async () => {
    try {
      setBtnState(els.saveConfig, '保存中...');
      await window.api.configSave({
        provider: els.provider.value,
        apiKey: els.apiKey.value,
        baseUrl: els.baseUrl.value,
        model: els.model.value,
        workspacePath: els.workspacePath.value,
        autoStart: els.autoStart.checked,
      });
      setBtnState(els.saveConfig, '已保存 ✓');
    } catch (err) {
      setBtnState(els.saveConfig, '保存失败: ' + err.message);
    }
  });
}

async function loadConfig() {
  try {
    const config = await window.api.configGet();
    els.provider.value = config.provider || 'auto';
    els.apiKey.value = config.apiKey || '';
    els.baseUrl.value = config.baseUrl || '';
    els.model.value = config.model || '';
    els.workspacePath.value = config.workspacePath || '';
    els.autoStart.checked = config.autoStart !== false;
    updateProviderUI();
  } catch (err) { console.error('Load config failed:', err); }
}

// Test API connection
async function testApiConnection() {
  const provider = els.provider.value;
  let baseUrl = els.baseUrl.value.trim();
  // Auto-fill from provider if base_url is empty
  if (!baseUrl && PROVIDER_URLS[provider]) {
    baseUrl = PROVIDER_URLS[provider];
  }
  if (!baseUrl) {
    alert('请先选择服务商或填写自定义端点 URL');
    return;
  }
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    alert('请先填写 API Key');
    return;
  }
  const model = els.model.value.trim() || 'gpt-4o-mini';

  try {
    const result = await window.api.testApiConnection({ baseUrl, apiKey, model });
    if (result.success) {
      alert(`API 连接成功！\n\n模型: ${result.model || '未知'}\n响应: ${result.response || '(无内容)'}\n\n原始响应 (前500字符):\n${result.raw || ''}`);
    } else {
      let msg = `API 连接失败\n\n`;
      if (result.statusCode) {
        msg += `HTTP 状态: ${result.statusCode} ${result.statusMessage}\n\n`;
      }
      if (result.code) {
        msg += `错误代码: ${result.code}\n\n`;
      }
      msg += `错误详情:\n${result.error || '未知错误'}`;
      if (result.headers && Object.keys(result.headers).length) {
        msg += `\n\n响应头:\n${JSON.stringify(result.headers, null, 2)}`;
      }
      alert(msg);
    }
  } catch (err) {
    alert(`API 连接异常: ${err.message}\n\n堆栈:\n${err.stack || ''}`);
  }
}

// Try starting agent and report result
async function tryStartAgent() {
  try {
    const result = await window.api.tryStartAgent();
    if (result.success) {
      let msg = `✅ Agent 启动成功\n\n`;
      if (result.pid) msg += `进程 ID: ${result.pid}\n`;
      msg += `\nAgent 已在后台运行，可以切换到对话页面开始使用。`;
      alert(msg);
      // Update status in titlebar
      updateStatus('status-agent', 'success');
    } else {
      let msg = `❌ Agent 启动失败\n\n`;
      msg += `错误: ${result.message || '未知错误'}\n`;
      if (result.details) msg += `详情: ${result.details}\n`;
      msg += `\n请检查:\n`;
      msg += `1. hermes-agent submodule 是否正确初始化\n`;
      msg += `2. ~/.hermes/.env 中 API Key 是否配置正确\n`;
      msg += `3. 日志页面查看完整日志`;
      alert(msg);
      updateStatus('status-agent', 'error');
    }
  } catch (err) {
    alert(`启动 Agent 异常: ${err.message}\n\n堆栈:\n${err.stack || ''}`);
    updateStatus('status-agent', 'error');
  }
}

document.getElementById('try-start-agent')?.addEventListener('click', () => tryStartAgent());

// ============================
// Auth Page
// ============================
function setAuthState(prefix, authed, userName, version) {
  const statusBadge = document.getElementById(`${prefix}-status-badge`);
  const userEl = document.getElementById(`${prefix}-user`);
  const versionEl = document.getElementById(`${prefix}-version`);
  const btnEl = document.getElementById(`auth-${prefix}`);
  const reauthEl = document.getElementById(`reauth-${prefix}`);
  const refreshEl = document.getElementById(`refresh-${prefix}-perms`);
  const permCountEl = document.getElementById(`${prefix}-perm-count`);

  if (versionEl) versionEl.textContent = version ? `v${version}` : 'v-';
  if (userEl) userEl.textContent = userName || '未登录';

  if (authed) {
    if (statusBadge) {
      statusBadge.className = 'status-badge auth';
      statusBadge.textContent = '已授权';
    }
    if (btnEl) btnEl.style.display = 'none';
    if (reauthEl) reauthEl.style.display = '';
    if (refreshEl) refreshEl.style.display = '';
    updateStatus(`status-${prefix}`, 'success');
  } else {
    if (statusBadge) {
      statusBadge.className = 'status-badge unauth';
      statusBadge.textContent = '未授权';
    }
    if (btnEl) btnEl.style.display = '';
    if (reauthEl) reauthEl.style.display = 'none';
    if (refreshEl) refreshEl.style.display = 'none';
    if (permCountEl) permCountEl.textContent = '0 项权限';
  }
}

// Permissions state per CLI
const permissionsState = {
  feishu: { permissions: [], total: 0, page: 1, pageSize: 5, search: '' },
  dingtalk: { permissions: [], total: 0, page: 1, pageSize: 5, search: '' },
};

async function loadPermissions(cli, page = 1, search = '') {
  const state = permissionsState[cli];
  state.page = page;
  state.search = search;

  try {
    const result = await window.api.getAuthPermissions({ cli, page, pageSize: state.pageSize, search });
    if (result.success) {
      state.permissions = result.permissions;
      state.total = result.total;
      renderPermissions(cli);
      const countEl = document.getElementById(`${cli}-perm-count`);
      if (countEl) countEl.textContent = `${result.total} 项权限`;
    } else {
      const bodyEl = document.getElementById(`${cli}-perm-body`);
      if (bodyEl) bodyEl.innerHTML = `<div class="permissions-empty">加载失败: ${result.error}</div>`;
    }
  } catch (err) {
    const bodyEl = document.getElementById(`${cli}-perm-body`);
    if (bodyEl) bodyEl.innerHTML = `<div class="permissions-empty">加载异常: ${err.message}</div>`;
  }
}

function renderPermissions(cli) {
  const state = permissionsState[cli];
  const bodyEl = document.getElementById(`${cli}-perm-body`);
  const infoEl = document.getElementById(`${cli}-perm-info`);
  const buttonsEl = document.getElementById(`${cli}-perm-buttons`);

  if (!bodyEl) return;

  if (state.permissions.length === 0) {
    bodyEl.innerHTML = `<div class="permissions-empty">${state.search ? '未找到匹配的权限' : '暂无权限数据'}</div>`;
  } else {
    bodyEl.innerHTML = state.permissions.map(p => {
      const statusClass = p.status === 'granted' ? 'permission-granted' : 'permission-revoked';
      const statusText = p.status === 'granted' ? '✓ 已授权' : '✗ 未授权';
      const desc = getScopeDescription(p.scope || p.name || '');
      return `<div class="permissions-table-row">
        <span class="perm-col-name" title="${escapeHtml(p.name || '')}">${escapeHtml(p.name || '')}</span>
        <span class="perm-col-desc" title="${escapeHtml(desc)}">${escapeHtml(desc)}</span>
        <span class="perm-col-status ${statusClass}">${statusText}</span>
      </div>`;
    }).join('');
  }

  if (infoEl) {
    const totalPages = Math.ceil(state.total / state.pageSize) || 1;
    const start = (state.page - 1) * state.pageSize + 1;
    const end = Math.min(state.page * state.pageSize, state.total);
    infoEl.textContent = state.total > 0 ? `显示 ${start}-${end} / 共 ${state.total} 项` : '';
  }

  if (buttonsEl) {
    const totalPages = Math.ceil(state.total / state.pageSize) || 1;
    if (totalPages <= 1) {
      buttonsEl.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button class="pagination-btn" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>‹</button>`;

    let startPage = Math.max(1, state.page - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="pagination-btn ${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    html += `<button class="pagination-btn" data-page="${state.page + 1}" ${state.page >= totalPages ? 'disabled' : ''}>›</button>`;
    buttonsEl.innerHTML = html;

    if (!buttonsEl._delegateSet) {
      buttonsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (!btn || btn.disabled) return;
        const p = parseInt(btn.dataset.page);
        const state = permissionsState[cli];
        const totalPages = Math.ceil(state.total / state.pageSize) || 1;
        if (p >= 1 && p <= totalPages) {
          loadPermissions(cli, p, state.search);
        }
      });
      buttonsEl._delegateSet = true;
    }
  }
}

function setupPermissionsSearch(cli) {
  const searchInput = document.getElementById(`${cli}-perm-search`);
  if (!searchInput) return;

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadPermissions(cli, 1, searchInput.value.trim());
    }, 300);
  });
}

async function checkAuthStatus() {
  try {
    const result = await window.api.checkAuthStatus();
    if (result.feishu.authed) {
      setAuthState('feishu', true, result.feishu.userName, result.feishu.version);
      loadPermissions('feishu');
    }
    if (result.dingtalk.authed) {
      setAuthState('dingtalk', true, result.dingtalk.userName, result.dingtalk.version);
      loadPermissions('dingtalk');
    }
  } catch (err) { console.error('Check auth status failed:', err); }
}

async function doAuth(cli, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = '授权中...';
  try {
    const result = await (cli === 'feishu' ? window.api.authFeishu() : window.api.authDingtalk());
    if (result.success) {
      setAuthState(cli, true, result.userName, result.version);
      loadPermissions(cli);
    } else {
      alert(`授权失败: ${result.error}`);
    }
  } catch (err) { alert(`授权异常: ${err.message}`); }
  btnEl.disabled = false;
  btnEl.textContent = '开始授权';
}

document.getElementById('auth-feishu')?.addEventListener('click', () => doAuth('feishu', document.getElementById('auth-feishu')));
document.getElementById('reauth-feishu')?.addEventListener('click', () => doAuth('feishu', document.getElementById('reauth-feishu')));
document.getElementById('auth-dingtalk')?.addEventListener('click', () => doAuth('dingtalk', document.getElementById('auth-dingtalk')));
document.getElementById('reauth-dingtalk')?.addEventListener('click', () => doAuth('dingtalk', document.getElementById('reauth-dingtalk')));

document.getElementById('refresh-feishu-perms')?.addEventListener('click', () => loadPermissions('feishu', 1, permissionsState.feishu.search));
document.getElementById('refresh-dingtalk-perms')?.addEventListener('click', () => loadPermissions('dingtalk', 1, permissionsState.dingtalk.search));

setupPermissionsSearch('feishu');
setupPermissionsSearch('dingtalk');

document.getElementById('run-diagnostic')?.addEventListener('click', async () => {
  const btn = document.getElementById('run-diagnostic');
  const resultBox = document.getElementById('diagnostic-result');
  btn.disabled = true;
  btn.textContent = '诊断中...';
  resultBox.style.display = 'block';
  resultBox.textContent = '正在运行诊断...';
  try {
    const result = await window.api.runDiagnostic();
    resultBox.textContent = result.output || result.error;
  } catch (err) { resultBox.textContent = `诊断失败: ${err.message}`; }
  btn.disabled = false;
  btn.textContent = '运行诊断';
});

// ============================
// Chat Page
// ============================
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-message');
const stopBtn = document.getElementById('stop-generation');
const chatMessages = document.getElementById('chat-messages');
const sessionList = document.querySelector('.session-list');

let currentSessionId = null;
let currentAgentMessageEl = null;
let agentRunning = false;
let pendingPrompt = null;

const SESSIONS_KEY = 'hermes-chat-sessions';

function loadSessions() {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function saveSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function createNewSession() {
  const id = `session-${Date.now()}`;
  const sessions = loadSessions();
  sessions[id] = { id, messages: [], created: Date.now(), title: '新对话' };
  saveSessions(sessions);
  return id;
}

function addMessageToSession(text, sender) {
  if (!currentSessionId) return;
  const sessions = loadSessions();
  if (sessions[currentSessionId]) {
    sessions[currentSessionId].messages.push({ text, sender, timestamp: Date.now() });
    if (sender === 'user' && sessions[currentSessionId].messages.length <= 2) {
      sessions[currentSessionId].title = text.slice(0, 30);
    }
    saveSessions(sessions);
    renderSessionList();
  }
}

function renderSessionList() {
  const sessions = loadSessions();
  const sorted = Object.values(sessions).sort((a, b) => b.created - a.created);
  sessionList.innerHTML = sorted.length ? sorted.map(s => `
    <div class="session-item ${s.id === currentSessionId ? 'active' : ''}" data-session-id="${s.id}">
      <span class="session-title">${escapeHtml(s.title)}</span>
      <span class="session-time">${formatTime(s.created)}</span>
    </div>
  `).join('') : '<div class="empty-state-text">暂无会话</div>';

  sessionList.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => loadSession(item.dataset.sessionId));
  });
}

function loadSession(sessionId) {
  currentSessionId = sessionId;
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return;
  chatMessages.innerHTML = '';
  session.messages.forEach(m => addMessage(m.text, m.sender));
  renderSessionList();
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addMessage(text, sender = 'user', isStreaming = false) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  if (isStreaming) msg.classList.add('streaming');

  let innerHTML = '';
  if (sender === 'agent') {
    if (text) {
      innerHTML += `<div class="message-bubble">${renderMarkdown(text)}</div>`;
    } else {
      innerHTML += `<div class="message-bubble"></div>`;
    }
  } else {
    innerHTML += `<div class="message-bubble">${escapeHtml(text)}</div>`;
  }
  msg.innerHTML = innerHTML;
  const bubble = msg.querySelector('.message-bubble');
  bubble._rawText = text || '';
  bubble._rawReasoning = '';
  bubble._toolCalls = {};
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (sender === 'agent' && isStreaming) {
    currentAgentMessageEl = msg;
  }
  return msg;
}

function updateStreamingMessage(chunk) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  bubble._rawText = (bubble._rawText || '') + chunk;
  bubble.innerHTML = renderMarkdown(bubble._rawText);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateReasoning(text) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  bubble._rawReasoning = (bubble._rawReasoning || '') + text;
  let reasoningEl = currentAgentMessageEl.querySelector('.message-reasoning');
  if (!reasoningEl) {
    reasoningEl = document.createElement('div');
    reasoningEl.className = 'message-reasoning';
    reasoningEl.innerHTML = `
      <div class="message-reasoning-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="message-reasoning-label">思考过程</span>
        <svg class="message-reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="message-reasoning-content"></div>
    `;
    currentAgentMessageEl.insertBefore(reasoningEl, currentAgentMessageEl.firstChild);
  }
  reasoningEl.querySelector('.message-reasoning-content').textContent = bubble._rawReasoning;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideReasoning() {
  if (!currentAgentMessageEl) return;
  const reasoningEl = currentAgentMessageEl.querySelector('.message-reasoning');
  if (reasoningEl) {
    reasoningEl.classList.add('finished');
    const label = reasoningEl.querySelector('.message-reasoning-label');
    if (label) label.textContent = '思考完成';
  }
}

function addToolCall(toolId, name, args) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  const toolCalls = bubble._toolCalls || {};
  toolCalls[toolId] = { name, args, result: null, status: 'running' };
  bubble._toolCalls = toolCalls;
  renderToolCalls(bubble);
}

function updateToolCall(toolId, result) {
  let targetEl = currentAgentMessageEl;
  // If current message is null (streaming finished), find the last agent message
  if (!targetEl) {
    const agentMessages = chatMessages.querySelectorAll('.message.agent');
    targetEl = agentMessages[agentMessages.length - 1];
  }
  if (!targetEl) return;
  const bubble = targetEl.querySelector('.message-bubble');
  if (!bubble) return;
  const toolCalls = bubble._toolCalls || {};
  if (toolCalls[toolId]) {
    toolCalls[toolId].result = result;
    toolCalls[toolId].status = 'done';
  }
  renderToolCalls(bubble);
}

function renderToolCalls(bubble) {
  const toolCalls = bubble._toolCalls || {};
  const entries = Object.entries(toolCalls);
  if (entries.length === 0) return;

  let existingContainer = bubble.querySelector('.message-tool-calls');
  if (!existingContainer) {
    existingContainer = document.createElement('div');
    existingContainer.className = 'message-tool-calls';
    bubble.insertBefore(existingContainer, bubble.firstChild);
  }

  existingContainer.innerHTML = entries.map(([toolId, tc]) => {
    const statusClass = tc.status === 'running' ? 'running' : (tc.result && tc.result.startsWith('ERROR') ? 'error' : 'done');
    const spinnerHtml = tc.status === 'running' ? '<span class="spinner"></span>' : '';
    const resultClass = tc.result && tc.result.startsWith('ERROR') ? 'error' : '';
    const statusText = tc.status === 'running' ? '执行中...' : (tc.result && tc.result.startsWith('ERROR') ? '失败' : '完成');
    return `<div class="message-tool-call" data-tool-id="${toolId}">
      <div class="message-tool-call-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="message-tool-call-name">${escapeHtml(tc.name)}</span>
        <span class="message-tool-call-status ${statusClass}">${spinnerHtml}${statusText}</span>
        <svg class="message-tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="message-tool-call-body">
        <div class="message-tool-call-body-inner">
          <div class="message-tool-call-args">
            <div class="message-tool-call-args-label">参数</div>
            <pre>${escapeHtml(tc.args || '{}')}</pre>
          </div>
          ${tc.result !== null ? `<div class="message-tool-call-result">
            <div class="message-tool-call-result-label">结果</div>
            <pre class="${resultClass}">${escapeHtml(tc.result)}</pre>
          </div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function showPromptOverlay(type, data) {
  pendingPrompt = { type, ...data };
  const chatInputArea = document.querySelector('.chat-input-area');
  if (chatInputArea) chatInputArea.classList.add('disabled');

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.id = 'prompt-overlay';

  let content = '';
  if (type === 'clarify_request') {
    const choices = data.choices || [];
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">❓</span>需要你的选择</h3>
      <div class="prompt-question">${escapeHtml(data.question)}</div>
      <div class="prompt-choices">
        ${choices.map((c, i) => `<button class="prompt-choice-btn ${i === 0 ? 'primary' : ''}" data-answer="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
    </div>`;
  } else if (type === 'approval_request') {
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">🔐</span>需要权限审批</h3>
      <div class="prompt-description">${escapeHtml(data.description || '以下命令需要你的批准才能执行')}</div>
      <div class="prompt-command">${escapeHtml(data.command || '')}</div>
      <div class="prompt-actions">
        <button class="btn btn-secondary prompt-approve" data-choice="once">批准一次</button>
        <button class="btn btn-secondary prompt-approve" data-choice="session">本次会话批准</button>
        <button class="btn btn-danger prompt-deny" data-choice="deny">拒绝</button>
      </div>
    </div>`;
  } else if (type === 'sudo_request') {
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">🔑</span>需要 sudo 密码</h3>
      <div class="prompt-input-group">
        <label for="prompt-sudo-password">请输入 sudo 密码</label>
        <input type="password" id="prompt-sudo-password" placeholder="密码" autofocus>
      </div>
      <div class="prompt-actions">
        <button class="btn btn-secondary prompt-sudo-cancel">取消</button>
        <button class="btn btn-primary prompt-sudo-submit">提交</button>
      </div>
    </div>`;
  } else if (type === 'secret_request') {
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">🔒</span>需要密钥</h3>
      <div class="prompt-description">${escapeHtml(data.prompt || `请输入 ${data.env_var} 的值`)}</div>
      <div class="prompt-input-group">
        <label for="prompt-secret-value">${escapeHtml(data.env_var || 'Value')}</label>
        <input type="password" id="prompt-secret-value" placeholder="输入密钥" autofocus>
        ${data.metadata ? `<div class="input-hint">${escapeHtml(JSON.stringify(data.metadata))}</div>` : ''}
      </div>
      <div class="prompt-actions">
        <button class="btn btn-secondary prompt-secret-skip">跳过</button>
        <button class="btn btn-primary prompt-secret-submit">提交</button>
      </div>
    </div>`;
  }

  overlay.innerHTML = content;
  document.body.appendChild(overlay);

  if (type === 'clarify_request') {
    overlay.querySelectorAll('.prompt-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => submitPrompt(btn.dataset.answer));
    });
  } else if (type === 'approval_request') {
    overlay.querySelectorAll('.prompt-approve').forEach(btn => {
      btn.addEventListener('click', () => submitPrompt(btn.dataset.choice));
    });
    overlay.querySelectorAll('.prompt-deny').forEach(btn => {
      btn.addEventListener('click', () => submitPrompt('deny'));
    });
  } else if (type === 'sudo_request') {
    overlay.querySelector('.prompt-sudo-submit')?.addEventListener('click', () => {
      const pw = document.getElementById('prompt-sudo-password')?.value || '';
      submitPrompt(pw);
    });
    overlay.querySelector('.prompt-sudo-cancel')?.addEventListener('click', () => submitPrompt(''));
    const pwInput = document.getElementById('prompt-sudo-password');
    if (pwInput) pwInput.focus();
  } else if (type === 'secret_request') {
    overlay.querySelector('.prompt-secret-submit')?.addEventListener('click', () => {
      const val = document.getElementById('prompt-secret-value')?.value || '';
      submitPrompt(val);
    });
    overlay.querySelector('.prompt-secret-skip')?.addEventListener('click', () => submitPrompt(''));
    const secretInput = document.getElementById('prompt-secret-value');
    if (secretInput) secretInput.focus();
  }
}

function removePromptOverlay() {
  const overlay = document.getElementById('prompt-overlay');
  if (overlay) overlay.remove();
  pendingPrompt = null;
  const chatInputArea = document.querySelector('.chat-input-area');
  if (chatInputArea) chatInputArea.classList.remove('disabled');
}

async function submitPrompt(answer) {
  if (!pendingPrompt) return;
  const requestId = pendingPrompt.request_id;
  removePromptOverlay();
  try {
    await window.api.agentRespondToPrompt(requestId, answer);
  } catch (err) {
    console.error('Respond to prompt failed:', err);
  }
}

function finalizeStreamingMessage() {
  if (!currentAgentMessageEl) return;
  currentAgentMessageEl.classList.remove('streaming');
  hideReasoning();
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  const text = bubble._rawText || bubble.textContent;
  addMessageToSession(text, 'agent');
  currentAgentMessageEl = null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Lightweight markdown-to-HTML renderer for chat messages
function renderMarkdown(text) {
  if (!text) return '';

  // Extract and protect code blocks first
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `\x00CODEBLOCK${codeBlocks.length}\x00`;
    codeBlocks.push({ lang, code: code.trim() });
    return placeholder;
  });

  // Escape HTML
  let html = escapeHtml(text);

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    const placeholder = `\x00CODEBLOCK${i}\x00`;
    const langLabel = block.lang ? `<span class="code-lang">${block.lang}</span>` : '';
    html = html.replace(placeholder, `<pre class="code-block">${langLabel}<code>${escapeHtml(block.code)}</code></pre>`);
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Tables: | col | col |\n|---|---|\n| data | data |
  html = html.replace(/^((?:\|.+\|(?:\n|$))+)/gm, (tableMatch) => {
    const lines = tableMatch.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return tableMatch;
    // Check second line is separator
    const sepLine = lines[1].trim();
    if (!/^[\|\-\s:]+$/.test(sepLine)) return tableMatch;

    const parseCells = (line) => line.split('|').slice(1, -1).map(c => c.trim());
    const headers = parseCells(lines[0]);
    let result = '<table class="md-table"><thead><tr>';
    headers.forEach(h => { result += `<th>${h}</th>`; });
    result += '</tr></thead><tbody>';
    for (let i = 2; i < lines.length; i++) {
      const cells = parseCells(lines[i]);
      result += '<tr>';
      cells.forEach(c => { result += `<td>${c}</td>`; });
      result += '</tr>';
    }
    result += '</tbody></table>';
    return result;
  });

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>(?:<br>)?)+)/g, (match) => {
    const cleaned = match.replace(/<br>/g, '\n');
    return `<ul>${cleaned}</ul>`;
  });

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Line breaks: convert double newlines to paragraph breaks, single newlines to <br>
  // But not inside tables or code blocks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (!agentRunning) {
    addMessage('Agent 暂未连接，请在日志页面启动 Agent 后重试。', 'agent');
    return;
  }

  addMessage(text, 'user');
  addMessageToSession(text, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto';

  sendBtn.disabled = true;
  sendBtn.textContent = '发送中...';
  if (stopBtn) stopBtn.style.display = '';

  // Build conversation history from current session
  const history = buildConversationHistory();

  try {
    const result = await window.api.agentSendMessage(text, history);
    if (!result.success) {
      addMessage(result.error || '发送失败', 'agent');
    }
  } catch (err) {
    addMessage(`发送异常: ${err.message}`, 'agent');
  }
}

function buildConversationHistory() {
  if (!currentSessionId) return [];
  const sessions = loadSessions();
  const session = sessions[currentSessionId];
  if (!session || !session.messages) return [];
  return session.messages
    .filter(m => m.sender === 'user' || m.sender === 'agent')
    .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
}

async function stopGeneration() {
  try {
    await window.api.agentStopGeneration();
  } catch (err) { console.error('Stop generation failed:', err); }
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (stopBtn) stopBtn.addEventListener('click', stopGeneration);
if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
}

renderSessionList();
currentSessionId = createNewSession();
addMessage('你好！我是 Hermes，有什么可以帮你？', 'agent');

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
    await (action === 'start' ? window.api.agentStart(config) : action === 'stop' ? window.api.agentStop() : window.api.agentRestart());
    updateStatus('status-agent', 'success');
    appendLog(`[INFO] Agent ${action === 'start' ? '已启动' : action === 'stop' ? '已停止' : '已重启'}`);
  } catch (err) { appendLog(`[ERROR] Agent ${action}失败: ${err.message}`); }
}

document.getElementById('agent-start')?.addEventListener('click', () => agentAction('start'));
document.getElementById('agent-stop')?.addEventListener('click', () => agentAction('stop'));
document.getElementById('agent-restart')?.addEventListener('click', () => agentAction('restart'));

// ============================
// Listen for events from main process
// ============================
if (window.api) {
  window.api.onAgentLog((data) => appendLog(`[${data.level}] ${data.message}`));
  window.api.onAgentStatus((data) => {
    updateStatus('status-agent', data.running ? 'success' : 'error');
    agentRunning = data.running;
  });
  window.api.onAgentResponse((data) => {
    switch (data.event) {
      case 'start':
        addMessage('', 'agent', true);
        break;
      case 'chunk':
        updateStreamingMessage(data.data);
        break;
      case 'reasoning':
        updateReasoning(data.data);
        break;
      case 'thinking':
        if (currentAgentMessageEl) {
          const reasoningEl = currentAgentMessageEl.querySelector('.message-reasoning-label');
          if (reasoningEl && data.data) {
            reasoningEl.textContent = data.data;
          } else if (reasoningEl && !data.data) {
            // Empty thinking text means agent finished thinking
            hideReasoning();
          }
        }
        break;
      case 'tool_start':
        addToolCall(data.data.tool_id, data.data.name, data.data.args);
        break;
      case 'tool_complete':
        updateToolCall(data.data.tool_id, data.data.result);
        break;
      case 'tool_progress':
        break;
      case 'tool_gen':
        break;
      case 'clarify_request':
        showPromptOverlay('clarify_request', {
          request_id: data.data.request_id,
          question: data.data.question,
          choices: data.data.choices,
        });
        break;
      case 'approval_request':
        showPromptOverlay('approval_request', {
          request_id: data.data.request_id,
          command: data.data.command,
          description: data.data.description,
        });
        break;
      case 'sudo_request':
        showPromptOverlay('sudo_request', {
          request_id: data.data.request_id,
        });
        break;
      case 'secret_request':
        showPromptOverlay('secret_request', {
          request_id: data.data.request_id,
          env_var: data.data.env_var,
          prompt: data.data.prompt,
          metadata: data.data.metadata,
        });
        break;
      case 'complete':
        finalizeStreamingMessage();
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        break;
      case 'error':
        if (currentAgentMessageEl) {
          const bubble = currentAgentMessageEl.querySelector('.message-bubble');
          bubble._rawText = data.data;
          bubble.innerHTML = renderMarkdown(data.data);
          finalizeStreamingMessage();
        } else {
          addMessage(data.data, 'agent');
        }
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        break;
      case 'stopped':
        finalizeStreamingMessage();
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        break;
    }
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
      <button class="wizard-close">&times;</button>
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
        <h3>设置完成</h3>
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
      await window.api.configSave(wizardConfig);
      goToStep(2);
    } else if (currentStep === 2) { goToStep(3); }
    else if (currentStep === 3) { goToStep(4); }
  });

  overlay.querySelector('.wizard-prev').addEventListener('click', () => goToStep(currentStep - 1));
  overlay.querySelector('.wizard-close').addEventListener('click', () => overlay.remove());

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

  overlay.querySelector('.wizard-done').addEventListener('click', () => { overlay.remove(); checkAuthStatus(); });
}

// ============================
// New Chat Button
// ============================
document.getElementById('new-chat-btn')?.addEventListener('click', () => {
  currentSessionId = createNewSession();
  chatMessages.innerHTML = '';
  addMessage('你好！我是 Hermes，有什么可以帮你？', 'agent');
  addMessageToSession('你好！我是 Hermes，有什么可以帮你？', 'agent');
  renderSessionList();
});

// ============================
// Init
// ============================
loadConfig();
checkFirstRun();
updateStatus('status-agent', 'error');
checkAuthStatus();

// Auto-start Agent on launch (only if configured)
async function autoStartAgent() {
  try {
    const config = await window.api.configGet();
    if (!config.autoStart) return;
    // Only auto-start if a provider or API key is configured
    const hasConfig = config.provider && config.provider !== 'auto' || config.apiKey;
    if (!hasConfig) return;
    const result = await window.api.agentStart(config);
    if (result && result.success) {
      updateStatus('status-agent', 'success');
      agentRunning = true;
    }
  } catch (err) {
    // Silently ignore auto-start failures (Agent not configured yet)
    console.warn('Auto-start Agent skipped:', err.message);
  }
}
autoStartAgent();
