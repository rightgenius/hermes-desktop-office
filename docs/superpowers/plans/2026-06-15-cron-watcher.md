# Cron 日志采集：watcher 模式（plan C）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替换上一轮 plan B 的"spawn `hermes cron run` 收 stdout"——它根本收不到真任务执行流（任务在 gateway 那侧跑）。改为磁盘 watcher：监听 `~/.hermes/cron/jobs.json` 状态变化 + `output/<jobId>/*.md` 新文件 + `agent.log` 里 `[cron_<jobId>_*]` 行，把这些事件实时写进 `CronLogStore` 让 GUI 看到。

**架构:**
- `triggerJob` 只**改 `jobs.json`**（已这样），不再 spawn 任何子进程
- 启动时 `start()` 启动一个轮询 loop（默认 2s 间隔），三件事：
  1. 读 `jobs.json` → 检测每个 job 的 `last_run_at` / `state` / `last_status` 变化 → 写 `run_start` / `run_end` 事件
  2. 扫 `output/<jobId>/*.md` → 见到新文件 → 写 `run_end` 事件 + 把 .md 全文作为 `output` 字段
  3. 读 `agent.log` tail 增量 → 见到 `[cron_<jobId>_<ts>]` 新行 → 写 `console` / `agent_output` 事件
- 上轮 spawn 残留的 `.jsonl.active` 文件（subprocess 没了但 close handler 没跑）在启动时被识别 + 强制 finish
- 详情面板的 .md 输出是按行 stream 进来：用户能看到 "Generating Markdown..." 的占位，等 hermes-agent 写完 .md 后**新行实时追加**到详情面板（不是整篇替换）

**Tech Stack:** Electron 33、Node.js CommonJS、`fs.watch` + 轮询 fallback、原生 `node:test`、HTML/CSS/JavaScript renderer、IPC events for live updates。

---

### Task 1: trigger 改回纯改 jobs.json，去掉 spawn

**Files:**
- Modify: `src/main/cron-manager.js`
- Modify: `tests/main/test-cron-manager.js`

- [ ] 写测试：断言 `triggerJob` 写 jobs.json（改 next_run_at）但不 spawn 任何子进程；`start()` 后 startRun/watchers 启动但 tick 不调 spawn。
- [ ] 运行测试并确认现 spawn 行为被新实现替代 RED。
- [ ] 删除 `_buildChildEnv` / `_findPythonCmd` / `_resolveHermes` / `triggerJob` 中的 spawn 逻辑。
- [ ] 改 `triggerJob`：只调 `updateJob`（已实现）改 next_run_at，**不**启子进程。
- [ ] 把 `isRunning` 改为"GUI 观测是否启用"——`start()` 启动 watcher；`stop()` 停 watcher。
- [ ] 跑 `npm run test:main` 0 失败。
- [ ] 提交 `feat: trigger delegates via jobs.json only, no subprocess`.

### Task 2: jobs.json + output/ + agent.log watcher

**Files:**
- Modify: `src/main/cron-manager.js`
- Modify: `tests/main/test-cron-manager.js`

- [ ] 写测试：往 jobs.json 模拟改 `last_run_at` / `state` → 轮询周期后 CronLogStore 出现新 `run_start` 事件；写新 .md 到 output/ → 出现 `run_end` 事件 + output 字段。
- [ ] 跑测试 RED。
- [ ] 写 `_startWatchers()`：定时 2s 跑 `_scanJobStates()` + `_scanOutputDir()` + `_scanAgentLog()`。
- [ ] `_scanJobStates()`：对每个 job 比对 `last_run_at` 记忆；变化时 startRun + emit log update。
- [ ] `_scanOutputDir()`：对每个跑过的 job 看 output dir 是否有新 .md；见到新 .md 时 finishRun 并把全文塞进 `output` 字段。
- [ ] `_scanAgentLog()`：tail `~/.hermes/logs/agent.log`（维护 lastReadOffset），过滤 `[cron_<knownJobId>_*]` 模式；新行作为 `console` 或 `agent_output` 事件（按行解析基础结构）。
- [ ] 跑测试。
- [ ] 提交 `feat: cron execution watcher polls jobs.json, output dir, agent.log`.

### Task 3: 启动时清掉 stuck .active

**Files:**
- Modify: `src/main/cron-manager.js`
- Modify: `tests/main/test-cron-manager.js`

- [ ] 写测试：在 logs/ 放一个超过 30 分钟的 `.jsonl.active` 残留文件，触发 `_reconcileStaleActiveRuns()` → 该文件被 finishRun（status=interrupted, error="app restarted before run completed"）。
- [ ] 跑测试 RED。
- [ ] 实现：start() 调一次 `_reconcileStaleActiveRuns()`：扫 logs/ 的 `.jsonl.active` 文件，mtime 超过 30 分钟的当成 interrupted 强制 finish + rename 到 `.jsonl`。
- [ ] 跑测试。
- [ ] 提交 `feat: reconcile stuck active runs on startup`.

### Task 4: 详情面板动态加载

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `tests/main/test-renderer-regressions.js`

- [ ] 写测试：选中 running 状态的 run → 详情面板有"运行中"+ spinner + 监听 `cron-log-updated` 事件追加新行到 `cron-log-events` div（不是替换整段 HTML）。
- [ ] 跑测试 RED。
- [ ] 改 `renderCronLogDetail`：初始只渲染已有 events 列表；状态 running 时显示 spinner + "等待执行输出..."。
- [ ] 监听 `onCronLogUpdated`：当 event 包含新 `agent_output` / `console` 字段时**追加**到当前 `cron-log-events` div（不重渲整段）。
- [ ] 当 `output` 字段（run_end 的 .md 内容）到达时，渲染为最终 markdown 视图。
- [ ] 跑 renderer regression 测试。
- [ ] 提交 `feat: cron log detail streams events live`.

### Task 5: 端到端验证与合并

**Files:**
- Modify: `tests/cron-audit-e2e.spec.js`

- [ ] 写 e2e 测试：往 `~/.hermes/cron/jobs.json` 写一个 job + 改 last_run_at → GUI 立即看到新 run 出现在列表；把对应 .md 写到 output/ → GUI 详情面板看到 run_end + output 字段。
- [ ] 跑 e2e 4+1 通过。
- [ ] 跑 `npm run test:main` 0 失败。
- [ ] 用 playwright 跑 packaged app：手动改 jobs.json + output/ 文件 → 验证 GUI 实时刷新。
- [ ] 检查 `git diff main...HEAD` 确认未改 `src/hermes-agent/`。
- [ ] 主工作区 merge commit 到 main。
