const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');
const workflowPaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
];

function extractJob(content, jobName) {
  const start = content.indexOf(`  ${jobName}:`);
  const remaining = content.slice(start + 1);
  const nextJob = remaining.search(/\n  (?:build-[\w-]+|release):/);
  return content.slice(start, nextJob === -1 ? undefined : start + 1 + nextJob);
}

for (const workflowPath of workflowPaths) {
  test(`${workflowPath} bundles the macOS Python runtime before packaging`, () => {
    const content = fs.readFileSync(path.join(projectRoot, workflowPath), 'utf8');
    const macJob = content.split('  build-windows:')[0];
    const pythonSetupStep = macJob.indexOf("python-version: '3.13'");
    const pythonStep = macJob.indexOf('bash scripts/bundle-python.sh macos');
    const depsStep = macJob.indexOf('bash scripts/bundle-agent-deps.sh macos');
    const builderStep = macJob.indexOf('npx electron-builder --mac');

    assert.notStrictEqual(pythonSetupStep, -1, 'macOS job must build dependencies with Python 3.13');
    assert.notStrictEqual(pythonStep, -1, 'macOS job must bundle the Python runtime');
    assert.notStrictEqual(depsStep, -1, 'macOS job must bundle Agent dependencies');
    assert.notStrictEqual(builderStep, -1, 'macOS job must package the application');
    assert.ok(pythonSetupStep < depsStep, 'Python 3.13 must be configured before bundling dependencies');
    assert.ok(pythonStep < builderStep, 'Python runtime must be bundled before packaging');
    assert.ok(depsStep < builderStep, 'Agent dependencies must be bundled before packaging');
  });

  for (const { job, platform, builder } of [
    { job: 'windows', platform: 'windows', builder: '--win' },
    { job: 'linux', platform: 'linux', builder: '--linux' },
  ]) {
    test(`${workflowPath} bundles the ${platform} runtime before packaging`, () => {
      const content = fs.readFileSync(path.join(projectRoot, workflowPath), 'utf8');
      const jobContent = extractJob(content, `build-${job}`);
      const pythonSetupStep = jobContent.indexOf("python-version: '3.13'");
      const pythonStep = jobContent.indexOf(`bash scripts/bundle-python.sh ${platform}`);
      const depsStep = jobContent.indexOf(`bash scripts/bundle-agent-deps.sh ${platform}`);
      const builderStep = jobContent.indexOf(`npx electron-builder ${builder}`);

      assert.notStrictEqual(pythonSetupStep, -1, `${platform} job must use Python 3.13`);
      assert.notStrictEqual(pythonStep, -1, `${platform} job must bundle the Python runtime`);
      assert.notStrictEqual(depsStep, -1, `${platform} job must bundle Agent dependencies`);
      assert.notStrictEqual(builderStep, -1, `${platform} job must package the application`);
      assert.ok(pythonSetupStep < depsStep, 'Python 3.13 must be configured before dependencies');
      assert.ok(pythonStep < builderStep, 'Python runtime must be bundled before packaging');
      assert.ok(depsStep < builderStep, 'Agent dependencies must be bundled before packaging');
    });
  }
}

test('CI Linux smoke test selects the application executable', () => {
  const content = fs.readFileSync(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8');
  const linuxJob = content.slice(content.indexOf('  build-linux:'));

  assert.match(linuxJob, /APP_PATH="dist\/linux-unpacked\/Hermes Desktop for Office"/);
  assert.match(linuxJob, /! -name 'chrome-sandbox'/);
  assert.match(linuxJob, /! -name 'chrome_crashpad_handler'/);
});

test('Python runtime cache is scoped to the target platform and architecture', () => {
  const content = fs.readFileSync(
    path.join(projectRoot, 'scripts/bundle-python.sh'),
    'utf8',
  );

  assert.match(content, /TARGET_ID=/);
  assert.match(content, /\.runtime-target/);
  assert.match(content, /CACHED_TARGET/);
  assert.match(content, /CACHED_TARGET.*TARGET_ID/);
  assert.match(content, /printf.*TARGET_ID.*TARGET_FILE/);
});

test('packaged smoke test waits for the Agent bridge to become ready', () => {
  const content = fs.readFileSync(
    path.join(projectRoot, 'tests/packaged-smoke.spec.js'),
    'utf8',
  );

  assert.match(content, /Agent 已就绪/);
  assert.match(content, /onAgentLog/);
  assert.match(content, /onAgentStatus/);
});
