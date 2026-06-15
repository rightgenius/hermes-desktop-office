const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

// Get default workspace path: user's Documents directory
function getDefaultWorkspacePath() {
  try {
    return app.getPath('documents');
  } catch {
    return path.join(app.getPath('home'), 'Documents');
  }
}

// Default cron auto-authorize policy regime.
//   'denylist'  → 默认全开 + 内置黑名单兜底（推荐，后台 cron 实际期望的体验）
//   'ask'       → 走传统弹模态框路径（用户每次审批；安全但 cron 失去意义）
//   'allowlist' → 仅允许白名单内命令（最严，但需要逐个加白名单）
//
// 'denylist' 对应用户原始诉求："后台跑任务默认同意，命中黑名单才拦"。
const DEFAULT_CRON_AUTO_AUTHORIZE = 'denylist';

const DEFAULT_CONFIG = {
  provider: 'auto',
  apiKey: '',
  baseUrl: '',
  model: '',
  workspacePath: '',
  defaultWorkspacePath: getDefaultWorkspacePath(),
  autoStart: true,
  gatewayAutoStart: false,
  cronLogMaxMb: 100,
  cronAutoAuthorize: DEFAULT_CRON_AUTO_AUTHORIZE,
  cronExtraDenylist: [],   // [{ pattern, action: 'block'|'warn', description }]
  apiFormat: '',
  providerRegion: '',
};

function normalizeCronAutoAuthorize(value) {
  if (value === 'denylist' || value === 'ask' || value === 'allowlist') return value;
  return DEFAULT_CRON_AUTO_AUTHORIZE;
}

class ConfigStore {
  constructor() {
    this.config = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (err) {
      console.error('Failed to load config:', err.message);
    }
    return { ...DEFAULT_CONFIG };
  }

  save(partial) {
    this.config = { ...this.config, ...partial };
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save config:', err.message);
      throw err;
    }
    return this.config;
  }

  get() {
    return { ...this.config };
  }

  getWorkspacePath() {
    return this.config.workspacePath || path.join(app.getPath('home'), '.hermes');
  }
}

module.exports = ConfigStore;
