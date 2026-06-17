# 运行状态提示与恢复入口规格

## 背景

Hermes Desktop for Office 里有两类容易被用户误解的运行状态：

- Gateway 来源：App 内置 Gateway 会使用打包内置的 Hermes/Python 环境，并把 App 内置的 `dws` 和 `lark-cli` 目录加入 `PATH`；外部 Gateway 由 TUI、终端、launchd、systemd 或其它方式启动，运行环境取决于用户 shell、系统服务配置和本机已安装命令。
- 定时任务页状态：当前“已停止”来自 GUI 侧 `CronManager.isRunning === false`，它只表示 GUI watcher 停止观察 `~/.hermes/cron/jobs.json`、执行输出和审计日志变化，不表示 Gateway scheduler 停止执行任务。

本规格统一处理这两处提示：外部 Gateway 的钉钉/飞书 CLI 风险提示，以及定时任务 GUI 同步停止时的文案和恢复入口。

## 目标

- 外部 Gateway 运行时，明确提示 `dws` / `lark-cli` 可能不可用或版本不一致。
- 推荐用户使用现有“由 GUI 接管”能力，让 App 使用内置 CLI 和一致运行环境启动 Gateway。
- 将定时任务页“已停止”改成“GUI 同步已停止”，避免误解为 Gateway 停止调度。
- GUI 同步停止时提供“恢复同步”按钮，复用现有 `cron:start` IPC。
- 不修改 `src/hermes-agent/` 子模块。

## 非目标

- 不自动检测外部 Gateway 使用的 `dws` / `lark-cli` 路径。
- 不自动停止或替换外部 Gateway。
- 不新增 Gateway 接管流程。
- 不把 GUI watcher 改造成定时任务执行器。
- 不改变 Gateway tick、cron scheduler、任务执行或日志生成逻辑。

## Gateway 外部 CLI 风险提示

### 显示条件

仅当 Gateway 状态满足以下条件时显示提示：

```js
status.running === true && status.source === 'external'
```

以下状态不显示提示：

- Gateway 未启动。
- Gateway 由 GUI 管理。
- Gateway 状态检测失败或未知。

### 展示位置

提示放在 Gateway 状态卡片内：

1. Gateway 状态文本之后。
2. Gateway 操作按钮之前。

### 文案

```text
当前 Gateway 由外部进程管理，可能无法使用本应用内置的钉钉/飞书 CLI。如果定时任务依赖 dws 或 lark-cli，建议由 GUI 接管 Gateway，以使用内置 CLI 和一致的运行环境。
```

文案要求：

- 使用“外部 Gateway”或“外部进程管理”，不要使用“本地 Gateway”，避免和 App 本地启动的 Gateway 混淆。
- 明确影响范围是钉钉/飞书 CLI，不暗示所有 Gateway 能力都会失败。
- 明确“建议由 GUI 接管”，但不强制。

### 操作入口

- 复用现有 `gateway-takeover-btn`。
- 不在 warning banner 内新增第二个接管按钮。
- external 状态下，“由 GUI 接管”按钮保持现有显示逻辑。

### 实现要求

修改 `src/renderer/index.html`，在 `gateway-status-card` 内新增隐藏节点：

```html
<div id="gateway-external-cli-warning" class="runtime-warning-banner" style="display:none">
  当前 Gateway 由外部进程管理，可能无法使用本应用内置的钉钉/飞书 CLI。如果定时任务依赖 dws 或 lark-cli，建议由 GUI 接管 Gateway，以使用内置 CLI 和一致的运行环境。
</div>
```

节点应放在 `gateway-status-grid` 之后、`gateway-controls` 之前。

修改 `src/renderer/app.js`，在 `updateGatewayStatus(status)` 中控制显示：

```js
const externalCliWarning = document.getElementById('gateway-external-cli-warning');
const showExternalCliWarning = status.running && status.source === 'external';
if (externalCliWarning) {
  externalCliWarning.style.display = showExternalCliWarning ? '' : 'none';
}
```

要求：

- 每次 `updateGatewayStatus(status)` 调用都必须更新显示状态。
- GUI managed、stopped、unknown 分支都不能遗留旧提示。
- 不改变现有 Gateway 按钮显示逻辑。

## 定时任务 GUI 同步状态

### 状态文案

定时任务页顶部状态徽标按以下规则显示：

```js
if (!agentRunning) {
  label = 'Agent 未启动';
} else if (cronEngineRunning) {
  label = 'GUI 同步中';
} else {
  label = 'GUI 同步已停止';
}
```

说明：

- `GUI 同步中` 表示 GUI watcher 正在观察任务文件、输出文件和审计日志。
- `GUI 同步已停止` 表示 GUI 不再自动更新任务执行状态和日志，但不代表 Gateway 停止执行任务。

### 恢复同步按钮

当满足以下条件时显示“恢复同步”按钮：

```js
agentRunning === true && cronEngineRunning === false
```

按钮行为：

1. 点击后调用现有 `window.api.cronStart()`。
2. 调用中按钮禁用，文案变成 `恢复中...`。
3. 成功后重新读取 `cronStatus()` 或直接更新 `cronEngineRunning = true`，并刷新任务列表与审计日志。
4. 失败时弹出错误提示，并保持 `GUI 同步已停止` 状态。

以下状态隐藏按钮：

- Agent 未启动。
- GUI 同步中。

### 辅助说明

在 `GUI 同步已停止` 状态下，状态徽标或按钮附近显示：

```text
只影响界面自动刷新，不代表 Gateway 停止执行任务。
```

说明不需要在正常同步状态显示。

### 实现要求

修改 `src/renderer/index.html`，在定时任务页 header actions 中新增恢复按钮和说明：

```html
<span class="cron-status-badge" id="cron-status-badge">Agent 未启动</span>
<button class="btn btn-secondary" id="cron-sync-resume-btn" style="display:none">恢复同步</button>
<span class="cron-sync-hint" id="cron-sync-hint" style="display:none">只影响界面自动刷新，不代表 Gateway 停止执行任务。</span>
```

位置要求：

- 放在 `cron-status-badge` 之后。
- 放在 `new-cron-btn` 之前，避免主要操作被挤到状态控件前面。

修改 `src/renderer/app.js`，在 `cronEls` 中增加：

```js
syncResumeBtn: document.getElementById('cron-sync-resume-btn'),
syncHint: document.getElementById('cron-sync-hint'),
```

更新 `updateCronStatusUI()`：

```js
function updateCronStatusUI() {
  if (!cronEls.statusBadge) return;

  const syncStopped = agentRunning && !cronEngineRunning;

  if (!agentRunning) {
    cronEls.statusBadge.textContent = 'Agent 未启动';
    cronEls.statusBadge.className = 'cron-status-badge no-agent';
  } else if (cronEngineRunning) {
    cronEls.statusBadge.textContent = 'GUI 同步中';
    cronEls.statusBadge.className = 'cron-status-badge running';
  } else {
    cronEls.statusBadge.textContent = 'GUI 同步已停止';
    cronEls.statusBadge.className = 'cron-status-badge stopped';
  }

  if (cronEls.syncResumeBtn) {
    cronEls.syncResumeBtn.style.display = syncStopped ? '' : 'none';
  }
  if (cronEls.syncHint) {
    cronEls.syncHint.style.display = syncStopped ? '' : 'none';
  }
}
```

新增按钮事件：

```js
cronEls.syncResumeBtn?.addEventListener('click', async () => {
  const btn = cronEls.syncResumeBtn;
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '恢复中...';
  try {
    const result = await window.api.cronStart();
    if (!result?.success) {
      alert(`恢复 GUI 同步失败: ${result?.error || '未知错误'}`);
      return;
    }
    cronEngineRunning = true;
    updateCronStatusUI();
    await loadCronJobs();
    await loadCronLogs();
  } catch (err) {
    alert(`恢复 GUI 同步异常: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
});
```

要求：

- 不改变 `cronStop()` 的现有 IPC 行为。
- 不新增真正停止 Gateway 调度的按钮。
- `cron-status` 事件到达时仍以主进程状态为准。

## 样式要求

修改 `src/renderer/styles.css`。

新增通用提示样式：

```css
.runtime-warning-banner {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--warning);
  border-radius: 8px;
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
}
```

新增定时任务同步说明样式：

```css
.cron-sync-hint {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}
```

样式要求：

- 使用现有语义变量，不新增硬编码主题色。
- 如果项目没有 `--warning`，改用已有 warning/amber 语义变量。
- 窄窗口下允许换行，不遮挡状态字段、按钮和“新建任务”。
- 如果 header actions 拥挤，应允许 `cron-header-actions` 换行或收缩。

## 后端与 IPC

不需要新增 IPC。

继续使用现有接口：

- `gateway-status`
- `gateway-status-change`
- `gatewayTakeover()`
- `cron:status`
- `cron:start`
- `cron-status` event

## 验收标准

- 外部 Gateway 运行时，Gateway 页面显示 CLI 风险提示。
- 外部 Gateway 运行时，“由 GUI 接管”按钮仍按现有逻辑显示。
- 点击 Gateway“刷新状态”后，CLI 风险提示显示状态仍正确。
- 点击“由 GUI 接管”并成功后，CLI 风险提示消失，状态显示为 GUI 管理。
- App 自启 Gateway 或 Gateway 未启动时，不显示 CLI 风险提示。
- Agent 未启动时，定时任务状态显示 `Agent 未启动`，不显示“恢复同步”按钮。
- Agent 已启动且 GUI watcher 运行时，定时任务状态显示 `GUI 同步中`，不显示“恢复同步”按钮。
- Agent 已启动但 GUI watcher 停止时，状态显示 `GUI 同步已停止`，显示“恢复同步”按钮和说明文案。
- 点击“恢复同步”成功后，状态变为 `GUI 同步中`，按钮和说明隐藏，并刷新任务列表和执行日志。
- 点击“恢复同步”失败时，显示错误提示，状态仍为 `GUI 同步已停止`。
- 所有文案都不暗示 Gateway 已停止或任务不会执行。

## 测试计划

### Gateway 提示

1. 在终端启动外部 Gateway。
2. 打开 App 的 Gateway 页面。
3. 确认状态显示为外部 Gateway，并出现 CLI 风险提示。
4. 点击“刷新状态”，确认提示仍出现。
5. 点击“由 GUI 接管”，确认接管成功后提示消失。
6. 停止 Gateway，确认提示不显示。
7. 使用 App 的“启动 Gateway”，确认提示不显示。

### 定时任务同步

1. 启动 App，确认定时任务页正常状态显示为 `GUI 同步中`。
2. 通过 DevTools 或临时调用 `window.api.cronStop()` 让 GUI watcher 停止。
3. 回到定时任务页，确认显示 `GUI 同步已停止`、说明文案和“恢复同步”按钮。
4. 点击“恢复同步”，确认状态恢复为 `GUI 同步中`。
5. 确认任务列表和执行日志刷新。
6. 停止 Agent，确认状态显示为 `Agent 未启动`，且不显示“恢复同步”按钮。

### 回归检查

- Gateway 状态徽标仍能正确显示 GUI / external / stopped。
- `gateway-takeover-btn` 的 confirm 文案和执行流程不变。
- “新建任务”按钮仍可点击。
- 执行日志刷新按钮仍可用。
- Gateway 日志、频道列表、平台配置区域不受影响。
- DevTools console 中没有空引用错误。

## 后续可选增强

- 显示 App 内置 `dws` / `lark-cli` 版本。
- 显示 App 内置 CLI 实际路径。
- 对外部 Gateway 增加“无法确认其 CLI 环境”的补充说明。
- 增加帮助文档，说明 TUI 如何手动使用 App 打包 CLI。
