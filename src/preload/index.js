const { contextBridge, ipcRenderer } = require('electron');

// Typed API — only expose whitelisted channels for security
contextBridge.exposeInMainWorld('api', {
  // Config
  configGet: () => ipcRenderer.invoke('config-get'),
  configSave: (data) => ipcRenderer.invoke('config-save', data),
  configBrowseFolder: () => ipcRenderer.invoke('config-browse-folder'),
  isFirstRun: () => ipcRenderer.invoke('is-first-run'),

  // Auth
  authFeishu: () => ipcRenderer.invoke('auth-feishu'),
  authDingtalk: () => ipcRenderer.invoke('auth-dingtalk'),
  checkAuthStatus: () => ipcRenderer.invoke('check-auth-status'),
  getAuthPermissions: (params) => ipcRenderer.invoke('get-auth-permissions', params),
  runDiagnostic: () => ipcRenderer.invoke('run-diagnostic'),

  // Agent
  agentStart: (config) => ipcRenderer.invoke('agent-start', config),
  agentStop: () => ipcRenderer.invoke('agent-stop'),
  agentRestart: () => ipcRenderer.invoke('agent-restart'),
  agentInstallDeps: (packages) => ipcRenderer.invoke('agent-install-deps', packages),
  agentSendMessage: (sessionId, text, history) => ipcRenderer.invoke('agent-send-message', { sessionId, text, history }),
  agentSetWorkspace: (sessionId, workspacePath) => ipcRenderer.invoke('agent-set-workspace', { sessionId, workspacePath }),
  agentStopGeneration: (sessionId) => ipcRenderer.invoke('agent-stop-generation', sessionId),
  agentRespondToPrompt: (sessionId, requestId, answer) => ipcRenderer.invoke('agent-respond', { sessionId, requestId, answer }),
  testApiConnection: (params) => ipcRenderer.invoke('test-api-connection', params),
  tryStartAgent: () => ipcRenderer.invoke('try-start-agent'),

  // Session
  sessionExport: (filename, content) => ipcRenderer.invoke('session-export', { filename, content }),
  selectAttachments: () => ipcRenderer.invoke('select-attachments'),

  // Workspace
  workspaceList: (params) => ipcRenderer.invoke('workspace-list', params),
  workspaceRead: (params) => ipcRenderer.invoke('workspace-read', params),
  workspaceOpen: (params) => ipcRenderer.invoke('workspace-open', params),
  workspaceBrowse: () => ipcRenderer.invoke('workspace-browse'),

  // Events from main process
  onAgentLog: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('agent-log', handler);
    return () => ipcRenderer.removeListener('agent-log', handler);
  },
  onAgentStatus: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('agent-status', handler);
    return () => ipcRenderer.removeListener('agent-status', handler);
  },
  onAgentResponse: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('agent-response', handler);
    return () => ipcRenderer.removeListener('agent-response', handler);
  },

  // Legacy raw IPC (for backward compatibility during migration)
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, fn) => {
    ipcRenderer.on(channel, (_, ...args) => fn(...args));
  },
  removeListener: (channel, fn) => {
    ipcRenderer.removeListener(channel, fn);
  },

  // Skills management
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsGetDetail: (skillPath) => ipcRenderer.invoke('skills:get-detail', skillPath),
  skillsSetEnabled: (skillName, enabled) => ipcRenderer.invoke('skills:set-enabled', skillName, enabled),
  skillsCreate: (skillData) => ipcRenderer.invoke('skills:create', skillData),
  skillsUpdate: (skillPath, content) => ipcRenderer.invoke('skills:update', { skillPath, content }),
  skillsDelete: (skillPath) => ipcRenderer.invoke('skills:delete', skillPath),
  skillsArchive: (skillPath) => ipcRenderer.invoke('skills:archive', skillPath),
  skillsUnarchive: (skillPath) => ipcRenderer.invoke('skills:unarchive', skillPath),
  skillsGetFile: (filePath) => ipcRenderer.invoke('skills:get-file', filePath),
  skillsWriteFile: (filePath, content) => ipcRenderer.invoke('skills:write-file', { filePath, content }),
  skillsListFiles: (skillPath) => ipcRenderer.invoke('skills:list-files', skillPath),

  // Cron (定时任务)
  cronList: (includeDisabled) => ipcRenderer.invoke('cron:list', includeDisabled),
  cronCreate: (data) => ipcRenderer.invoke('cron:create', data),
  cronUpdate: (jobId, updates) => ipcRenderer.invoke('cron:update', jobId, updates),
  cronDelete: (jobId) => ipcRenderer.invoke('cron:delete', jobId),
  cronPause: (jobId) => ipcRenderer.invoke('cron:pause', jobId),
  cronResume: (jobId) => ipcRenderer.invoke('cron:resume', jobId),
  cronTrigger: (jobId) => ipcRenderer.invoke('cron:trigger', jobId),
  cronStatus: () => ipcRenderer.invoke('cron:status'),
  cronStart: () => ipcRenderer.invoke('cron:start'),
  cronStop: () => ipcRenderer.invoke('cron:stop'),
  onCronStatus: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('cron-status', handler);
    return () => ipcRenderer.removeListener('cron-status', handler);
  },

  // Gateway
  gatewayStatus: () => ipcRenderer.invoke('gateway-status'),
  gatewayStart: () => ipcRenderer.invoke('gateway-start'),
  gatewayStop: () => ipcRenderer.invoke('gateway-stop'),
  gatewayRestart: () => ipcRenderer.invoke('gateway-restart'),
  gatewayRecheck: () => ipcRenderer.invoke('gateway-recheck'),
  gatewayRestartExternal: () => ipcRenderer.invoke('gateway-restart-external'),
  gatewayTakeover: () => ipcRenderer.invoke('gateway-takeover'),
  gatewayConfigGet: () => ipcRenderer.invoke('gateway-config-get'),
  gatewayConfigSave: (platform, config) => ipcRenderer.invoke('gateway-config-save', platform, config),
  gatewayQrAuth: (platform) => ipcRenderer.invoke('gateway-qr-auth', platform),
  gatewayChannels: () => ipcRenderer.invoke('gateway-channels'),
  gatewayRuntimeStatus: () => ipcRenderer.invoke('gateway-runtime-status'),
  onGatewayLog: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('gateway-log', handler);
    return () => ipcRenderer.removeListener('gateway-log', handler);
  },
  onGatewayStatusChange: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('gateway-status-change', handler);
    return () => ipcRenderer.removeListener('gateway-status-change', handler);
  },
});
