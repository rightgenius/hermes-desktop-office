# 定时任务执行日志实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为定时任务增加包含 Agent 与控制台事件的可审计执行日志，并用界面可配置的全局容量上限限制磁盘占用。

**Architecture:** `AgentManager` 通过内部 EventEmitter 暴露会话事件，`CronLogStore` 将每次执行流式写入 JSONL 并负责查询与容量回收，`CronManager` 组合两者并通过 IPC 提供给 cron 页面。现有最终 Markdown 输出继续保留。

**Tech Stack:** Electron 33、Node.js CommonJS、Node `EventEmitter`/`fs`、原生 `node:test`、HTML/CSS/JavaScript renderer。

---

### Task 1: AgentManager 内部事件

**Files:**
- Modify: `src/main/agent-manager.js`
- Test: `tests/main/test-agent-manager.js`

- [ ] 写测试，断言 `emitResponse` 和 `emitLog` 同时触发内部事件与现有 `webContents.send`。
- [ ] 运行 `node --test tests/main/test-agent-manager.js`，确认测试因缺少 EventEmitter 行为失败。
- [ ] 让 `AgentManager` 继承 `EventEmitter`，在两个 emit 方法中附加 ISO 时间戳并发出内部事件。
- [ ] 重跑测试，确认通过且现有 IPC payload 不变。
- [ ] 提交 `feat: expose agent events for cron logging`。

### Task 2: 流式日志存储与容量限制

**Files:**
- Create: `src/main/cron-log-store.js`
- Create: `tests/main/test-cron-log-store.js`

- [ ] 写测试覆盖 run 开始/事件/结束、摘要列表、详情读取和任务筛选。
- [ ] 运行测试并确认模块缺失导致 RED。
- [ ] 实现 JSONL active/final 文件生命周期与安全 run id 查询。
- [ ] 写并验证容量回收测试：最旧完整记录先删除，最新记录保留。
- [ ] 写并验证单次日志截断、遗留 active、清空和 10-10240 MB 参数校验测试。
- [ ] 重跑存储层测试，确认全部通过。
- [ ] 提交 `feat: add bounded cron execution log store`。

### Task 3: CronManager 执行采集

**Files:**
- Modify: `src/main/cron-manager.js`
- Create: `tests/main/test-cron-manager.js`

- [ ] 写成功执行测试，断言 response、工具事件和 log 被写入同一 run，监听器执行后移除。
- [ ] 写失败执行测试，断言错误状态和错误文本落盘。
- [ ] 运行测试，确认现有实现不创建结构化日志。
- [ ] 注入 `CronLogStore`，在 `_runJob` 前后管理 run 与 AgentManager 订阅。
- [ ] 修复 `_executeViaBridge` 使用 AgentManager 内部 response 事件，并兼容 `complete` 事件名称。
- [ ] 发送 `cron-log-updated` 通知，保留 Markdown 输出。
- [ ] 重跑 CronManager 与 AgentManager 测试。
- [ ] 提交 `feat: capture cron execution events`。

### Task 4: IPC、配置与 preload

**Files:**
- Modify: `src/main/config-store.js`
- Modify: `src/main/ipc-handlers.js`
- Modify: `src/preload/index.js`
- Create: `tests/main/test-cron-ipc-contract.js`

- [ ] 写静态契约测试，断言默认 100 MB、五个 IPC handler、preload API 和更新事件存在。
- [ ] 运行测试并确认 RED。
- [ ] 将 `configStore` 传给 CronManager，增加日志查询、清空、设置读取/保存 handler。
- [ ] 在 preload 暴露对应 API 和 `onCronLogUpdated` 清理函数。
- [ ] 重跑契约测试与 `npm run test:main`。
- [ ] 提交 `feat: expose cron log management APIs`。

### Task 5: Cron 审计界面

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`
- Modify: `tests/main/test-renderer-regressions.js`

- [ ] 写 renderer 回归测试，断言容量设置、任务筛选、日志列表、详情、清空与每任务日志按钮存在。
- [ ] 运行测试并确认 RED。
- [ ] 在 cron 页面添加审计区和容量控件，保持所有现有 HTML id 不变。
- [ ] 实现加载摘要、任务筛选、选择详情、状态与事件格式化、刷新、清空、保存上限和更新事件。
- [ ] 使用现有语义 CSS 变量完成双栏响应式布局和事件级别样式。
- [ ] 重跑 renderer 回归测试与主进程全量测试。
- [ ] 提交 `feat: add cron execution audit UI`。

### Task 6: 端到端验证与合并

**Files:**
- No planned source changes

- [ ] 运行 `npm run test:main`，确认零失败。
- [ ] 运行 `npm run dev`，在 Electron 窗口验证 cron 页面可打开、日志空状态和设置控件正常；记录无法真实执行任务时的环境限制。
- [ ] 检查 `git diff main...HEAD`，确认未修改 `src/hermes-agent/` 且无无关文件。
- [ ] 检查主工作区用户改动，合并功能分支时保留这些改动；若同文件冲突，使用临时提交/补丁方式三方合并并恢复用户工作树状态。
- [ ] 在主工作区 `main` 完成 merge commit 或 fast-forward，并确认 `git log` 包含本功能提交。
