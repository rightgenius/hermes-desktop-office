const path = require('path');
const fs = require('fs');

function getCliPlatformDir(platform, arch) {
  if (platform === 'darwin') return `darwin-${arch}`;
  if (platform === 'win32') return 'windows-amd64';
  return 'linux-amd64';
}

function getBundledCliDirMap({
  resourcesDir,
  isPackaged,
  devAssetsDir = path.join(__dirname, '../../assets'),
  platform = process.platform,
  arch = process.arch,
  pathApi = path,
}) {
  const assetsDir = isPackaged
    ? pathApi.join(resourcesDir, 'app.asar.unpacked', 'assets')
    : devAssetsDir;
  const platformDir = getCliPlatformDir(platform, arch);

  return {
    lark: pathApi.join(assetsDir, 'feishu-cli', platformDir),
    dws: pathApi.join(assetsDir, 'dws-cli', platformDir),
  };
}

function getBundledCliDirs(options) {
  const { existsSync = fs.existsSync } = options;
  return Object.values(getBundledCliDirMap(options))
    .filter((candidate) => existsSync(candidate));
}

function prependCliDirsToPath(env, cliDirs, platform = process.platform) {
  if (!cliDirs.length) return env;

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const delimiter = platform === 'win32' ? ';' : ':';
  env[pathKey] = [...cliDirs, env[pathKey]].filter(Boolean).join(delimiter);
  return env;
}

module.exports = {
  getCliPlatformDir,
  getBundledCliDirMap,
  getBundledCliDirs,
  prependCliDirsToPath,
};
