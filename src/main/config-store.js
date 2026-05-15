const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  provider: 'auto',
  apiKey: '',
  baseUrl: '',
  model: '',
  workspacePath: '',
  defaultWorkspacePath: '',
  autoStart: true,
};

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
