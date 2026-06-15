const { test } = require('node:test');
const assert = require('node:assert');
const {
  getBundledCliDirMap,
  getBundledCliDirs,
  prependCliDirsToPath,
} = require('../../src/main/cli-runtime');

test('resolves packaged Windows CLI directories from app.asar.unpacked', () => {
  const existing = new Set([
    'C:\\app\\resources\\app.asar.unpacked\\assets\\feishu-cli\\windows-amd64',
    'C:\\app\\resources\\app.asar.unpacked\\assets\\dws-cli\\windows-amd64',
  ]);

  const result = getBundledCliDirs({
    resourcesDir: 'C:\\app\\resources',
    isPackaged: true,
    platform: 'win32',
    arch: 'x64',
    pathApi: require('path').win32,
    existsSync: (candidate) => existing.has(candidate),
  });

  assert.deepStrictEqual(result, [...existing]);
});

test('keeps CLI directory identities stable when one bundled directory is missing', () => {
  const result = getBundledCliDirMap({
    resourcesDir: 'C:\\app\\resources',
    isPackaged: true,
    platform: 'win32',
    arch: 'x64',
    pathApi: require('path').win32,
  });

  assert.strictEqual(
    result.lark,
    'C:\\app\\resources\\app.asar.unpacked\\assets\\feishu-cli\\windows-amd64',
  );
  assert.strictEqual(
    result.dws,
    'C:\\app\\resources\\app.asar.unpacked\\assets\\dws-cli\\windows-amd64',
  );
});

test('prepends CLI directories to the Windows Path key', () => {
  const env = { Path: 'C:\\Windows\\System32' };

  prependCliDirsToPath(env, ['C:\\lark', 'C:\\dws'], 'win32');

  assert.strictEqual(env.Path, 'C:\\lark;C:\\dws;C:\\Windows\\System32');
  assert.strictEqual(env.PATH, undefined);
});

test('prepends CLI directories to POSIX PATH', () => {
  const env = { PATH: '/usr/bin:/bin' };

  prependCliDirsToPath(env, ['/app/lark', '/app/dws'], 'darwin');

  assert.strictEqual(env.PATH, '/app/lark:/app/dws:/usr/bin:/bin');
});
