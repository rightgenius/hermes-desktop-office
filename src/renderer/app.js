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

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.rail-btn').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(`page-${pageName}`);
  const nav = document.querySelector(`.rail-btn[data-page="${pageName}"]`);
  if (target) target.classList.add('active');
  if (nav) nav.classList.add('active');
  
  // Hide sidebar for settings, logs, and skills pages
  const midPanel = document.querySelector('.mid-panel');
  if (midPanel) {
    midPanel.style.display = (pageName === 'settings' || pageName === 'logs' || pageName === 'skills' || pageName === 'cron' || pageName === 'gateway') ? 'none' : '';
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    const pages = ['chat', 'settings', 'gateway', 'skills', 'logs', 'cron'];
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
  apiFormat: document.getElementById('api-format'),
  provider: document.getElementById('provider'),
  providerRegion: document.getElementById('provider-region'),
  providerRegionGroup: document.getElementById('provider-region-group'),
  providerRegionHint: document.getElementById('provider-region-hint'),
  apiKey: document.getElementById('api-key'),
  baseUrl: document.getElementById('base-url'),
  modelSelect: document.getElementById('model-select'),
  model: document.getElementById('model'),
  workspacePath: document.getElementById('workspace-path'),
  autoStart: document.getElementById('auto-start'),
  gatewayAutoStart: document.getElementById('gateway-auto-start'),
  saveConfig: document.getElementById('save-config'),
  toggleApiKey: document.getElementById('toggle-api-key'),
  browseFolder: document.getElementById('browse-folder'),
  checkConfig: document.getElementById('check-config'),
  configStatus: document.getElementById('config-status'),
  apiKeyHint: document.getElementById('api-key-hint'),
  testConnection: document.getElementById('test-connection'),
};

function updateApiFormatOptions() {
  if (!els.apiFormat) return;
  els.apiFormat.innerHTML = API_FORMATS.map(f =>
    `<option value="${f.value}">${f.label}</option>`
  ).join('');
}

function updateProviderOptions() {
  if (!els.provider) return;
  const format = els.apiFormat.value;
  const providers = getProvidersByFormat(format);
  els.provider.innerHTML = providers.map(p =>
    `<option value="${p.key}">${p.label}</option>`
  ).join('');
}

function updateRegionOptions() {
  if (!els.providerRegion || !els.providerRegionGroup) return;
  const provider = findProviderByKey(els.provider.value);
  const savedValue = els.providerRegion.value;
  if (provider && provider.regions && provider.regions.length > 0) {
    els.providerRegion.innerHTML = provider.regions.map(r =>
      `<option value="${r.key}">${r.label}</option>`
    ).join('');
    // Restore selection if it still exists
    if (savedValue && [...els.providerRegion.options].some(o => o.value === savedValue)) {
      els.providerRegion.value = savedValue;
    }
    els.providerRegionGroup.style.display = '';
    if (els.providerRegionHint) {
      els.providerRegionHint.textContent = '不同套餐对应不同 API Key，请确认选择了正确的区域';
    }
  } else {
    els.providerRegionGroup.style.display = 'none';
    if (els.providerRegionHint) {
      els.providerRegionHint.textContent = '';
    }
  }
}

function updateModelOptions() {
  if (!els.modelSelect) return;
  const provider = findProviderByKey(els.provider.value);
  const savedValue = els.modelSelect.value;
  if (provider && provider.models && provider.models.length > 0) {
    els.modelSelect.innerHTML = '<option value="">留空自动选择</option>' +
      provider.models.map(m => `<option value="${m}">${m}</option>`).join('');
    // Restore selection if it still exists
    if (savedValue && [...els.modelSelect.options].some(o => o.value === savedValue)) {
      els.modelSelect.value = savedValue;
    }
  } else {
    els.modelSelect.innerHTML = '<option value="">留空自动选择</option>';
  }
}

function updateProviderUI() {
  const provider = findProviderByKey(els.provider.value);
  if (!provider) return;

  if (els.apiKeyHint) {
    els.apiKeyHint.textContent = provider.envLabel || '';
  }

  // Only auto-fill base URL when a region is explicitly selected
  const regionKey = els.providerRegion?.value;
  if (provider.regions && regionKey) {
    const region = provider.regions.find(r => r.key === regionKey);
    if (region) {
      els.baseUrl.value = region.baseUrl;
      if (region.envVar && els.apiKeyHint) {
        els.apiKeyHint.textContent = `需要 ${region.envVar}`;
      }
    }
  } else if (!provider.regions && provider.baseUrl && !provider.isCustom) {
    // For providers without regions, still auto-fill
    els.baseUrl.value = provider.baseUrl;
  }

  updateRegionOptions();
  updateModelOptions();

  if (provider.isCustom) {
    els.baseUrl.placeholder = 'https://your-api-endpoint/v1';
    els.apiKeyHint.textContent = '需要自定义 API Key';
  } else if (provider.regions) {
    els.baseUrl.placeholder = '选择区域/套餐后自动填充';
  } else {
    els.baseUrl.placeholder = '选择服务商后自动填充';
  }
}

// Cascading event bindings
if (els.apiFormat) {
  els.apiFormat.addEventListener('change', () => {
    updateProviderOptions();
    updateProviderUI();
  });
}

if (els.provider) {
  els.provider.addEventListener('change', () => {
    updateRegionOptions();
    updateProviderUI();
  });
}

if (els.providerRegion) {
  els.providerRegion.addEventListener('change', () => {
    updateProviderUI();
  });
}

if (els.modelSelect) {
  els.modelSelect.addEventListener('change', () => {
    if (els.modelSelect.value && els.model) {
      els.model.value = els.modelSelect.value;
    }
  });
}

if (els.model) {
  els.model.addEventListener('input', () => {
    if (els.modelSelect && els.model.value !== els.modelSelect.value) {
      els.modelSelect.value = '';
    }
  });
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
      const provider = findProviderByKey(els.provider.value);
      await window.api.configSave({
        apiFormat: els.apiFormat.value,
        provider: provider ? (provider.isCustom ? 'custom' : els.provider.value) : els.provider.value,
        providerRegion: els.providerRegion?.value || '',
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
    
    let apiFormat = config.apiFormat || '';
    let providerKey = config.providerRegion || '';
    
    if (!providerKey && config.provider) {
      const inferred = legacyProviderToKey(config.provider, config.baseUrl);
      if (inferred) {
        providerKey = inferred;
        const p = findProviderByKey(inferred);
        if (p) apiFormat = p.format;
      }
    }
    
    if (!apiFormat) apiFormat = 'openai';
    
    if (els.apiFormat) els.apiFormat.value = apiFormat;
    
    updateProviderOptions();
    if (els.provider && providerKey) {
      els.provider.value = providerKey;
    }
    
    updateRegionOptions();
    if (els.providerRegion && config.providerRegion) {
      els.providerRegion.value = config.providerRegion;
    }
    
    els.apiKey.value = config.apiKey || '';
    els.baseUrl.value = config.baseUrl || '';
    els.model.value = config.model || '';
    if (els.modelSelect && config.model) {
      els.modelSelect.value = config.model;
    }
    els.workspacePath.value = config.workspacePath || '';
    els.autoStart.checked = config.autoStart !== false;
    if (els.gatewayAutoStart) els.gatewayAutoStart.checked = config.gatewayAutoStart === true;
    
    updateProviderUI();
  } catch (err) { console.error('Load config failed:', err); }
}

// Test API connection
async function testApiConnection() {
  const provider = findProviderByKey(els.provider.value);
  const apiFormat = els.apiFormat?.value || provider?.format || 'openai';
  let baseUrl = els.baseUrl.value.trim();
  if (!baseUrl && provider && provider.baseUrl) {
    baseUrl = provider.baseUrl;
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
  const defaultModel = apiFormat === 'anthropic' ? 'claude-sonnet-4.6' : 'gpt-4o-mini';
  const model = els.model.value.trim() || (provider?.models?.[0]) || defaultModel;

  try {
    const result = await window.api.testApiConnection({ baseUrl, apiKey, model, apiFormat });
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
      // Debug info
      if (result.debug) {
        msg += `\n\n=== 调试信息 ===\n`;
        msg += `请求 URL: ${result.debug.fullUrl}\n`;
        msg += `认证头: ${result.debug.authHeader}\n`;
        msg += `Key 长度: ${result.debug.authLength}\n`;
        if (result.debug.keyHex) {
          msg += `Key HEX: ${result.debug.keyHex}\n`;
        }
        msg += `请求体: ${result.debug.body}`;
      }
      alert(msg);
    }
  } catch (err) {
    alert(`API 连接异常: ${err.message}\n\n堆栈:\n${err.stack || ''}`);
  }
}

if (els.testConnection) {
  els.testConnection.addEventListener('click', () => testApiConnection());
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
const attachBtn = document.getElementById('attach-file');
const attachmentList = document.getElementById('attachment-list');
const sessionList = document.querySelector('.session-list');

let currentSessionId = null;
let currentAgentMessageEl = null;
let agentRunning = false;
let pendingPrompt = null;
let selectedAttachments = [];

// In-memory storage for streaming messages per session
const streamingSessions = {};

const TOOL_NAME_MAP = {
  terminal: '执行命令',
  read_file: '读取文件',
  write_file: '写入文件',
  patch: '编辑文件',
  search_files: '搜索文件',
  skill_view: '查看技能',
  skills_list: '技能列表',
  todo: '任务清单',
  delegate_task: '分派子任务',
  clarify: '请求确认',
  web_search: '网络搜索',
  fetch_url: '抓取网页',
  execute_code: '执行代码',
  cronjob: '定时任务',
  send_message: '发送消息',
  image_gen: '生成图片',
  tts: '语音合成',
  vision_screenshot: '截图分析',
  vision_describe: '图片描述',
  memory: '记忆管理',
  browser_navigate: '浏览器导航',
  browser_click: '浏览器点击',
  browser_type: '浏览器输入',
  browser_screenshot: '浏览器截图',
  browser_scroll: '浏览器滚动',
  browser_read: '浏览器读取',
  browser_evaluate: '浏览器执行',
  browser_close: '关闭浏览器',
  browser_back: '浏览器返回',
  browser_forward: '浏览器前进',
  browser_open: '打开浏览器',
};

function getToolDisplayName(name) {
  if (!name) return '工具调用';
  if (TOOL_NAME_MAP[name]) return TOOL_NAME_MAP[name];
  if (name.startsWith('mcp_')) {
    const parts = name.split('_').slice(1);
    return parts.join('_') || name;
  }
  if (name.startsWith('ha_')) return `家居控制`;
  if (name.startsWith('browser_')) return `浏览器操作`;
  if (name.startsWith('feishu_')) return `飞书操作`;
  if (name.startsWith('kanban_')) return `看板操作`;
  if (name.startsWith('rl_')) return `强化学习`;
  return name.replace(/_/g, ' ');
}

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

function restoreStreamingState() {
  const sessionId = currentSessionId;
  const state = streamingSessions[sessionId];
  // Restore if state exists (even if text is empty, meaning only 'start' event received)
  if (!state) return;
  
  // Check if we already have a streaming message for this session
  const existing = getStreamingMessageEl(sessionId);
  if (existing) return;
  
  // Create streaming message from saved state
  const msg = addMessage(state.text || '', 'agent', true, state.reasoning || '', Object.values(state.toolCalls || {}), sessionId);
  
  // Restore tool calls
  const bubble = msg.querySelector('.message-bubble');
  bubble._toolCalls = state.toolCalls || {};
  if (Object.keys(bubble._toolCalls).length > 0) {
    renderToolCalls(bubble);
  }
}

function createNewSession() {
  const id = `session-${Date.now()}`;
  const sessions = loadSessions();
  sessions[id] = { id, messages: [], created: Date.now(), title: '新对话', workspacePath: null };
  saveSessions(sessions);
  return id;
}

function addMessageToSession(text, sender, reasoning = '', toolCalls = {}) {
  if (!currentSessionId) return;
  return addMessageToSessionById(currentSessionId, text, sender, reasoning, toolCalls);
}

function addMessageToSessionById(sessionId, text, sender, reasoning = '', toolCalls = {}) {
  if (!sessionId) return;
  const sessions = loadSessions();
  if (sessions[sessionId]) {
    const messageIndex = sessions[sessionId].messages.length;
    sessions[sessionId].messages.push({
      text, 
      sender, 
      timestamp: Date.now(),
      reasoning,
      toolCalls: Object.entries(toolCalls).map(([id, tc]) => ({
        toolId: id,
        ...tc
      }))
    });
    if (sender === 'user' && sessions[sessionId].messages.length <= 2) {
      sessions[sessionId].title = text.slice(0, 30);
    }
    saveSessions(sessions);
    renderSessionList();
    return messageIndex;
  }
}

function openSessionMenu(sessionId, event) {
  closeSessionMenu();
  
  const dropdown = document.createElement('div');
  dropdown.className = 'session-menu-dropdown';
  dropdown.id = 'session-menu-active';
  dropdown.innerHTML = `
    <button class="session-menu-item" data-action="rename" data-session-id="${sessionId}">重命名</button>
    <button class="session-menu-item" data-action="export" data-session-id="${sessionId}">导出 Markdown</button>
    <button class="session-menu-item danger" data-action="delete" data-session-id="${sessionId}">删除</button>
  `;
  
  const btn = event.target;
  btn.closest('.session-menu-wrapper').appendChild(dropdown);
  
  dropdown.querySelectorAll('.session-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const sid = item.dataset.sessionId;
      closeSessionMenu();
      if (action === 'rename') renameSession(sid);
      else if (action === 'export') exportSessionMarkdown(sid);
      else if (action === 'delete') deleteSession(sid);
    });
  });
}

function closeSessionMenu() {
  const existing = document.getElementById('session-menu-active');
  if (existing) existing.remove();
}

let activeSessionTitleTooltip = null;

function hideSessionTitleTooltip() {
  if (activeSessionTitleTooltip) {
    activeSessionTitleTooltip.remove();
    activeSessionTitleTooltip = null;
  }
}

function showSessionTitleTooltip(title) {
  hideSessionTitleTooltip();
  if (!title?.dataset?.title) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'session-title-tooltip';
  tooltip.textContent = title.dataset.title;
  document.body.appendChild(tooltip);

  const rect = title.getBoundingClientRect();
  const padding = 8;
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - tooltipRect.width - padding);
  tooltip.style.top = `${rect.bottom + 4}px`;
  tooltip.style.left = `${Math.max(padding, left)}px`;
  activeSessionTitleTooltip = tooltip;
}

function renameSession(sessionId) {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return;
  
  showRenameDialog(sessionId, session.title);
}

function showRenameDialog(sessionId, currentTitle) {
  const overlay = document.createElement('div');
  overlay.className = 'rename-dialog-overlay';
  overlay.innerHTML = `
    <div class="rename-dialog">
      <h3>重命名会话</h3>
      <input type="text" class="rename-input" value="${escapeHtml(currentTitle)}" placeholder="输入新名称">
      <div class="rename-dialog-buttons">
        <button class="rename-cancel">取消</button>
        <button class="rename-confirm btn btn-primary">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const input = overlay.querySelector('.rename-input');
  const confirmBtn = overlay.querySelector('.rename-confirm');
  const cancelBtn = overlay.querySelector('.rename-cancel');
  
  function close() {
    overlay.remove();
  }
  
  function confirm() {
    const newName = input.value.trim();
    if (!newName) {
      input.placeholder = '名称不能为空';
      input.value = '';
      return;
    }
    
    const sessions = loadSessions();
    if (sessions[sessionId]) {
      sessions[sessionId].title = newName;
      saveSessions(sessions);
      renderSessionList();
    }
    close();
  }
  
  confirmBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') close();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  
  setTimeout(() => input.focus(), 10);
}

function deleteSession(sessionId) {
  const sessions = loadSessions();
  if (!sessions[sessionId]) return;
  
  const confirmed = confirm('确定要删除此会话吗？此操作无法撤销。');
  if (!confirmed) return;
  
  delete sessions[sessionId];
  saveSessions(sessions);
  
  if (streamingSessions[sessionId]) {
    delete streamingSessions[sessionId];
  }
  
  if (sessionId === currentSessionId) {
    currentSessionId = null;
    chatMessages.innerHTML = '';
    restoreChatEmptyState();
    updateChatLayout();
    syncInputAreaState(null);
  }
  
  renderSessionList();
}

function closeMessageContextMenu() {
  const existing = document.getElementById('message-context-menu-active');
  if (existing) existing.remove();
}

function openMessageContextMenu(messageEl, event) {
  const sessionId = currentSessionId;
  const messageIndex = Number(messageEl.dataset.messageIndex);
  if (!sessionId || !Number.isInteger(messageIndex)) return;
  event.preventDefault();
  closeMessageContextMenu();
  closeSessionMenu();

  const menu = document.createElement('div');
  menu.className = 'message-context-menu';
  menu.id = 'message-context-menu-active';
  menu.innerHTML = '<button class="session-menu-item danger" data-action="delete-message">删除这条消息</button>';
  document.body.appendChild(menu);

  const padding = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - padding);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - padding);
  menu.style.left = `${Math.max(padding, left)}px`;
  menu.style.top = `${Math.max(padding, top)}px`;

  menu.querySelector('[data-action="delete-message"]').addEventListener('click', () => {
    deleteMessageAtIndex(sessionId, messageIndex);
    closeMessageContextMenu();
  });
}

function deleteMessageAtIndex(sessionId, messageIndex) {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session || !Array.isArray(session.messages) || !session.messages[messageIndex]) return;

  session.messages.splice(messageIndex, 1);
  saveSessions(sessions);

  if (sessionId === currentSessionId) {
    loadSession(sessionId);
  } else {
    renderSessionList();
  }
}

function formatSessionMarkdown(session) {
  const lines = [];
  const date = new Date(session.created);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  
  lines.push(`# ${escapeHtml(session.title)}`);
  lines.push(`Created: ${dateStr}`);
  lines.push('');
  
  session.messages.forEach(msg => {
    if (msg.sender === 'user') {
      lines.push('## User');
      lines.push(escapeHtml(msg.text));
      lines.push('');
    } else if (msg.sender === 'agent') {
      lines.push('## Assistant');
      if (msg.reasoning) {
        lines.push('> **Thinking:**');
        lines.push(`> ${escapeHtml(msg.reasoning).replace(/\n/g, '\n> ')}`);
        lines.push('');
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(tc => {
          lines.push(`<details><summary>${escapeHtml(getToolDisplayName(tc.name))}详情</summary>`);
          lines.push('');
          lines.push('```');
          lines.push(escapeHtml(tc.result || ''));
          lines.push('```');
          lines.push('</details>');
          lines.push('');
        });
      }
      if (msg.text) {
        lines.push(msg.text);
      }
      lines.push('');
    }
  });
  
  return lines.join('\n');
}

async function exportSessionMarkdown(sessionId) {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return;
  
  const markdown = formatSessionMarkdown(session);
  const filename = `${session.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.md`;
  
  if (window.api && window.api.sessionExport) {
    try {
      await window.api.sessionExport(filename, markdown);
      return;
    } catch (err) {
      console.warn('IPC export failed, falling back to download:', err);
    }
  }
  
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('click', (e) => {
  hideSessionTitleTooltip();
  if (!e.target.closest('.session-menu-wrapper')) {
    closeSessionMenu();
  }
});

function renderSessionList() {
  hideSessionTitleTooltip();

  const sessions = loadSessions();
  const sorted = Object.values(sessions).sort((a, b) => b.created - a.created);
  sessionList.innerHTML = sorted.length ? sorted.map(s => `
    <div class="session-item ${s.id === currentSessionId ? 'active' : ''}" data-session-id="${s.id}">
      <div class="session-content">
        <span class="session-title" data-title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
        <span class="session-time">${formatTime(s.created)}</span>
      </div>
      <div class="session-menu-wrapper">
        <button class="session-menu-btn" data-session-id="${s.id}" title="更多操作">⋮</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state-text">暂无会话</div>';

  // Add tooltip hover handlers for titles with overflow
  sessionList.querySelectorAll('.session-title').forEach(title => {
    const isOverflow = title.scrollWidth > title.clientWidth;
    if (isOverflow) {
      title.classList.add('has-overflow');
      title.addEventListener('mouseenter', () => showSessionTitleTooltip(title));
      title.addEventListener('mouseleave', hideSessionTitleTooltip);
    }
  });

  sessionList.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.session-menu-btn')) {
        loadSession(item.dataset.sessionId);
      }
    });
  });

  sessionList.querySelectorAll('.session-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSessionMenu(btn.dataset.sessionId, e);
    });
  });
}

window.addEventListener('scroll', hideSessionTitleTooltip, true);
window.addEventListener('resize', hideSessionTitleTooltip);

function syncInputAreaState(sessionId) {
  const isStreaming = sessionId && streamingSessions[sessionId];
  if (isStreaming) {
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
    if (stopBtn) stopBtn.style.display = '';
  } else {
    sendBtn.disabled = false;
    sendBtn.textContent = '发送';
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

// ============================
// Workspace State
// ============================
const workspaceState = {
  currentPath: null,
  treeData: {},
  openTabs: [],
  activeTab: null,
  collapsed: false,
  treeCollapsed: false,
};

function isTextFile(filePath) {
  const textExts = new Set([
    'txt', 'md', 'json', 'yaml', 'yml', 'py', 'js', 'ts', 'tsx', 'jsx',
    'html', 'css', 'scss', 'xml', 'sql', 'sh', 'bash', 'zsh', 'gitignore',
    'dockerfile', 'makefile', 'cfg', 'ini', 'toml', 'env', 'log', 'csv',
    'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'swift', 'kt',
    'php', 'pl', 'lua', 'r', 'm', 'mm', 'vue', 'svelte', 'astro',
  ]);
  const ext = filePath.split('.').pop().toLowerCase();
  const basename = filePath.split('/').pop().toLowerCase();
  return textExts.has(ext) || textExts.has(basename);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================
// Workspace Tree
// ============================
async function loadWorkspaceTree(dirPath) {
  const treeEl = document.getElementById('workspace-tree');
  if (!treeEl) return;
  
  treeEl.innerHTML = '<div class="workspace-empty">加载中...</div>';
  
  try {
    const result = await window.api.workspaceList({ dirPath });
    if (!result.success) {
      treeEl.innerHTML = `<div class="workspace-empty">加载失败: ${result.error}</div>`;
      return;
    }
    
    workspaceState.currentPath = dirPath;
    document.getElementById('workspace-path-value').textContent = dirPath;
    
    renderWorkspaceTree(result.files, treeEl, 0);
  } catch (err) {
    treeEl.innerHTML = `<div class="workspace-empty">加载异常: ${err.message}</div>`;
  }
}

function renderWorkspaceTree(files, container, depth) {
  if (!files || files.length === 0) {
    container.innerHTML = '<div class="workspace-empty">空目录</div>';
    return;
  }
  
  container.innerHTML = '';
  
  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  sorted.forEach(file => {
    const item = document.createElement('div');
    item.className = `workspace-tree-item ${file.isDirectory ? 'directory' : 'file'}`;
    item.dataset.path = file.path;
    item.dataset.name = file.name;
    item.style.paddingLeft = `${12 + depth * 16}px`;
    
    if (file.isDirectory) {
      const isExpanded = workspaceState.treeData[file.path]?.expanded;
      item.classList.toggle('expanded', isExpanded);
      
      item.innerHTML = `
        <svg class="workspace-tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <svg class="workspace-tree-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="workspace-tree-name">${escapeHtml(file.name)}</span>
      `;
      
      item.addEventListener('click', async () => {
        const isExpanded = item.classList.contains('expanded');
        if (isExpanded) {
          item.classList.remove('expanded');
          workspaceState.treeData[file.path] = { expanded: false };
          const children = item.nextElementSibling;
          if (children && children.classList.contains('workspace-tree-children')) {
            children.remove();
          }
        } else {
          item.classList.add('expanded');
          workspaceState.treeData[file.path] = { expanded: true };
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'workspace-tree-children';
          childrenContainer.dataset.parentPath = file.path;
          
          try {
            const result = await window.api.workspaceList({ dirPath: file.path });
            if (result.success) {
              renderWorkspaceTree(result.files, childrenContainer, depth + 1);
              item.after(childrenContainer);
            }
          } catch (err) {
            console.error('Failed to load directory:', err);
          }
        }
      });
    } else {
      item.innerHTML = `
        <svg class="workspace-tree-icon file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <span class="workspace-tree-name">${escapeHtml(file.name)}</span>
      `;
      
      item.addEventListener('click', () => {
        if (isTextFile(file.path)) {
          openFilePreview(file.path, file.name);
        } else {
          window.api.workspaceOpen({ filePath: file.path });
        }
      });
    }
    
    container.appendChild(item);
  });
}

// ============================
// File Preview & Tabs
// ============================
function openFilePreview(filePath, fileName) {
  const existingTab = workspaceState.openTabs.find(t => t.path === filePath);
  if (existingTab) {
    setActiveTab(filePath);
    return;
  }
  
  workspaceState.openTabs.push({ path: filePath, name: fileName, content: null, size: null });
  setActiveTab(filePath);
  renderPreviewTabs();
  
  loadFileContent(filePath);
}

async function loadFileContent(filePath) {
  try {
    const result = await window.api.workspaceRead({ filePath });
    if (!result.success) {
      updatePreviewContent(`加载失败: ${result.error}`);
      return;
    }
    
    const tab = workspaceState.openTabs.find(t => t.path === filePath);
    if (tab) {
      tab.content = result.content;
      tab.size = result.size;
    }
    
    if (workspaceState.activeTab === filePath) {
      updatePreviewContent(result.content, result.filePath, result.size);
    }
  } catch (err) {
    updatePreviewContent(`加载异常: ${err.message}`);
  }
}

function setActiveTab(filePath) {
  workspaceState.activeTab = filePath;
  renderPreviewTabs();
  
  const tab = workspaceState.openTabs.find(t => t.path === filePath);
  if (tab && tab.content !== null) {
    updatePreviewContent(tab.content, tab.path, tab.size);
  } else {
    updatePreviewContent('加载中...');
  }
}

function closeTab(filePath) {
  const index = workspaceState.openTabs.findIndex(t => t.path === filePath);
  if (index === -1) return;
  
  workspaceState.openTabs.splice(index, 1);
  
  if (workspaceState.activeTab === filePath) {
    workspaceState.activeTab = workspaceState.openTabs.length > 0 
      ? workspaceState.openTabs[Math.max(0, index - 1)].path 
      : null;
  }
  
  renderPreviewTabs();
  
  if (workspaceState.activeTab) {
    const tab = workspaceState.openTabs.find(t => t.path === workspaceState.activeTab);
    if (tab && tab.content !== null) {
      updatePreviewContent(tab.content, tab.path, tab.size);
    }
  } else {
    updatePreviewContent(null);
  }
}

function renderPreviewTabs() {
  const tabsEl = document.getElementById('workspace-preview-tabs');
  if (!tabsEl) return;
  
  if (workspaceState.openTabs.length === 0) {
    tabsEl.innerHTML = '';
    return;
  }
  
  tabsEl.innerHTML = workspaceState.openTabs.map(tab => `
    <div class="workspace-tab ${tab.path === workspaceState.activeTab ? 'active' : ''}" data-path="${escapeHtml(tab.path)}">
      <span class="workspace-tab-name">${escapeHtml(tab.name)}</span>
      <button class="workspace-tab-close" data-path="${escapeHtml(tab.path)}" title="关闭">×</button>
    </div>
  `).join('');
  
  tabsEl.querySelectorAll('.workspace-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (!e.target.classList.contains('workspace-tab-close')) {
        setActiveTab(tab.dataset.path);
      }
    });
  });
  
  tabsEl.querySelectorAll('.workspace-tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(btn.dataset.path);
    });
  });
}

function updatePreviewContent(content, filePath = null, size = null) {
  const contentEl = document.getElementById('workspace-preview-content');
  if (!contentEl) return;
  
  if (!content) {
    contentEl.innerHTML = '<div class="workspace-preview-empty">选择文件以预览</div>';
    return;
  }
  
  if (filePath && size !== null) {
    contentEl.innerHTML = `
      <div class="workspace-preview-file">
        <div class="preview-header">
          <span class="preview-filename">${escapeHtml(filePath)}</span>
          <span class="preview-size">${formatFileSize(size)}</span>
        </div>
        <pre>${escapeHtml(content)}</pre>
      </div>
    `;
  } else {
    contentEl.innerHTML = `<div class="workspace-preview-file"><pre>${escapeHtml(content)}</pre></div>`;
  }
}

// ============================
// Workspace Initialization
// ============================
async function initWorkspace() {
  // Load default workspace path from config
  try {
    const config = await window.api.configGet();
    const defaultPath = config.workspacePath || config.defaultWorkspacePath;
    if (defaultPath) {
      workspaceState.currentPath = defaultPath;
      document.getElementById('workspace-path-value').textContent = defaultPath;
      workspaceState.treeData = {};
      loadWorkspaceTree(defaultPath);
      // Update agent workspace path
      if (window.api.agentSetWorkspace) {
        window.api.agentSetWorkspace(currentSessionId || 'default', defaultPath);
      }
    }
  } catch (err) {
    console.error('Failed to load default workspace:', err);
  }
  
  document.getElementById('workspace-browse-btn')?.addEventListener('click', async () => {
    const dirPath = await window.api.workspaceBrowse();
    if (dirPath) {
      workspaceState.treeData = {};
      loadWorkspaceTree(dirPath);
      // Save to config so it persists across agent restarts
      try {
        await window.api.configSave({ workspacePath: dirPath });
      } catch (err) {
        console.error('Failed to save workspace path to config:', err);
      }
      // Update settings form if visible
      const settingsWorkspaceInput = document.getElementById('workspace-path');
      if (settingsWorkspaceInput) {
        settingsWorkspaceInput.value = dirPath;
      }
      // Update agent workspace path
      if (window.api.agentSetWorkspace) {
        window.api.agentSetWorkspace(currentSessionId || 'default', dirPath);
      }
    }
  });
  
  document.getElementById('workspace-refresh-btn')?.addEventListener('click', () => {
    if (workspaceState.currentPath) {
      workspaceState.treeData = {};
      loadWorkspaceTree(workspaceState.currentPath);
    }
  });
  
  document.getElementById('workspace-collapse-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('workspace-panel');
    
    if (panel) {
      workspaceState.collapsed = !workspaceState.collapsed;
      panel.classList.toggle('collapsed', workspaceState.collapsed);
    }
  });
  
  // Titlebar toggle workspace button
  document.getElementById('toggle-workspace-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('workspace-panel');
    
    if (panel) {
      workspaceState.collapsed = !workspaceState.collapsed;
      panel.classList.toggle('collapsed', workspaceState.collapsed);
    }
  });
  
  const resizeHandle = document.getElementById('workspace-resize-handle');
  const treeContainer = document.getElementById('workspace-tree-container');
  if (resizeHandle && treeContainer) {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = treeContainer.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const deltaY = e.clientY - startY;
      const newHeight = Math.max(100, Math.min(startHeight + deltaY, treeContainer.parentElement.offsetHeight * 0.7));
      treeContainer.style.maxHeight = newHeight + 'px';
      treeContainer.style.flex = '0 0 auto';
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
}

function loadSession(sessionId) {
  currentSessionId = sessionId;
  const sessions = loadSessions();
  const session = sessions[sessionId];
  chatMessages.innerHTML = '';
  if (!session) {
    restoreChatEmptyState();
    updateChatLayout();
    restoreStreamingState();
    syncInputAreaState(sessionId);
    return;
  }
  session.messages.forEach((m, index) => addMessage(m.text, m.sender, false, m.reasoning || '', m.toolCalls || [], '', index));
  if (session.messages.length === 0) restoreChatEmptyState();
  
  restoreStreamingState();
  
  syncInputAreaState(sessionId);
  
  syncWorkspacePath(session.workspacePath);
  
  renderSessionList();
}

function restoreChatEmptyState() {
  if (!chatMessages) return;
  let emptyState = document.getElementById('chat-empty-state');
  if (!emptyState) {
    emptyState = document.createElement('div');
    emptyState.className = 'chat-empty-state';
    emptyState.id = 'chat-empty-state';
    emptyState.innerHTML = `
      <div class="chat-empty-icon">⚡</div>
      <h2 class="chat-empty-title">使用 Hermes 开始对话</h2>
    `;
  }
  if (!chatMessages.contains(emptyState)) chatMessages.appendChild(emptyState);
}

function syncWorkspacePath(sessionWorkspacePath) {
  const targetPath = sessionWorkspacePath || workspaceState.currentPath;
  if (!targetPath) return;

  if (targetPath !== workspaceState.currentPath) {
    workspaceState.treeData = {};
    loadWorkspaceTree(targetPath);
  }
  // Always update agent workspace path for the current session
  if (currentSessionId && window.api.agentSetWorkspace) {
    window.api.agentSetWorkspace(currentSessionId, targetPath);
  }
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addMessage(text, sender = 'user', isStreaming = false, reasoning = '', toolCalls = [], sessionId = '', messageIndex = null) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  if (isStreaming) msg.classList.add('streaming');
  if (sessionId) msg.dataset.sessionId = sessionId;
  if (Number.isInteger(messageIndex)) msg.dataset.messageIndex = String(messageIndex);

  let innerHTML = '';
  if (sender === 'notice') {
    innerHTML += `<div class="message-notice">${escapeHtml(text)}</div>`;
  } else if (sender === 'agent') {
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
  if (!bubble) {
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    updateChatLayout();
    return msg;
  }
  bubble._rawText = text || '';
  bubble._rawReasoning = reasoning || '';
  bubble._toolCalls = {};
  
  // Restore tool calls
  if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach(tc => {
      bubble._toolCalls[tc.toolId] = {
        name: tc.name,
        args: tc.args,
        result: tc.result,
        status: tc.status || 'done'
      };
    });
  }
  
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Restore reasoning block if present
  if (reasoning) {
    const reasoningEl = document.createElement('div');
    reasoningEl.className = 'message-reasoning finished';
    reasoningEl.innerHTML = `
      <div class="message-reasoning-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="message-reasoning-label">思考完成</span>
        <svg class="message-reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="message-reasoning-content">${escapeHtml(reasoning)}</div>
    `;
    msg.insertBefore(reasoningEl, msg.firstChild);
  }
  
  // Render tool calls if present
  if (toolCalls && toolCalls.length > 0) {
    renderToolCalls(bubble);
  }
  
  if (sender === 'agent' && isStreaming) {
    currentAgentMessageEl = msg;
  }
  
  // Update chat layout (hide empty state, center input)
  updateChatLayout();
  
  return msg;
}

function showBackgroundReviewNotice(sessionId, text) {
  const cleanText = (text || '').replace(/^💾\s*/, '').trim();
  if (!cleanText) return;
  const displayText = cleanText.startsWith('Self-improvement review:')
    ? cleanText.replace(/^Self-improvement review:\s*/, 'Self-improvement: ')
    : cleanText;
  const messageIndex = addMessageToSessionById(sessionId, displayText, 'notice');
  if (sessionId === currentSessionId) {
    addMessage(displayText, 'notice', false, '', [], '', messageIndex);
  }
}

// Helper to find streaming message element by sessionId
function getStreamingMessageEl(sessionId) {
  if (!sessionId) return null;
  return chatMessages.querySelector(`.message.agent.streaming[data-session-id="${sessionId}"]`);
}

function updateStreamingMessage(sessionId, chunk) {
  // Update memory (always, regardless of DOM visibility)
  if (sessionId) {
    if (!streamingSessions[sessionId]) {
      streamingSessions[sessionId] = { text: '', reasoning: '', toolCalls: {} };
    }
    streamingSessions[sessionId].text += chunk;
  }

  // Update DOM only if this session is currently visible
  if (sessionId === currentSessionId) {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const bubble = msg.querySelector('.message-bubble');
      const toolCallsContainer = bubble.querySelector('.message-tool-calls');
      bubble._rawText = (bubble._rawText || '') + chunk;
      bubble.innerHTML = renderMarkdown(bubble._rawText);
      if (toolCallsContainer) {
        bubble.insertBefore(toolCallsContainer, bubble.firstChild);
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;
      currentAgentMessageEl = msg;
    }
  }
}

function updateReasoning(sessionId, text) {
  // Update memory
  if (sessionId) {
    if (!streamingSessions[sessionId]) {
      streamingSessions[sessionId] = { text: '', reasoning: '', toolCalls: {} };
    }
    streamingSessions[sessionId].reasoning += text;
  }

  // Update DOM only if visible
  if (sessionId === currentSessionId) {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const bubble = msg.querySelector('.message-bubble');
      bubble._rawReasoning = (bubble._rawReasoning || '') + text;
      let reasoningEl = msg.querySelector('.message-reasoning');
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
        msg.insertBefore(reasoningEl, msg.firstChild);
      }
      reasoningEl.querySelector('.message-reasoning-content').textContent = bubble._rawReasoning;
      chatMessages.scrollTop = chatMessages.scrollHeight;
      currentAgentMessageEl = msg;
    }
  }
}

function updateThinking(sessionId, text) {
  if (sessionId === currentSessionId) {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const reasoningEl = msg.querySelector('.message-reasoning-label');
      if (reasoningEl && text) {
        reasoningEl.textContent = text;
      } else if (reasoningEl && !text) {
        hideReasoning(sessionId);
      }
      currentAgentMessageEl = msg;
    }
  }
}

function hideReasoning(sessionId) {
  const msg = sessionId ? getStreamingMessageEl(sessionId) : currentAgentMessageEl;
  if (msg) {
    const reasoningEl = msg.querySelector('.message-reasoning');
    if (reasoningEl) {
      reasoningEl.classList.add('finished');
      const label = reasoningEl.querySelector('.message-reasoning-label');
      if (label) label.textContent = '思考完成';
    }
  }
}

function addToolCall(sessionId, toolId, name, args) {
  // Update memory
  if (sessionId) {
    if (!streamingSessions[sessionId]) {
      streamingSessions[sessionId] = { text: '', reasoning: '', toolCalls: {} };
    }
    streamingSessions[sessionId].toolCalls[toolId] = { name, args, result: null, status: 'running' };
  }

  // Update DOM only if visible
  if (sessionId === currentSessionId) {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const bubble = msg.querySelector('.message-bubble');
      const toolCalls = bubble._toolCalls || {};
      toolCalls[toolId] = { name, args, result: null, status: 'running' };
      bubble._toolCalls = toolCalls;
      renderToolCalls(bubble);
      currentAgentMessageEl = msg;
    }
  }
}

function updateToolCall(sessionId, toolId, result) {
  // Update memory
  if (sessionId && streamingSessions[sessionId]) {
    const tc = streamingSessions[sessionId].toolCalls[toolId];
    if (tc) {
      tc.result = result;
      tc.status = 'done';
    }
  }

  // Update DOM only if visible
  if (sessionId === currentSessionId) {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const bubble = msg.querySelector('.message-bubble');
      if (bubble) {
        const toolCalls = bubble._toolCalls || {};
        if (toolCalls[toolId]) {
          toolCalls[toolId].result = result;
          toolCalls[toolId].status = 'done';
        }
        renderToolCalls(bubble);
      }
      currentAgentMessageEl = msg;
    }
  }
}

function renderToolCallCard(toolId, tc) {
  const statusClass = tc.status === 'running' ? 'running' : (tc.result && tc.result.startsWith('ERROR') ? 'error' : 'done');
  const spinnerHtml = tc.status === 'running' ? '<span class="spinner"></span>' : '';
  const resultClass = tc.result && tc.result.startsWith('ERROR') ? 'error' : '';
  const statusText = tc.status === 'running' ? '执行中...' : (tc.result && tc.result.startsWith('ERROR') ? '失败' : '完成');
  return `<div class="message-tool-call" data-tool-id="${toolId}">
    <div class="message-tool-call-header" onclick="this.parentElement.classList.toggle('expanded')">
      <span class="message-tool-call-name">${escapeHtml(getToolDisplayName(tc.name))}</span>
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

  const running = entries.filter(([, tc]) => tc.status === 'running');
  const done = entries.filter(([, tc]) => tc.status !== 'running');

  const parts = [];

  if (done.length > 0) {
    const counts = {};
    let errorCount = 0;
    done.forEach(([, tc]) => {
      const key = getToolDisplayName(tc.name);
      counts[key] = (counts[key] || 0) + 1;
      if (tc.result && tc.result.startsWith('ERROR')) errorCount++;
    });
    const summaryBreakdown = Object.entries(counts)
      .map(([displayName, n]) => `${n} ${escapeHtml(displayName)}`)
      .join(', ');
    const successCount = done.length - errorCount;
    let summaryText = '';
    if (errorCount === 0) {
      summaryText = `✓ ${done.length} 个工具完成`;
    } else if (successCount === 0) {
      summaryText = `✕ ${done.length} 个工具失败`;
    } else {
      summaryText = `✓ ${successCount} 完成, ✕ ${errorCount} 失败`;
    }
    const groupId = 'tcg-' + Math.random().toString(36).slice(2, 8);
    const groupCards = done.map(([toolId, tc]) => renderToolCallCard(toolId, tc)).join('');
    parts.push(`<div class="message-tool-call-group collapsed" id="${groupId}">
      <div class="message-tool-call-group-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="message-tool-call-group-summary">${summaryText} <span class="message-tool-call-group-breakdown">(${summaryBreakdown})</span></span>
        <svg class="message-tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="message-tool-call-group-body">${groupCards}</div>
    </div>`);
  }

  running.forEach(([toolId, tc]) => {
    parts.push(renderToolCallCard(toolId, tc));
  });

  existingContainer.innerHTML = parts.join('');
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
  const sessionId = pendingPrompt.session_id || '';
  removePromptOverlay();
  try {
    await window.api.agentRespondToPrompt(sessionId, requestId, answer);
  } catch (err) {
    console.error('Respond to prompt failed:', err);
  }
}

function finalizeStreamingMessage(sessionId, errorText = null) {
  if (!sessionId) return;
  
  // Find streaming message by sessionId
  const msg = getStreamingMessageEl(sessionId);
  if (!msg) {
    // Clean up in-memory state
    delete streamingSessions[sessionId];
    return;
  }
  
  msg.classList.remove('streaming');
  hideReasoning(sessionId);
  const bubble = msg.querySelector('.message-bubble');
  const text = errorText !== null ? errorText : (bubble._rawText || bubble.textContent);
  const reasoning = bubble._rawReasoning || '';
  const toolCalls = bubble._toolCalls || {};
  const agentMessageIndex = addMessageToSession(text, 'agent', reasoning, toolCalls);
  if (Number.isInteger(agentMessageIndex)) msg.dataset.messageIndex = String(agentMessageIndex);
  
  // Clean up in-memory state
  delete streamingSessions[sessionId];
  
  // If this session is currently visible, update UI state
  if (sessionId === currentSessionId) {
    currentAgentMessageEl = null;
  }
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

function getAttachmentName(filePath) {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || filePath;
}

function renderSelectedAttachments() {
  if (!attachmentList) return;
  attachmentList.classList.toggle('has-attachments', selectedAttachments.length > 0);
  attachmentList.innerHTML = selectedAttachments.map((filePath, index) => `
    <div class="attachment-chip" title="${escapeHtml(filePath)}">
      <span class="attachment-chip-path">${escapeHtml(getAttachmentName(filePath))}</span>
      <button class="attachment-chip-remove" type="button" data-attachment-index="${index}" aria-label="移除附件">×</button>
    </div>
  `).join('');
}

function buildMessageWithAttachments(text, attachments) {
  if (!attachments.length) return text;
  const attachmentLines = attachments.map((filePath, index) => `${index + 1}. ${filePath}`).join('\n');
  const messageText = text || '请处理以下本机附件。';
  return `${messageText}\n\n附件路径（文件已经在本机，不需要上传，请直接按路径读取）：\n${attachmentLines}`;
}

async function selectAttachments() {
  if (!window.api.selectAttachments) return;
  try {
    const result = await window.api.selectAttachments();
    if (!result?.success) {
      addMessage(result?.error || '选择附件失败', 'agent');
      return;
    }
    const filePaths = Array.isArray(result.filePaths) ? result.filePaths : [];
    selectedAttachments = [...new Set([...selectedAttachments, ...filePaths])];
    renderSelectedAttachments();
    chatInput?.focus();
  } catch (err) {
    addMessage(`选择附件异常: ${err.message}`, 'agent');
  }
}

async function sendMessage() {
  const text = chatInput.value.trim();
  const attachments = [...selectedAttachments];
  if (!text && attachments.length === 0) return;
  if (!agentRunning) {
    addMessage('Agent 暂未连接，请在日志页面启动 Agent 后重试。', 'agent');
    return;
  }

  // Create new session if this is the first message
  if (!currentSessionId) {
    currentSessionId = createNewSession();
  }

  const messageForAgent = buildMessageWithAttachments(text, attachments);
  const userMessageIndex = addMessageToSession(messageForAgent, 'user');
  addMessage(messageForAgent, 'user', false, '', [], '', userMessageIndex);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  selectedAttachments = [];
  renderSelectedAttachments();
  updateChatLayout();

  sendBtn.disabled = true;
  sendBtn.textContent = '发送中...';
  if (stopBtn) stopBtn.style.display = '';

  // Build conversation history from current session
  const history = buildConversationHistory();

  try {
    const result = await window.api.agentSendMessage(currentSessionId, messageForAgent, history);
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
    if (currentSessionId) {
      await window.api.agentStopGeneration(currentSessionId);
    }
  } catch (err) { console.error('Stop generation failed:', err); }
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (stopBtn) stopBtn.addEventListener('click', stopGeneration);
if (attachBtn) attachBtn.addEventListener('click', selectAttachments);
if (attachmentList) {
  attachmentList.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.attachment-chip-remove');
    if (!removeBtn) return;
    const index = Number(removeBtn.dataset.attachmentIndex);
    if (!Number.isInteger(index)) return;
    selectedAttachments.splice(index, 1);
    renderSelectedAttachments();
  });
}
if (chatMessages) {
  chatMessages.addEventListener('contextmenu', (e) => {
    const messageEl = e.target.closest('.message');
    if (!messageEl || !chatMessages.contains(messageEl)) return;
    openMessageContextMenu(messageEl, e);
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#message-context-menu-active')) closeMessageContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMessageContextMenu();
});
if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
}

// Track if chat has messages (for centered input)
function updateChatLayout() {
  const chatArea = document.querySelector('.chat-area');
  const emptyState = document.getElementById('chat-empty-state');
  if (!chatArea) return;
  
  const hasMessages = chatMessages.children.length > 0 && 
    !(chatMessages.children.length === 1 && chatMessages.children[0].id === 'chat-empty-state');
  
  if (hasMessages) {
    chatArea.classList.remove('has-no-messages');
    if (emptyState) emptyState.style.display = 'none';
  } else {
    chatArea.classList.add('has-no-messages');
    if (emptyState) emptyState.style.display = 'flex';
  }
}

// Initial render
renderSessionList();
updateChatLayout();

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
    if (typeof updateCronStatusUI === 'function') updateCronStatusUI();
  });
  window.api.onAgentResponse((data) => {
    const sessionId = data.sessionId || '';
    switch (data.event) {
      case 'start':
        // Initialize streaming state for this session
        if (sessionId && !streamingSessions[sessionId]) {
          streamingSessions[sessionId] = { text: '', reasoning: '', toolCalls: {} };
        }
        // Only add DOM message if this session is currently visible
        if (sessionId === currentSessionId) {
          addMessage('', 'agent', true, '', [], sessionId);
        }
        break;
      case 'chunk':
        updateStreamingMessage(sessionId, data.data);
        break;
      case 'reasoning':
        updateReasoning(sessionId, data.data);
        break;
      case 'thinking':
        updateThinking(sessionId, data.data);
        break;
      case 'tool_start':
        addToolCall(sessionId, data.data.tool_id, data.data.name, data.data.args);
        break;
      case 'tool_complete':
        updateToolCall(sessionId, data.data.tool_id, data.data.result);
        break;
      case 'tool_progress':
        break;
      case 'tool_gen':
        break;
      case 'background_review':
        showBackgroundReviewNotice(sessionId, data.data);
        break;
      case 'clarify_request':
        showPromptOverlay('clarify_request', {
          session_id: sessionId,
          request_id: data.data.request_id,
          question: data.data.question,
          choices: data.data.choices,
        });
        break;
      case 'approval_request':
        showPromptOverlay('approval_request', {
          session_id: sessionId,
          request_id: data.data.request_id,
          command: data.data.command,
          description: data.data.description,
        });
        break;
      case 'sudo_request':
        showPromptOverlay('sudo_request', {
          session_id: sessionId,
          request_id: data.data.request_id,
        });
        break;
      case 'secret_request':
        showPromptOverlay('secret_request', {
          session_id: sessionId,
          request_id: data.data.request_id,
          env_var: data.data.env_var,
          prompt: data.data.prompt,
          metadata: data.data.metadata,
        });
        break;
      case 'complete':
        finalizeStreamingMessage(sessionId);
        if (sessionId === currentSessionId) {
          sendBtn.disabled = false;
          sendBtn.textContent = '发送';
          if (stopBtn) stopBtn.style.display = 'none';
        }
        break;
      case 'error':
        finalizeStreamingMessage(sessionId, data.data);
        if (sessionId === currentSessionId) {
          sendBtn.disabled = false;
          sendBtn.textContent = '发送';
          if (stopBtn) stopBtn.style.display = 'none';
        }
        break;
      case 'stopped':
        finalizeStreamingMessage(sessionId);
        if (sessionId === currentSessionId) {
          sendBtn.disabled = false;
          sendBtn.textContent = '发送';
          if (stopBtn) stopBtn.style.display = 'none';
        }
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
        <p class="wizard-desc">选择你的 AI 服务商并完成配置</p>
        <div class="form-group">
          <label for="wizard-api-format">API 格式</label>
          <select id="wizard-api-format">
            <option value="openai">OpenAI 兼容格式</option>
            <option value="anthropic">Anthropic 兼容格式</option>
          </select>
        </div>
        <div class="form-group">
          <label for="wizard-provider">服务商</label>
          <select id="wizard-provider"></select>
        </div>
        <div class="form-group" id="wizard-region-group" style="display: none;">
          <label for="wizard-provider-region">区域 / 套餐</label>
          <select id="wizard-provider-region"></select>
          <small class="form-hint" id="wizard-region-hint"></small>
        </div>
        <div class="form-group">
          <label for="wizard-api-key">API Key</label>
          <div class="input-with-action">
            <input type="password" id="wizard-api-key" placeholder="输入你的 API Key">
            <button id="wizard-toggle-api-key" class="btn-icon" title="显示/隐藏">👁</button>
          </div>
          <small class="form-hint" id="wizard-api-key-hint"></small>
        </div>
        <div class="form-group">
          <label for="wizard-model">默认模型（可选）</label>
          <select id="wizard-model-select">
            <option value="">留空自动选择</option>
          </select>
          <input type="text" id="wizard-model" placeholder="或手动输入模型 ID" style="margin-top: 6px;">
        </div>
        <button class="btn btn-primary wizard-next">下一步</button>
      </div>

      <div class="wizard-step" data-step="2" style="display:none">
        <h3>验证 API 连接</h3>
        <p class="wizard-desc">测试你的配置是否可以正常连接</p>
        <div id="wizard-test-status" class="wizard-status"></div>
        <button class="btn btn-secondary wizard-test-connection">测试连接</button>
        <div class="wizard-nav">
          <button class="btn btn-secondary wizard-prev">上一步</button>
          <button class="btn btn-primary wizard-next">下一步</button>
          <button class="btn btn-text wizard-skip-test">跳过</button>
        </div>
      </div>

      <div class="wizard-step" data-step="3" style="display:none">
        <h3>授权飞书</h3>
        <p class="wizard-desc">点击下方按钮，在浏览器中完成授权（可稍后在设置中完成）</p>
        <button class="btn btn-primary wizard-auth-feishu">开始授权</button>
        <div id="wizard-feishu-status" class="wizard-status"></div>
        <div class="wizard-nav">
          <button class="btn btn-secondary wizard-prev">上一步</button>
          <button class="btn btn-primary wizard-next">下一步</button>
          <button class="btn btn-text wizard-skip">跳过</button>
        </div>
      </div>

      <div class="wizard-step" data-step="4" style="display:none">
        <h3>授权钉钉</h3>
        <p class="wizard-desc">点击下方按钮，在浏览器中完成授权（可稍后在设置中完成）</p>
        <button class="btn btn-primary wizard-auth-dingtalk">开始授权</button>
        <div id="wizard-dingtalk-status" class="wizard-status"></div>
        <div class="wizard-nav">
          <button class="btn btn-secondary wizard-prev">上一步</button>
          <button class="btn btn-primary wizard-next">下一步</button>
          <button class="btn btn-text wizard-skip">跳过</button>
        </div>
      </div>

      <div class="wizard-step" data-step="5" style="display:none">
        <h3>设置完成</h3>
        <p class="wizard-desc">一切就绪，开始使用吧！</p>
        <button class="btn btn-primary wizard-done">开始使用</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let currentStep = 1;
  const wizardConfig = { apiFormat: 'openai', provider: '', providerRegion: '', apiKey: '', baseUrl: '', model: '' };

  function wizardUpdateProviderOptions() {
    const format = document.getElementById('wizard-api-format').value;
    const providers = getProvidersByFormat(format);
    const select = document.getElementById('wizard-provider');
    select.innerHTML = providers.map(p =>
      `<option value="${p.key}">${p.label}</option>`
    ).join('');
    wizardUpdateProviderUI();
  }

  function wizardUpdateRegionOptions() {
    const provider = findProviderByKey(document.getElementById('wizard-provider').value);
    const group = document.getElementById('wizard-region-group');
    const select = document.getElementById('wizard-provider-region');
    const hint = document.getElementById('wizard-region-hint');
    const baseUrlInput = document.getElementById('wizard-base-url') || document.getElementById('wizard-api-key')?.closest('.wizard-modal')?.querySelector('[data-base-url]');
    if (provider && provider.regions && provider.regions.length > 0) {
      select.innerHTML = provider.regions.map(r =>
        `<option value="${r.key}">${r.label}</option>`
      ).join('');
      group.style.display = '';
      if (hint) hint.textContent = '不同套餐对应不同 API Key，请确认选择了正确的区域';
    } else {
      group.style.display = 'none';
      if (hint) hint.textContent = '';
    }
  }

  function wizardUpdateModelOptions() {
    const provider = findProviderByKey(document.getElementById('wizard-provider').value);
    const select = document.getElementById('wizard-model-select');
    if (provider && provider.models && provider.models.length > 0) {
      select.innerHTML = '<option value="">留空自动选择</option>' +
        provider.models.map(m => `<option value="${m}">${m}</option>`).join('');
    } else {
      select.innerHTML = '<option value="">留空自动选择</option>';
    }
  }

  function wizardUpdateProviderUI() {
    const provider = findProviderByKey(document.getElementById('wizard-provider').value);
    if (!provider) return;
    const hint = document.getElementById('wizard-api-key-hint');
    if (hint) hint.textContent = provider.envLabel || '';
    wizardUpdateRegionOptions();
    wizardUpdateModelOptions();
  }

  document.getElementById('wizard-toggle-api-key')?.addEventListener('click', () => {
    const input = document.getElementById('wizard-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    document.getElementById('wizard-toggle-api-key').textContent = input.type === 'password' ? '👁' : '👁‍🗨';
  });

  document.getElementById('wizard-api-format')?.addEventListener('change', () => {
    wizardUpdateProviderOptions();
  });
  document.getElementById('wizard-provider')?.addEventListener('change', () => {
    wizardUpdateProviderUI();
  });
  document.getElementById('wizard-provider-region')?.addEventListener('change', () => {
    wizardUpdateProviderUI();
  });
  document.getElementById('wizard-model-select')?.addEventListener('change', () => {
    const v = document.getElementById('wizard-model-select').value;
    if (v) document.getElementById('wizard-model').value = v;
  });

  wizardUpdateProviderOptions();

  function goToStep(step) {
    overlay.querySelectorAll('.wizard-step').forEach(s => s.style.display = 'none');
    overlay.querySelector(`.wizard-step[data-step="${step}"]`).style.display = '';
    currentStep = step;
  }

  function collectWizardConfig() {
    const provider = findProviderByKey(document.getElementById('wizard-provider').value);
    wizardConfig.apiFormat = document.getElementById('wizard-api-format').value;
    wizardConfig.provider = document.getElementById('wizard-provider').value;
    wizardConfig.providerRegion = document.getElementById('wizard-provider-region')?.value || '';
    wizardConfig.apiKey = document.getElementById('wizard-api-key').value;
    wizardConfig.baseUrl = provider ? (provider.regions && wizardConfig.providerRegion
      ? (provider.regions.find(r => r.key === wizardConfig.providerRegion)?.baseUrl || provider.baseUrl)
      : provider.baseUrl) : '';
    wizardConfig.model = document.getElementById('wizard-model').value;
    return wizardConfig;
  }

  overlay.querySelectorAll('.wizard-next').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (currentStep === 1) {
        collectWizardConfig();
        await window.api.configSave(wizardConfig);
        goToStep(2);
      } else if (currentStep === 2) { goToStep(3); }
      else if (currentStep === 3) { goToStep(4); }
      else if (currentStep === 4) { goToStep(5); }
    });
  });

  overlay.querySelector('.wizard-prev')?.addEventListener('click', () => goToStep(currentStep - 1));

  overlay.querySelector('.wizard-skip-test')?.addEventListener('click', () => goToStep(3));

  overlay.querySelectorAll('.wizard-skip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep === 3) goToStep(4);
      else if (currentStep === 4) goToStep(5);
    });
  });

  overlay.querySelector('.wizard-close').addEventListener('click', () => overlay.remove());

  overlay.querySelector('.wizard-test-connection')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = '测试中...';
    const statusEl = document.getElementById('wizard-test-status');
    collectWizardConfig();
    const defaultModel = wizardConfig.apiFormat === 'anthropic' ? 'claude-sonnet-4.6' : 'gpt-4o-mini';
    try {
      const result = await window.api.testApiConnection({
        baseUrl: wizardConfig.baseUrl,
        apiKey: wizardConfig.apiKey,
        model: wizardConfig.model || defaultModel,
        apiFormat: wizardConfig.apiFormat || 'openai',
      });
      if (result.success) {
        statusEl.className = 'wizard-status success';
        statusEl.textContent = `✓ 连接成功！模型: ${result.model || '未知'}`;
      } else {
        statusEl.className = 'wizard-status error';
        let errMsg = `✗ 连接失败: ${result.error || '未知错误'}`;
        if (result.debug) {
          errMsg += `\nURL: ${result.debug.fullUrl}\nKey长度: ${result.debug.authLength}\n认证: ${result.debug.authHeader}`;
        }
        statusEl.textContent = errMsg;
      }
    } catch (err) {
      statusEl.className = 'wizard-status error';
      statusEl.textContent = `✗ 连接异常: ${err.message}`;
    }
    btn.disabled = false; btn.textContent = '测试连接';
  });

  overlay.querySelector('.wizard-auth-feishu')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = '授权中...';
    const statusEl = document.getElementById('wizard-feishu-status');
    try {
      const result = await window.api.authFeishu();
      statusEl.textContent = result.success ? `✓ 已授权: ${result.userName}` : `✗ ${result.error}`;
      if (result.success) setAuthState('feishu', true, result.userName, result.version);
    } catch (err) { statusEl.textContent = `✗ ${err.message}`; }
    btn.disabled = false; btn.textContent = '开始授权';
  });

  overlay.querySelector('.wizard-auth-dingtalk')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = '授权中...';
    const statusEl = document.getElementById('wizard-dingtalk-status');
    try {
      const result = await window.api.authDingtalk();
      statusEl.textContent = result.success ? `✓ 已授权: ${result.userName}` : `✗ ${result.error}`;
      if (result.success) setAuthState('dingtalk', true, result.userName, result.version);
    } catch (err) { statusEl.textContent = `✗ ${err.message}`; }
    btn.disabled = false; btn.textContent = '开始授权';
  });

  overlay.querySelector('.wizard-done').addEventListener('click', async () => { overlay.remove(); checkAuthStatus(); loadConfig(); await agentAction('start'); });
}

// ============================
// Skills Page
// ============================
const skillsState = {
  currentTab: 'builtin',
  skills: { builtin: [], user: [], agent: [] },
  selectedSkill: null,
  detailVisible: false,
  categories: new Set(),
  searchQuery: '',
  statusFilter: '',
  categoryFilter: '',
};

function initSkillsPage() {
  setupSkillsTabs();
  setupSkillsToolbar();
  setupSkillsDetailPanel();
  loadSkillsList();
}

  function setupSkillsTabs() {
    document.querySelectorAll('.skills-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.skills-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        skillsState.currentTab = tab.dataset.tab;
        loadSkillsList();
        updateToolbarActions();
      });
    });
  }

function updateToolbarActions() {
  const newBtn = document.getElementById('new-skill-btn');
  if (!newBtn) return;
  newBtn.style.display = skillsState.currentTab === 'user' ? '' : 'none';
}

function setupSkillsToolbar() {
  const searchInput = document.getElementById('skills-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        skillsState.searchQuery = searchInput.value.trim();
        renderSkillsTable();
      }, 200);
    });
  }

  const categoryFilter = document.getElementById('skills-category-filter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      skillsState.categoryFilter = categoryFilter.value;
      renderSkillsTable();
    });
  }

  const statusFilter = document.getElementById('skills-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      skillsState.statusFilter = statusFilter.value;
      renderSkillsTable();
    });
  }

  const refreshBtn = document.getElementById('refresh-skills-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadSkillsList());
  }

  const newBtn = document.getElementById('new-skill-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => showNewSkillDialog());
  }

  const body = document.getElementById('skills-table-body');
  if (body) {
    body.addEventListener('change', async (e) => {
      if (e.target.classList.contains('skill-status-toggle')) {
        const skillName = e.target.dataset.skillName;
        const enabled = e.target.checked;
        await window.api.skillsSetEnabled(skillName, enabled);
        loadSkillsList();
      }
    });

    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('.delete-btn, .archive-btn');
      if (btn) {
        const skillPath = btn.dataset.skillPath;
        if (btn.classList.contains('delete-btn')) {
          if (confirm('确定删除此skill？')) {
            await window.api.skillsDelete(skillPath);
            loadSkillsList();
            closeSkillDetail();
          }
        } else if (btn.classList.contains('archive-btn')) {
          await window.api.skillsArchive(skillPath);
          loadSkillsList();
          closeSkillDetail();
        }
        return;
      }

      const row = e.target.closest('.skills-table-row');
      if (row && !e.target.closest('.skill-action-btn, .skill-status-toggle')) {
        const skillPath = row.dataset.skillPath;
        const skills = skillsState.skills[skillsState.currentTab];
        const skill = skills.find(s => s.path === skillPath);
        if (skill) openSkillDetail(skill);
      }
    });
  }
}

function setupSkillsDetailPanel() {
  const closeBtn = document.getElementById('detail-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeSkillDetail);
  
  document.querySelectorAll('.detail-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchDetailTab(tab.dataset.detailTab);
    });
  });
  
  const saveBtn = document.getElementById('detail-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSkillDetail);
  
  const cancelBtn = document.getElementById('detail-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelSkillEdit);
}

async function openSkillDetail(skill) {
  skillsState.selectedSkill = skill;
  skillsState.detailVisible = true;
  
  const panel = document.getElementById('skills-detail-panel');
  if (panel) {
    panel.style.display = '';
    requestAnimationFrame(() => panel.classList.add('visible'));
  }
  
  const nameEl = document.getElementById('detail-skill-name');
  const badgeEl = document.getElementById('detail-source-badge');
  const statusToggle = document.getElementById('detail-status-toggle');
  
  if (nameEl) nameEl.textContent = skill.name;
  if (badgeEl) {
    badgeEl.textContent = skill.source;
    badgeEl.className = `detail-source-badge ${skill.source}`;
  }
  if (statusToggle) statusToggle.style.display = skill.source === 'builtin' ? '' : 'none';
  
  document.querySelectorAll('.detail-tab-btn').forEach(t => t.classList.remove('active'));
  const contentTab = document.querySelector('.detail-tab-btn[data-detail-tab="content"]');
  if (contentTab) contentTab.classList.add('active');
  switchDetailTab('content');
  
  if (skill.skillMdContent) {
    const markdownEl = document.getElementById('detail-markdown');
    if (markdownEl) markdownEl.innerHTML = renderMarkdown(skill.skillMdContent);
  }
  
  if (skill.source !== 'builtin') {
    const header = document.getElementById('detail-header');
    if (header && !document.getElementById('detail-edit-btn')) {
      const editBtn = document.createElement('button');
      editBtn.id = 'detail-edit-btn';
      editBtn.className = 'skill-action-btn';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', startSkillEdit);
      header.insertBefore(editBtn, statusToggle);
    }
  } else {
    const existingBtn = document.getElementById('detail-edit-btn');
    if (existingBtn) existingBtn.remove();
  }
}

function closeSkillDetail() {
  skillsState.selectedSkill = null;
  skillsState.detailVisible = false;
  
  const panel = document.getElementById('skills-detail-panel');
  if (panel) {
    panel.classList.remove('visible');
    setTimeout(() => { panel.style.display = 'none'; }, 200);
  }
  
  const existingBtn = document.getElementById('detail-edit-btn');
  if (existingBtn) existingBtn.remove();
}

function switchDetailTab(tabName) {
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  
  if (tabName === 'content') {
    if (content) content.style.display = '';
    if (editor) editor.style.display = 'none';
    
    if (skillsState.selectedSkill?.skillMdContent) {
      const markdownEl = document.getElementById('detail-markdown');
      if (markdownEl) markdownEl.innerHTML = renderMarkdown(skillsState.selectedSkill.skillMdContent);
    }
  } else if (tabName === 'files') {
    if (content) content.style.display = '';
    if (editor) editor.style.display = 'none';
    loadSkillFiles();
  }
}

async function loadSkillFiles() {
  const skill = skillsState.selectedSkill;
  if (!skill) return;
  
  const content = document.getElementById('detail-content');
  if (!content) return;
  
  const result = await window.api.skillsListFiles(skill.path);
  if (!result.success) {
    content.innerHTML = '<p class="empty-state-text">加载文件失败</p>';
    return;
  }
  
  const files = result.files || [];
  if (files.length === 0) {
    content.innerHTML = '<p class="empty-state-text">无文件</p>';
    return;
  }
  
  content.innerHTML = `
    <div class="detail-file-tree">
      ${files.map(file => `
        <div class="detail-file-item" data-file-path="${escapeHtml(file.path)}">
          <span class="detail-file-icon">${file.isDirectory ? '📁' : '📄'}</span>
          <span class="detail-file-name">${escapeHtml(file.name)}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  content.querySelectorAll('.detail-file-item').forEach(item => {
    item.addEventListener('click', async () => {
      const filePath = item.dataset.filePath;
      const file = files.find(f => f.path === filePath);
      if (file && !file.isDirectory) await openFileEditor(filePath);
    });
  });
}

async function openFileEditor(filePath) {
  const result = await window.api.skillsGetFile(filePath);
  if (!result.success) {
    alert('加载文件失败: ' + result.error);
    return;
  }
  
  const textarea = document.getElementById('detail-editor-textarea');
  if (textarea) {
    textarea.value = result.content;
    textarea.dataset.filePath = filePath;
  }
  
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  if (content) content.style.display = 'none';
  if (editor) editor.classList.add('visible');
}

function startSkillEdit() {
  const skill = skillsState.selectedSkill;
  if (!skill) return;
  
  const textarea = document.getElementById('detail-editor-textarea');
  if (textarea) {
    textarea.value = skill.skillMdContent || '';
    textarea.dataset.filePath = skill.skillMdPath;
  }
  
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  if (content) content.style.display = 'none';
  if (editor) editor.classList.add('visible');
}

async function saveSkillDetail() {
  const textarea = document.getElementById('detail-editor-textarea');
  if (!textarea) return;
  
  const filePath = textarea.dataset.filePath;
  const content = textarea.value;
  
  const result = await window.api.skillsWriteFile(filePath, content);
  if (!result.success) {
    alert('保存失败: ' + result.error);
    return;
  }
  
  if (skillsState.selectedSkill) {
    skillsState.selectedSkill.skillMdContent = content;
  }
  
  cancelSkillEdit();
  loadSkillsList();
}

function cancelSkillEdit() {
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  if (content) content.style.display = '';
  if (editor) editor.classList.remove('visible');
}

function showNewSkillDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'new-skill-dialog-overlay';
  overlay.innerHTML = `
    <div class="new-skill-dialog">
      <div class="new-skill-dialog-header">创建新Skill</div>
      <div class="new-skill-dialog-body">
        <div class="form-group">
          <label for="new-skill-name">名称 (必填)</label>
          <input type="text" id="new-skill-name" placeholder="skill名称">
        </div>
        <div class="form-group">
          <label for="new-skill-description">描述 (必填)</label>
          <input type="text" id="new-skill-description" placeholder="skill描述">
        </div>
        <div class="form-group">
          <label for="new-skill-category">分类 (可选)</label>
          <input type="text" id="new-skill-category" placeholder="general">
        </div>
        <div class="form-group">
          <label for="new-skill-template">模板 (可选)</label>
          <select id="new-skill-template">
            <option value="">空模板</option>
            <option value="feishu">飞书模板</option>
            <option value="dingtalk">钉钉模板</option>
            <option value="office">Office模板</option>
          </select>
        </div>
      </div>
      <div class="new-skill-dialog-footer">
        <button class="btn btn-secondary" id="new-skill-cancel">取消</button>
        <button class="btn btn-primary" id="new-skill-create">创建</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('#new-skill-cancel').addEventListener('click', () => overlay.remove());
  
  overlay.querySelector('#new-skill-create').addEventListener('click', async () => {
    const name = overlay.querySelector('#new-skill-name').value.trim();
    const description = overlay.querySelector('#new-skill-description').value.trim();
    const category = overlay.querySelector('#new-skill-category').value.trim() || 'general';
    const template = overlay.querySelector('#new-skill-template').value;
    
    if (!name || !description) {
      alert('请填写名称和描述');
      return;
    }
    
    let content = '';
    switch (template) {
      case 'feishu':
        content = '## 飞书技能\n\n使用 lark-cli 命令行工具操作飞书。\n\n### 常用命令\n\n\`\`\`bash\nlark-cli user info\nlark-cli doc list\n\`\`\`';
        break;
      case 'dingtalk':
        content = '## 钉钉技能\n\n使用 dws 命令行工具操作钉钉。\n\n### 常用命令\n\n\`\`\`bash\ndws user info\ndws doc list\n\`\`\`';
        break;
      case 'office':
        content = '## Office技能\n\n处理Office文档相关操作。\n\n### 使用方法\n\n描述你的skill使用方式。';
        break;
      default:
        content = '# New Skill\n\n描述你的skill。';
    }
    
    const result = await window.api.skillsCreate({ name, description, category, content });
    
    if (result.success) {
      overlay.remove();
      loadSkillsList();
    } else {
      alert('创建失败: ' + result.error);
    }
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

async function loadSkillsList() {
  try {
    const result = await window.api.skillsList();
    if (!result || !result.success) {
      console.error('Failed to load skills:', result?.error || 'Unknown error');
      skillsState.skills = { builtin: [], user: [], agent: [] };
      renderSkillsTable();
      return;
    }

    skillsState.skills = {
      builtin: Array.isArray(result.builtin) ? result.builtin : [],
      user: Array.isArray(result.user) ? result.user : [],
      agent: Array.isArray(result.agent) ? result.agent : [],
    };

    skillsState.categories = new Set();
    ['builtin', 'user', 'agent'].forEach(source => {
      skillsState.skills[source].forEach(skill => {
        if (skill.category) skillsState.categories.add(skill.category);
      });
    });

    updateCategoryFilter();
    renderSkillsTable();
  } catch (err) {
    console.error('loadSkillsList error:', err);
    skillsState.skills = { builtin: [], user: [], agent: [] };
    renderSkillsTable();
  }
}

function updateCategoryFilter() {
  const select = document.getElementById('skills-category-filter');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">全部分类</option>';

  Array.from(skillsState.categories).sort().forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });

  select.value = currentValue;
}

function getFilteredSkills() {
  const skills = skillsState.skills[skillsState.currentTab] || [];

  return skills.filter(skill => {
    if (skillsState.searchQuery) {
      const q = skillsState.searchQuery.toLowerCase();
      if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false;
    }

    if (skillsState.categoryFilter && skill.category !== skillsState.categoryFilter) return false;

    if (skillsState.statusFilter) {
      if (skillsState.currentTab === 'agent') {
        if (skill.curatorState !== skillsState.statusFilter) return false;
      } else {
        if (skill.status !== skillsState.statusFilter) return false;
      }
    }

    return true;
  });
}

function renderSkillsTable() {
  const body = document.getElementById('skills-table-body');
  const header = document.getElementById('skills-table-header');
  if (!body || !header) return;

  const tab = skillsState.currentTab;
  const skills = getFilteredSkills();

  header.className = `skills-table-header ${tab}`;
  header.innerHTML = getTabHeaderHTML(tab);

  if (skills.length === 0) {
    body.innerHTML = '<div class="empty-state-text">暂无skills</div>';
    return;
  }

  body.innerHTML = skills.map(skill => `
    <div class="skills-table-row ${tab}" data-skill-path="${escapeHtml(skill.path)}">
      ${getTabRowHTML(tab, skill)}
    </div>
  `).join('');

  body.querySelectorAll('.skills-row-path[data-path]').forEach(pathEl => {
    const isOverflow = pathEl.scrollWidth > pathEl.clientWidth;
    if (isOverflow) {
      let tooltip = null;
      pathEl.addEventListener('mouseenter', (e) => {
        tooltip = document.createElement('div');
        tooltip.className = 'session-title-tooltip';
        tooltip.textContent = pathEl.dataset.path;
        document.body.appendChild(tooltip);
        const rect = pathEl.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 4) + 'px';
        tooltip.style.left = rect.left + 'px';
      });
      pathEl.addEventListener('mouseleave', () => {
        if (tooltip) {
          tooltip.remove();
          tooltip = null;
        }
      });
    }
  });
}

function getTabHeaderHTML(tab) {
  const headers = {
    builtin: '<span>Icon</span><span>Name</span><span>Description</span><span>Category</span><span>Path</span><span>Status</span><span>Actions</span>',
    user: '<span>Icon</span><span>Name</span><span>Description</span><span>Path</span><span>Created</span><span>Status</span><span>Actions</span>',
    agent: '<span>Icon</span><span>Name</span><span>Description</span><span>Uses</span><span>Last Activity</span><span>Path</span><span>State</span><span>Actions</span>',
  };
  return headers[tab] || '';
}

function formatSkillPath(fullPath, tab) {
  const dirPath = fullPath.replace(/\/SKILL\.md$/, '');
  let displayPath;
  
  if (tab === 'builtin') {
    const match = dirPath.match(/hermes-agent\/(skills|optional-skills)\/(.+)$/);
    if (match) {
      displayPath = `${match[1]}/${match[2]}`;
    } else {
      const idx = dirPath.lastIndexOf('hermes-agent');
      if (idx !== -1) {
        displayPath = dirPath.substring(idx + 14);
      } else {
        displayPath = dirPath.split('/').pop() || dirPath;
      }
    }
  } else if (tab === 'user' || tab === 'agent') {
    if (dirPath.includes('/.agents/skills/')) {
      const match = dirPath.match(/\.agents\/skills\/(.+)$/);
      displayPath = match ? `~/.agents/skills/${match[1]}` : dirPath;
    } else if (dirPath.includes('/.hermes/skills/')) {
      const match = dirPath.match(/\.hermes\/skills\/(.+)$/);
      displayPath = match ? `~/.hermes/skills/${match[1]}` : dirPath;
    } else {
      displayPath = dirPath;
    }
  }
  
  if (displayPath.length > 50) {
    displayPath = displayPath.substring(0, 47) + '...';
  }
  return displayPath;
}

function getTabRowHTML(tab, skill) {
  const icon = tab === 'builtin' ? '📚' : tab === 'agent' ? '🤖' : '📝';
  const desc = skill.description || '';
  const truncatedDesc = desc.length > 60 ? desc.substring(0, 60) + '...' : desc;

  if (tab === 'builtin') {
    const displayPath = formatSkillPath(skill.path, 'builtin');
    return `
      <span class="skills-row-icon">${icon}</span>
      <span class="skills-row-name">${escapeHtml(skill.name)}</span>
      <span class="skills-row-desc" title="${escapeHtml(desc)}">${escapeHtml(truncatedDesc)}</span>
      <span class="skills-row-category">${escapeHtml(skill.category || '-')}</span>
      <span class="skills-row-path" data-path="${escapeHtml(skill.path.replace(/\/SKILL\.md$/, ''))}">${escapeHtml(displayPath)}</span>
      <span class="skills-row-status">
        <label class="toggle-label">
          <input type="checkbox" ${skill.status === 'enabled' ? 'checked' : ''} data-skill-name="${escapeHtml(skill.name)}" class="skill-status-toggle">
          <span class="toggle-slider"></span>
        </label>
      </span>
      <span class="skills-row-actions">
      </span>
    `;
  }

  if (tab === 'user') {
    const displayPath = formatSkillPath(skill.path, 'user');
    const created = skill.created ? new Date(skill.created).toLocaleDateString() : '-';
    return `
      <span class="skills-row-icon">${icon}</span>
      <span class="skills-row-name">${escapeHtml(skill.name)}</span>
      <span class="skills-row-desc" title="${escapeHtml(desc)}">${escapeHtml(truncatedDesc)}</span>
      <span class="skills-row-path" data-path="${escapeHtml(skill.path.replace(/\/SKILL\.md$/, ''))}">${escapeHtml(displayPath)}</span>
      <span class="skills-row-created">${created}</span>
      <span class="skills-row-status">
        <label class="toggle-label">
          <input type="checkbox" ${skill.status === 'enabled' ? 'checked' : ''} data-skill-name="${escapeHtml(skill.name)}" class="skill-status-toggle">
          <span class="toggle-slider"></span>
        </label>
      </span>
      <span class="skills-row-actions">
        <button class="skill-action-btn danger delete-btn" data-skill-path="${escapeHtml(skill.path)}">删除</button>
      </span>
    `;
  }

  if (tab === 'agent') {
    const useCount = skill.useCount || 0;
    const lastActivity = skill.lastActivity ? new Date(skill.lastActivity).toLocaleDateString() : '-';
    const curatorState = skill.curatorState || 'active';
    const displayPath = formatSkillPath(skill.path, 'agent');
    return `
      <span class="skills-row-icon">${icon}</span>
      <span class="skills-row-name">${escapeHtml(skill.name)}</span>
      <span class="skills-row-desc" title="${escapeHtml(desc)}">${escapeHtml(truncatedDesc)}</span>
      <span class="skills-row-use-count">${useCount}</span>
      <span class="skills-row-last-activity">${lastActivity}</span>
      <span class="skills-row-path" data-path="${escapeHtml(skill.path.replace(/\/SKILL\.md$/, ''))}">${escapeHtml(displayPath)}</span>
      <span class="skills-row-curator-state ${curatorState}">${curatorState}</span>
      <span class="skills-row-actions">
        <button class="skill-action-btn archive-btn" data-skill-path="${escapeHtml(skill.path)}">归档</button>
      </span>
    `;
  }

  return '';
}

// ============================
// New Chat Button
// ============================
document.getElementById('new-chat-btn')?.addEventListener('click', () => {
  currentSessionId = null;
  chatMessages.innerHTML = '';
  restoreChatEmptyState();
  updateChatLayout();
  renderSessionList();
});

// ============================
// Init
// ============================
// Initialize cascading selectors
updateApiFormatOptions();
updateProviderOptions();
initWorkspace();
loadConfig();
checkFirstRun();
updateStatus('status-agent', 'error');
checkAuthStatus();
initSkillsPage();

// Auto-start Agent on launch (only if configured)
async function autoStartAgent() {
  try {
    const config = await window.api.configGet();
    if (!config.autoStart) return;
    // Only auto-start if a provider or API key is configured
    const hasConfig = config.provider && config.provider !== 'auto' || config.apiKey;
    if (!hasConfig) return;
    appendLog('[INFO] 自动启动 Agent...');
    const result = await window.api.agentStart(config);
    if (result && result.success) {
      updateStatus('status-agent', 'success');
      agentRunning = true;
      appendLog('[INFO] Agent 已自动启动');
      if (typeof updateCronStatusUI === 'function') updateCronStatusUI();
    } else {
      appendLog(`[ERROR] Agent 启动失败: ${result?.error || '未知错误'}`);
    }
  } catch (err) {
    appendLog(`[ERROR] Agent 自动启动失败: ${err.message}`);
    console.warn('Auto-start Agent failed:', err.message);
  }
}
autoStartAgent();

// ============================
// Cron Page
// ============================
const cronEls = {
  list: document.getElementById('cron-list'),
  statusBadge: document.getElementById('cron-status-badge'),
  newBtn: document.getElementById('new-cron-btn'),
  modal: document.getElementById('cron-modal'),
  modalTitle: document.getElementById('cron-modal-title'),
  modalClose: document.getElementById('cron-modal-close'),
  modalCancel: document.getElementById('cron-modal-cancel'),
  modalSave: document.getElementById('cron-modal-save'),
  name: document.getElementById('cron-name'),
  prompt: document.getElementById('cron-prompt'),
  repeat: document.getElementById('cron-repeat'),
  workdir: document.getElementById('cron-workdir'),
  browseWorkdir: document.getElementById('cron-browse-workdir'),
  scheduleIntervalGroup: document.getElementById('cron-schedule-interval-group'),
  scheduleCronGroup: document.getElementById('cron-schedule-cron-group'),
  scheduleOnceGroup: document.getElementById('cron-schedule-once-group'),
  scheduleValue: document.getElementById('cron-schedule-value'),
  scheduleUnit: document.getElementById('cron-schedule-unit'),
  scheduleCron: document.getElementById('cron-schedule-cron'),
  scheduleOnce: document.getElementById('cron-schedule-once'),
  recurring: document.getElementById('cron-recurring'),
};

let cronJobs = [];
let editingCronJobId = null;
let cronEngineRunning = false;

async function loadCronJobs() {
  const result = await window.api.cronList();
  if (result.success) {
    cronJobs = result.jobs;
    renderCronList();
  }
}

function updateCronStatusUI() {
  if (!cronEls.statusBadge) return;
  if (!agentRunning) {
    cronEls.statusBadge.textContent = 'Agent 未启动';
    cronEls.statusBadge.className = 'cron-status-badge no-agent';
  } else if (cronEngineRunning) {
    cronEls.statusBadge.textContent = '执行中';
    cronEls.statusBadge.className = 'cron-status-badge running';
  } else {
    cronEls.statusBadge.textContent = '已停止';
    cronEls.statusBadge.className = 'cron-status-badge stopped';
  }
}

function renderCronList() {
  if (!cronEls.list) return;
  if (cronJobs.length === 0) {
    cronEls.list.innerHTML = '<div class="empty-state-text">暂无定时任务，点击"新建任务"创建</div>';
    return;
  }

  let html = '';
  for (const job of cronJobs) {
    const statusClass = job.state || 'scheduled';
    const statusText = {
      scheduled: '等待中',
      running: '执行中',
      paused: '已暂停',
      error: '错误',
      completed: '已完成',
    }[statusClass] || statusClass;

    const nextRun = job.next_run_at ? formatRelativeTime(job.next_run_at) : '-';
    const lastRun = job.last_run_at ? formatRelativeTime(job.last_run_at) : '-';
    const schedule = typeof job.schedule_display === 'string' ? job.schedule_display : (typeof job.schedule === 'string' ? job.schedule : '-');

    html += `
      <div class="cron-card" data-job-id="${job.id}">
        <div class="cron-card-header">
          <span class="cron-card-name">${escapeHtml(job.name || '未命名任务')}</span>
          <span class="cron-card-status ${statusClass}">${statusText}</span>
        </div>
        <div class="cron-card-meta">
          <span>📅 ${escapeHtml(schedule)}</span>
          <span>⏰ 下次: ${nextRun}</span>
          <span>🕐 上次: ${lastRun}</span>
        </div>
        ${job.prompt ? `<div class="cron-card-prompt">${escapeHtml(job.prompt)}</div>` : ''}
        <div class="cron-card-actions">
          ${job.state === 'paused'
            ? `<button class="btn btn-secondary btn-resume" data-job-id="${job.id}">恢复</button>`
            : `<button class="btn btn-secondary btn-pause" data-job-id="${job.id}">暂停</button>`
          }
          <button class="btn btn-secondary btn-trigger" data-job-id="${job.id}">立即执行</button>
          <button class="btn btn-secondary btn-edit" data-job-id="${job.id}">编辑</button>
          <button class="btn btn-secondary btn-delete" data-job-id="${job.id}">删除</button>
        </div>
      </div>
    `;
  }
  cronEls.list.innerHTML = html;

  cronEls.list.querySelectorAll('.btn-pause').forEach(btn => {
    btn.addEventListener('click', () => pauseCronJob(btn.dataset.jobId));
  });
  cronEls.list.querySelectorAll('.btn-resume').forEach(btn => {
    btn.addEventListener('click', () => resumeCronJob(btn.dataset.jobId));
  });
  cronEls.list.querySelectorAll('.btn-trigger').forEach(btn => {
    btn.addEventListener('click', () => triggerCronJob(btn.dataset.jobId));
  });
  cronEls.list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => editCronJob(btn.dataset.jobId));
  });
  cronEls.list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteCronJob(btn.dataset.jobId));
  });
}

function formatRelativeTime(isoString) {
  const now = new Date();
  const target = new Date(isoString);
  const diff = Math.floor((target - now) / 1000);
  if (diff < 0) return Math.abs(diff) < 60 ? `${Math.abs(diff)}秒前` : Math.abs(diff) < 3600 ? `${Math.floor(Math.abs(diff) / 60)}分钟前` : `${Math.floor(Math.abs(diff) / 3600)}小时前`;
  if (diff < 60) return `${diff}秒后`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟后`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时后`;
  return `${Math.floor(diff / 86400)}天后`;
}

async function pauseCronJob(jobId) {
  const result = await window.api.cronPause(jobId);
  if (result.success) await loadCronJobs();
}

async function resumeCronJob(jobId) {
  const result = await window.api.cronResume(jobId);
  if (result.success) await loadCronJobs();
}

async function triggerCronJob(jobId) {
  const result = await window.api.cronTrigger(jobId);
  if (result.success) await loadCronJobs();
}

async function deleteCronJob(jobId) {
  if (!confirm('确定删除此定时任务？')) return;
  const result = await window.api.cronDelete(jobId);
  if (result.success) await loadCronJobs();
}

function editCronJob(jobId) {
  const job = cronJobs.find(j => j.id === jobId);
  if (!job) return;
  editingCronJobId = jobId;
  cronEls.modalTitle.textContent = '编辑定时任务';
  cronEls.name.value = job.name || '';
  cronEls.prompt.value = job.prompt || '';
  cronEls.repeat.value = job.repeat?.times || '';
  cronEls.workdir.value = job.workdir || '';
  openCronModal();
}

function openCronModal() {
  cronEls.modal.style.display = 'flex';
}

function closeCronModal() {
  cronEls.modal.style.display = 'none';
  editingCronJobId = null;
  cronEls.name.value = '';
  cronEls.prompt.value = '';
  cronEls.repeat.value = '';
  cronEls.workdir.value = '';
  cronEls.scheduleValue.value = 30;
  cronEls.scheduleUnit.value = 'm';
  cronEls.recurring.checked = true;
  cronEls.scheduleCron.value = '';
  cronEls.scheduleOnce.value = '';
}

function getCronSchedule() {
  const type = document.querySelector('input[name="cron-schedule-type"]:checked').value;
  if (type === 'interval') {
    const value = cronEls.scheduleValue.value;
    const unit = cronEls.scheduleUnit.value;
    const recurring = cronEls.recurring.checked;
    if (recurring) return `every ${value}${unit}`;
    return `${value}${unit}`;
  }
  if (type === 'cron') {
    return cronEls.scheduleCron.value;
  }
  if (type === 'once') {
    const val = cronEls.scheduleOnce.value;
    if (val) return val;
    const value = cronEls.scheduleValue.value;
    const unit = cronEls.scheduleUnit.value;
    return `${value}${unit}`;
  }
  return '30m';
}

async function saveCronJob() {
  const prompt = cronEls.prompt.value.trim();
  if (!prompt) {
    alert('请输入提示词');
    return;
  }

  const data = {
    name: cronEls.name.value.trim() || undefined,
    prompt,
    schedule: getCronSchedule(),
    schedule_display: getCronSchedule(),
    repeat: cronEls.repeat.value ? parseInt(cronEls.repeat.value) : null,
    workdir: cronEls.workdir.value.trim() || null,
  };

  let result;
  if (editingCronJobId) {
    result = await window.api.cronUpdate(editingCronJobId, data);
  } else {
    result = await window.api.cronCreate(data);
  }

  if (result.success) {
    closeCronModal();
    await loadCronJobs();
  } else {
    alert('保存失败: ' + result.error);
  }
}

if (cronEls.newBtn) cronEls.newBtn.addEventListener('click', () => {
  editingCronJobId = null;
  cronEls.modalTitle.textContent = '新建定时任务';
  openCronModal();
});

if (cronEls.modalClose) cronEls.modalClose.addEventListener('click', closeCronModal);
if (cronEls.modalCancel) cronEls.modalCancel.addEventListener('click', closeCronModal);
if (cronEls.modalSave) cronEls.modalSave.addEventListener('click', saveCronJob);

if (cronEls.browseWorkdir) cronEls.browseWorkdir.addEventListener('click', async () => {
  const p = prompt('输入工作目录路径:');
  if (p) cronEls.workdir.value = p;
});

document.querySelectorAll('input[name="cron-schedule-type"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const val = radio.value;
    cronEls.scheduleIntervalGroup.style.display = val === 'interval' ? '' : 'none';
    cronEls.scheduleCronGroup.style.display = val === 'cron' ? '' : 'none';
    cronEls.scheduleOnceGroup.style.display = val === 'once' ? '' : 'none';
  });
});

document.querySelectorAll('.cron-quick-times .btn-sm').forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt(btn.dataset.minutes);
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    const iso = now.toISOString().slice(0, 16);
    cronEls.scheduleOnce.value = iso;
  });
});

if (window.api.onCronStatus) {
  window.api.onCronStatus((data) => {
    cronEngineRunning = data.isRunning;
    updateCronStatusUI();
  });
}

const _origShowPage = showPage;
showPage = function(pageName) {
  _origShowPage(pageName);
  if (pageName === 'cron') {
    loadCronJobs();
    updateCronStatusUI();
  }
  if (pageName === 'gateway') {
    initGatewayPage();
  }
};

// ============================
// Gateway Page
// ============================
let gatewayRunning = false;
let gatewayStartTime = null;
let gatewayUptimeInterval = null;

async function initGatewayPage() {
  try {
    const status = await window.api.gatewayStatus();
    updateGatewayStatus(status);
  } catch (err) {
    console.error('Failed to get gateway status:', err);
  }

  try {
    const config = await window.api.gatewayConfigGet();
    populateGatewayConfig(config);
  } catch (err) {
    console.error('Failed to get gateway config:', err);
  }

  try {
    await loadGatewayChannels();
  } catch (err) {
    console.error('Failed to load channels:', err);
  }

  window.api.onGatewayStatusChange((status) => {
    updateGatewayStatus(status);
  });

  window.api.onGatewayLog((data) => {
    appendGatewayLog(data);
  });
}

function updateGatewayStatus(status) {
  const badge = document.getElementById('gateway-status-badge');
  const statusText = document.getElementById('gateway-status-text');
  const sourceEl = document.getElementById('gw-source');
  const pidEl = document.getElementById('gw-pid');
  const managerEl = document.getElementById('gw-manager');
  const startBtn = document.getElementById('gateway-start-btn');
  const stopBtn = document.getElementById('gateway-stop-btn');
  const restartBtn = document.getElementById('gateway-restart-btn');
  const restartExternalBtn = document.getElementById('gateway-restart-external-btn');
  const takeoverBtn = document.getElementById('gateway-takeover-btn');
  const recheckBtn = document.getElementById('gateway-recheck-btn');

  if (!badge) return;

  gatewayRunning = status.running;

  // Three explicit states. Each gets a unique badge label, status text,
  // and button set so the UI never mixes "GUI-managed" controls with
  // "external" indicators.
  const showButton = (el, visible) => { if (el) el.style.display = visible ? '' : 'none'; };
  const hideAllActionButtons = () => {
    showButton(startBtn, false);
    showButton(stopBtn, false);
    showButton(restartBtn, false);
    showButton(restartExternalBtn, false);
    showButton(takeoverBtn, false);
  };

  if (status.running && status.source === 'gui') {
    // ── State A: GUI-managed gateway ──
    badge.textContent = '● GUI 启动';
    badge.className = 'gateway-status-badge running gui';
    if (statusText) {
      statusText.textContent = 'Gateway 运行中（由 GUI 管理）';
      statusText.className = 'gateway-status-text running';
    }
    if (sourceEl) {
      sourceEl.textContent = status.sourceLabel || 'GUI 启动';
      sourceEl.title = status.sourceLabel || 'GUI 启动';
    }
    if (pidEl) {
      pidEl.textContent = status.pid || '-';
      pidEl.title = 'Gateway 进程 ID';
    }
    if (managerEl) {
      managerEl.textContent = status.managerLabel || 'GUI 进程';
      managerEl.title = status.managerLabel || 'GUI 进程';
    }
    hideAllActionButtons();
    showButton(stopBtn, true);
    showButton(restartBtn, true);
    showButton(recheckBtn, true);
    gatewayStartTime = Date.now();
    startUptimeCounter();
  } else if (status.running && status.source === 'external') {
    // ── State B: external gateway (CLI / launchd / systemd / manual) ──
    badge.textContent = `● ${status.sourceLabel || '外部 Gateway'}`;
    badge.className = 'gateway-status-badge running external';
    if (statusText) {
      statusText.textContent = `Gateway 运行中（由 ${status.sourceLabel || '外部进程'} 管理）`;
      statusText.className = 'gateway-status-text running-external';
    }
    if (sourceEl) {
      sourceEl.textContent = status.sourceLabel || '-';
      sourceEl.title = status.sourceLabel || '';
    }
    if (pidEl) {
      pidEl.textContent = status.pid || '-';
      pidEl.title = 'Gateway 进程 ID';
    }
    if (managerEl) {
      managerEl.textContent = status.managerLabel || status.manager || '-';
      managerEl.title = status.managerLabel || '';
    }
    hideAllActionButtons();
    showButton(restartExternalBtn, true);
    showButton(takeoverBtn, true);
    showButton(recheckBtn, true);
    stopUptimeCounter();
  } else {
    // ── State C: nothing running ──
    badge.textContent = '未启动';
    badge.className = 'gateway-status-badge';
    if (statusText) {
      statusText.textContent = 'Gateway 未启动';
      statusText.className = 'gateway-status-text';
    }
    if (sourceEl) sourceEl.textContent = '-';
    if (pidEl) pidEl.textContent = '-';
    if (managerEl) managerEl.textContent = '-';
    hideAllActionButtons();
    showButton(startBtn, true);
    showButton(recheckBtn, true);
    stopUptimeCounter();
  }

  const dotEl = document.getElementById('status-gateway-dot');
  if (dotEl) {
    dotEl.className = 'status-dot' + (status.running ? ' success' : '');
  }
}

function startUptimeCounter() {
  stopUptimeCounter();
  gatewayUptimeInterval = setInterval(() => {
    if (!gatewayStartTime) return;
    const elapsed = Date.now() - gatewayStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const uptimeEl = document.getElementById('gw-uptime');
    if (uptimeEl) {
      uptimeEl.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
    }
  }, 1000);
}

function stopUptimeCounter() {
  if (gatewayUptimeInterval) {
    clearInterval(gatewayUptimeInterval);
    gatewayUptimeInterval = null;
  }
}

function populateGatewayConfig(config) {
  if (!config) return;

  const dtEnable = document.getElementById('dingtalk-enable');
  const dtClientId = document.getElementById('dingtalk-client-id');
  const dtClientSecret = document.getElementById('dingtalk-client-secret');
  if (dtEnable) dtEnable.checked = config.dingtalk?.enabled || false;
  if (dtClientId) dtClientId.value = config.dingtalk?.clientId || '';
  if (dtClientSecret) dtClientSecret.value = '';
  // Show hint if secret is already configured
  _updateSecretHint('dingtalk-client-secret', config.dingtalk?.clientSecretMasked);

  const fsEnable = document.getElementById('feishu-enable');
  const fsAppId = document.getElementById('feishu-app-id');
  const fsAppSecret = document.getElementById('feishu-app-secret');
  const fsToken = document.getElementById('feishu-verification-token');
  const fsMode = document.getElementById('feishu-connection-mode');
  if (fsEnable) fsEnable.checked = config.feishu?.enabled || false;
  if (fsAppId) fsAppId.value = config.feishu?.appId || '';
  if (fsAppSecret) fsAppSecret.value = '';
  if (fsToken) fsToken.value = '';
  if (fsMode) fsMode.value = config.feishu?.connectionMode || 'websocket';
  _updateSecretHint('feishu-app-secret', config.feishu?.appSecretMasked);
  _updateSecretHint('feishu-verification-token', config.feishu?.verificationTokenMasked);
}

function _updateSecretHint(inputId, maskedValue) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let hint = input.parentElement.nextElementSibling;
  if (!hint || !hint.classList.contains('secret-configured-hint')) {
    hint = document.createElement('small');
    hint.className = 'secret-configured-hint';
    hint.style.cssText = 'display:block;font-size:11px;color:var(--success);margin-top:4px;';
    input.parentElement.parentElement.appendChild(hint);
  }
  if (maskedValue && maskedValue.includes('•')) {
    hint.textContent = `✓ 已配置 (${maskedValue})`;
    hint.style.display = '';
  } else {
    hint.style.display = 'none';
  }
}

async function loadGatewayChannels() {
  const listEl = document.getElementById('gateway-channels-list');
  if (!listEl) return;

  try {
    const result = await window.api.gatewayChannels();
    if (!result.success || !result.platforms || Object.keys(result.platforms).length === 0) {
      listEl.innerHTML = '<div class="empty-state-text">暂无 Channel，发送消息后自动发现</div>';
      return;
    }

    let html = '';
    for (const [platform, channels] of Object.entries(result.platforms)) {
      if (!channels || channels.length === 0) continue;
      for (const ch of channels) {
        html += `<div class="gateway-channel-item">
          <div class="gateway-channel-info">
            <span class="gateway-channel-dot"></span>
            <div>
              <div class="gateway-channel-name">${escapeHtml(ch.name)}</div>
              <div class="gateway-channel-meta">${escapeHtml(platform)} · ${escapeHtml(ch.id || '')}</div>
            </div>
          </div>
        </div>`;
      }
    }

    if (!html) {
      listEl.innerHTML = '<div class="empty-state-text">暂无 Channel，发送消息后自动发现</div>';
    } else {
      listEl.innerHTML = html;
    }
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function appendGatewayLog(data) {
  const viewer = document.getElementById('gateway-log-viewer');
  if (!viewer) return;

  const time = new Date().toLocaleTimeString();
  const level = data.level || 'info';
  const message = data.message || '';

  const levelColor = level === 'error' ? 'var(--error)' : level === 'warn' ? 'var(--warning)' : 'var(--text-secondary)';

  viewer.innerHTML += `<div><span style="color:${levelColor}">[${time}]</span> ${escapeHtml(message)}</div>`;
  viewer.scrollTop = viewer.scrollHeight;
}

document.getElementById('gateway-start-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-start-btn');
  btn.disabled = true;
  btn.textContent = '启动中...';
  try {
    const result = await window.api.gatewayStart();
    if (result.success) {
      updateGatewayStatus({ running: true, source: 'gui', pid: result.pid, manager: 'gui', sourceLabel: 'GUI 自启' });
    } else {
      alert(`启动失败: ${result.error}`);
    }
  } catch (err) {
    alert(`启动异常: ${err.message}`);
  }
  btn.disabled = false;
  btn.textContent = '启动';
});

document.getElementById('gateway-stop-btn')?.addEventListener('click', async () => {
  try {
    await window.api.gatewayStop();
    updateGatewayStatus({ running: false, source: 'none' });
  } catch (err) {
    alert(`停止异常: ${err.message}`);
  }
});

document.getElementById('gateway-restart-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-restart-btn');
  btn.disabled = true;
  btn.textContent = '重启中...';
  try {
    const result = await window.api.gatewayRestart();
    if (result.success) {
      updateGatewayStatus({ running: true, source: 'gui', pid: result.pid, manager: 'gui', sourceLabel: 'GUI 自启' });
    } else {
      alert(`重启失败: ${result.error}`);
    }
  } catch (err) {
    alert(`重启异常: ${err.message}`);
  }
  btn.disabled = false;
  btn.textContent = '重启';
});

document.getElementById('gateway-restart-external-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-restart-external-btn');
  if (!confirm('确定要重启外部 Gateway 吗？这会运行 hermes gateway restart。')) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '重启中...';
  try {
    const result = await window.api.gatewayRestartExternal();
    if (!result.success) {
      alert(`重启外部 Gateway 失败: ${result.error || '未知错误'}`);
    }
    await window.api.gatewayStatus().then(updateGatewayStatus).catch(() => {});
  } catch (err) {
    alert(`重启异常: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

document.getElementById('gateway-takeover-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-takeover-btn');
  if (!confirm('将由 GUI 接管 Gateway：\n\n1. 停止当前外部 Gateway 进程\n2. 由本应用启动并管理 Gateway\n\n继续？')) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '接管中...';
  try {
    const result = await window.api.gatewayTakeover();
    if (!result.success) {
      alert(`接管失败: ${result.error || '未知错误'}`);
    }
    await window.api.gatewayStatus().then(updateGatewayStatus).catch(() => {});
  } catch (err) {
    alert(`接管异常: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

document.getElementById('gateway-recheck-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-recheck-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '检测中...';
  try {
    await window.api.gatewayRecheck();
    const status = await window.api.gatewayStatus();
    updateGatewayStatus(status);
  } catch (err) {
    alert(`刷新失败: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

els.gatewayAutoStart?.addEventListener('change', async () => {
  try {
    await window.api.configSave({ gatewayAutoStart: els.gatewayAutoStart.checked });
  } catch (err) {
    els.gatewayAutoStart.checked = !els.gatewayAutoStart.checked;
    alert(`保存 Gateway 自动启动设置失败: ${err.message}`);
  }
});

document.getElementById('gateway-refresh-channels')?.addEventListener('click', () => loadGatewayChannels());

document.getElementById('gateway-clear-logs')?.addEventListener('click', () => {
  const viewer = document.getElementById('gateway-log-viewer');
  if (viewer) viewer.innerHTML = '';
});

['dingtalk-client-id', 'dingtalk-client-secret', 'feishu-app-id', 'feishu-app-secret', 'feishu-verification-token'].forEach(id => {
  const toggleBtn = document.getElementById(`toggle-${id}`);
  const input = document.getElementById(id);
  if (toggleBtn && input) {
    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleBtn.textContent = input.type === 'password' ? '👁' : '👁‍🗨';
    });
  }
});

document.getElementById('gateway-save-config-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-save-config-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const dtEnabled = document.getElementById('dingtalk-enable')?.checked || false;
    const dtClientId = document.getElementById('dingtalk-client-id')?.value || '';
    const dtClientSecret = document.getElementById('dingtalk-client-secret')?.value || '';
    if (dtEnabled && (dtClientId || dtClientSecret)) {
      await window.api.gatewayConfigSave('dingtalk', {
        enabled: true,
        clientId: dtClientId,
        clientSecret: dtClientSecret,
      });
    }

    const fsEnabled = document.getElementById('feishu-enable')?.checked || false;
    const fsAppId = document.getElementById('feishu-app-id')?.value || '';
    const fsAppSecret = document.getElementById('feishu-app-secret')?.value || '';
    const fsToken = document.getElementById('feishu-verification-token')?.value || '';
    const fsMode = document.getElementById('feishu-connection-mode')?.value || 'websocket';
    if (fsEnabled && (fsAppId || fsAppSecret)) {
      await window.api.gatewayConfigSave('feishu', {
        enabled: true,
        appId: fsAppId,
        appSecret: fsAppSecret,
        verificationToken: fsToken,
        connectionMode: fsMode,
      });
    }

    if (gatewayRunning) {
      await window.api.gatewayRestart();
    }

    setBtnState(btn, '已保存 ✓');
  } catch (err) {
    btn.textContent = `保存失败: ${err.message}`;
    btn.disabled = false;
  }
});

document.getElementById('dingtalk-qr-auth-btn')?.addEventListener('click', async () => {
  await startQrAuth('dingtalk');
});

document.getElementById('feishu-qr-auth-btn')?.addEventListener('click', async () => {
  await startQrAuth('feishu');
});

async function startQrAuth(platform) {
  const label = platform === 'dingtalk' ? '钉钉' : '飞书';
  const overlay = document.createElement('div');
  overlay.className = 'gateway-qr-modal-overlay';
  overlay.innerHTML = `
    <div class="gateway-qr-modal">
      <h3>${label}扫码注册</h3>
      <div class="gateway-qr-status waiting" id="qr-status">正在生成 QR 码...</div>
      <div class="gateway-qr-hint" id="qr-hint">请使用${label}扫描下方二维码</div>
      <div class="gateway-qr-url" id="qr-url"></div>
      <button class="btn btn-secondary" id="qr-cancel-btn">取消</button>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    const result = await window.api.gatewayQrAuth(platform);
    const statusEl = document.getElementById('qr-status');

    if (result.success) {
      statusEl.className = 'gateway-qr-status success';
      statusEl.textContent = '注册成功！凭证已自动保存';
      setTimeout(() => {
        overlay.remove();
        window.api.gatewayConfigGet().then(populateGatewayConfig);
      }, 2000);
    } else {
      statusEl.className = 'gateway-qr-status error';
      statusEl.textContent = `注册失败: ${result.error || '未知错误'}`;
    }
  } catch (err) {
    const statusEl = document.getElementById('qr-status');
    statusEl.className = 'gateway-qr-status error';
    statusEl.textContent = `注册异常: ${err.message}`;
  }

  document.getElementById('qr-cancel-btn')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

async function autoStartGateway() {
  try {
    const config = await window.api.configGet();
    if (config.gatewayAutoStart !== true) return;

    const status = await window.api.gatewayStatus();
    updateGatewayStatus(status);
    if (status.running) return;

    appendGatewayLog({ level: 'info', message: '打开程序自动启动 Gateway...' });
    const result = await window.api.gatewayStart();
    if (result?.success) {
      updateGatewayStatus({
        running: true,
        source: 'gui',
        pid: result.pid,
        manager: 'gui',
        sourceLabel: 'GUI 自启',
        managerLabel: 'GUI 进程',
      });
      appendGatewayLog({ level: 'info', message: 'Gateway 已自动启动' });
    } else {
      appendGatewayLog({ level: 'error', message: `Gateway 自动启动失败: ${result?.error || '未知错误'}` });
    }
  } catch (err) {
    appendGatewayLog({ level: 'error', message: `Gateway 自动启动失败: ${err.message}` });
    console.warn('Auto-start Gateway failed:', err.message);
  }
}

autoStartGateway();
