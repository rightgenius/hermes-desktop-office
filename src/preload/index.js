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
  agentSendMessage: (sessionId, text, history) => ipcRenderer.invoke('agent-send-message', { sessionId, text, history }),
  agentStopGeneration: (sessionId) => ipcRenderer.invoke('agent-stop-generation', sessionId),
  agentRespondToPrompt: (sessionId, requestId, answer) => ipcRenderer.invoke('agent-respond', { sessionId, requestId, answer }),
  testApiConnection: (params) => ipcRenderer.invoke('test-api-connection', params),
  tryStartAgent: () => ipcRenderer.invoke('try-start-agent'),

  // Session
  sessionExport: (filename, content) => ipcRenderer.invoke('session-export', { filename, content }),

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
});
