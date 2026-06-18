# Gateway 生命周期与本地检测设计

**日期**: 2026-06-18
**状态**: 待审核
**作者**: opencode
**关联模块**: `src/main/gateway-manager.js`、`src/main/ipc-handlers.js`、`src/main/index.js`

## 概述

让 GUI 在 Gateway 进程生命周期上"言行一致"：本机已有 gateway 跑（包括其它 GUI 实例启的）→ 只观察不自启；GUI 退出 → 它启的 gateway 一定跟着死。

## 背景与现状

今天在 `src/main/gateway-manager.js` 里有两段不严密：

1. **关闭**：GUI 通过 `spawn` 启的 Python gateway 没有建进程组；`before-quit` 只 kill `this.process` 引用。GUI 一旦重启（dev 模式热重载、崩溃、正常退出再起），引用就丢了，老进程成孤儿继续跑。Python gateway 自己还会 fork 出 feishu / dingtalk channel workers，主进程死了 workers 还活着继续占 app_id 锁。
2. **启动检测**：`_detectExternalGateway` 跑一次（启动时 + 用户点"刷新状态"），按 PID 文件 → launchd/systemd → 进程扫描顺序查。**没考虑 GUI 之前留下的孤儿**——孤儿在 PID 文件里没记录（被 hermes-agent 用 `--replace` 覆盖了），也不一定被进程扫描命中（cmdline 模式有边界），结果 GUI 觉得"无外部"就自启一个。
3. **多 GUI 实例**：两个 GUI 同时跑（dev + packaged），各自独立检测、各自 start()，会启出多个 gateway，互相抢 feishu/dingtalk app_id 锁。

## 目标

- GUI 退出后，**它启动过的 gateway 一定死**（包括所有子进程）
- 本机只要有**任何一个** gateway 在跑（任何来源），GUI **不**自启；改走只读 + takeover / restartExternal
- 多 GUI 实例：后启动的识别前一个 GUI 留下的 gateway，进入观察模式
- 已确认**不动的行为**：takeover、restartExternal 保持现状；外部 gateway 的 UI 仍是只读 + 这两个操作

## 非目标

- 不引入 GUI 互斥锁 / 单实例限制
- 不改变 hermes-agent 子模块
- 不重构 `GatewayManager` 的 IPC 协议
- 不处理"多 GUI 实例同时点 takeover"这种竞态（最坏后果是两次 start() 互相失败一次，正常情况）

## 设计

### 1. GUI-owned 跟踪文件

新增 `~/.hermes/gateway.gui-managed.json`：

```json
{
  "pid": 12345,
  "hermesPath": "/Users/nius/.hermes/hermes-agent",
  "startedAt": "2026-06-18T05:28:43.568Z",
  "spawnId": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "darwin",
  "pythonCmd": "/Users/nius/.hermes/hermes-agent/venv/bin/python3"
}
```

| 字段 | 用途 |
|------|------|
| `pid` | spawn 出来的子进程 PID；`before-quit` 和启动清理都用 |
| `hermesPath` | 记录用的是哪个 hermes-agent 路径，方便日志/调试 |
| `startedAt` | 排查"为什么这个 gateway 跑这么久了" |
| `spawnId` | 区分"这个 PID 是不是我启的"——多 GUI 实例下，JSON 里的 `spawnId` 不等于当前 `GatewayManager._spawnId` → 视为别人启的 |
| `platform` | 跨平台调试辅助 |
| `pythonCmd` | 调试用；不参与逻辑判断 |

**写入时机**：`_verifyStartup()` 之后、第一次 `emitStatusChange({running: true})` 之前。
**删除时机**：`stop()` 成功后；`takeover()` 杀掉外部后写自己的；`process.on('exit')` 兜底删除。

### 2. 检测优先级

`detectExternalGateway()` 顺序（任一命中即返回）：

1. **`gateway.gui-managed.json`**（新增，最高优先）
   - 读 JSON → `pid` 活 + cmdline 是 gateway → 标记 external（**这是多实例场景的核心**：后启动的 GUI 读到前一个 GUI 的 JSON，把它的 gateway 当 external）
   - `pid` 活 + cmdline 不是 gateway → 删 JSON（这种情况意味着 JSON 被改坏了或不匹配），fallthrough
   - `pid` 死 → 删 JSON（孤儿），fallthrough
2. **`gateway.pid`**（现有，`_detectViaPidFile`）—— 不动
3. **launchd / systemd 服务**（现有，`_checkSystemService`）—— 不动
4. **`ps -A` 进程扫描**（现有，`_scanGatewayProcesses`）—— 不动

`_isManagedPid(pid)`（`gateway-manager.js:91`）逻辑调整为：

```js
_isManagedPid(pid) {
  return this.running
    && this.process
    && this.process.pid === pid
    && this._spawnId === this._readManagedSpawnId();  // 新增
}
```

`_readManagedSpawnId()` 读 JSON 文件取 `spawnId`，文件不存在则返回 `null`。

### 3. 进程组杀整树

**Unix（macOS / Linux）**——`start()` 里 spawn 时加 `detached`：

```js
const child = spawn(pythonCmd, args, {
  cwd: hermesPath,
  env: this._buildChildEnv(),
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',  // ← 新增
});
```

`detached: true` 在 Unix 上让子进程成为新进程组（PGID = child.pid）但仍在同一会话。

**杀整组**——新增 `killProcessTree(child, signal = 'SIGTERM')` 私有方法：

```js
function killProcessTree(child, signal = 'SIGTERM') {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  } else {
    try { process.kill(-child.pid, signal); } catch (_) {}
  }
}
```

负 PID 是 PGID，向整组发信号。`stop()` 现有的 `child.kill('SIGTERM')` 替换为 `killProcessTree(child)`。`stop()` 现有 5s SIGKILL 兜底逻辑保留，但同样改为 `killProcessTree(child, 'SIGKILL')`。

### 4. 启动清理 + 重新检测触发点

**GUI 启动时**（`ipc-handlers.js:124` 那个 IIFE 里）改成：

```js
(async () => {
  try {
    await gatewayManager.cleanupOrphanGateway();   // 新增
    const external = await gatewayManager.detectExternalGateway();
    if (external) {
      gatewayManager.emitStatusChange({ running: true, source: 'external', ... });
    }
  } catch { /* 静默 */ }
  gatewayManager.startHealthCheck();
})();
```

`cleanupOrphanGateway()`（新增）：
- 读 `gateway.gui-managed.json`
- 若 `pid` 活 + cmdline 是 gateway：`killProcessTree({pid})` + 等 500ms + `unlink` JSON
- 若 `pid` 死：直接 `unlink`
- 若文件不存在：no-op
- 若当前 GUI 的 `this._spawnId === JSON.spawnId`：no-op（自己写的，没理由清）

**`start()` 入口**（`gateway-manager.js:395`）开头加：

```js
async start() {
  if (this.running) return { success: false, error: 'Gateway 已在运行中' };
  await this.cleanupOrphanGateway();                // 新增
  if (this.externalGateway) {                        // 现有检查保留
    return { success: false, error: '检测到外部 Gateway 正在运行...' };
  }
  // ... 现有逻辑
}
```

`await this.detectExternalGateway()` 在 `start()` 入口显式调一次也行（不依赖之前 IIFE 跑过的结果）——选择 `cleanupOrphanGateway()` 后再走原 `externalGateway` 检查，因为 `start()` 入口前 IPC handler 路径可能已经重扫过（`gateway-status` 路径会重扫）。

**进入 Gateway 页**（`renderer/app.js` 显示 `#page-gateway` 的入口）调一次 `gatewayStatus` IPC。`ipc-handlers.js:1159` 现有逻辑"两个都是 null 时重扫"保持，但额外加：renderer 进入页面时主动发 `gateway-recheck`（不依赖页面状态）。

**`healthCheck`** 不变（30s 一次只验证已记录，不引入周期扫描）。

### 5. GUI 关闭

`src/main/index.js:43-61` 的 `before-quit` 调整：

```js
app.on('before-quit', async () => {
  const gateway = getGatewayManager();
  if (gateway) {
    try { gateway.stopHealthCheck(); } catch (_) {}
  }
  // ... 现有 agent / cron 停止逻辑 ...
  if (gateway && gateway.running) {
    try { await gateway.stop(); } catch (_) {}        // stop() 内部 killProcessTree
    try { gateway._unlinkManagedFile(); } catch (_) {} // 新增，删 JSON
  }
});
```

**崩溃兜底**——`index.js` 新增：

```js
process.on('exit', () => {
  const gateway = getGatewayManager();
  if (gateway && gateway.running && gateway.process?.pid) {
    try { process.kill(-gateway.process.pid, 'SIGTERM'); } catch (_) {}
  }
  // unlink JSON 是同步 unlinkSync
  try { fs.unlinkSync(gatewayManagerManagedFilePath()); } catch (_) {}
});
```

注意 `process.on('exit')` 只能同步操作（异步不会被等待），这一步是 best-effort；真正的崩溃兜底是下次启动时的 `cleanupOrphanGateway()`。

### 6. 错误处理

| 场景 | 行为 |
|------|------|
| GUI 启 gateway 后，JSON 写入失败 | `start()` 返回 `{success: false, error: '...'}`，并 kill 已启的子进程；不写 PID 文件就是孤儿 |
| 孤儿 PID 杀不掉（权限/僵尸） | `cleanupOrphanGateway()` 仍删 JSON + 记 warn 日志；下次启动还会重试 |
| 孤儿 cmdline 验出来不是 gateway（被 PID 复用） | 直接删 JSON，fallthrough 到下一种检测 |
| `killProcessTree` 在 Windows 上 `taskkill` 不存在 | 退化到 `child.kill('SIGTERM')` 单进程（保留现有 fallback） |
| GUI 启之前 PID 文件已存在且指向活 gateway | 走 `gateway.pid` 检测，标 external（现状） |
| 多 GUI 实例：两个 JSON 文件都被写 | 不会发生——JSON 是单文件，所有 GUI 写同一份 |

### 7. 数据流

```
GUI 启动
  │
  ├─ cleanupOrphanGateway()          ← 读 JSON 杀孤儿 + 删 JSON
  │
  ├─ detectExternalGateway()
  │   ├─ gateway.gui-managed.json  ← 多实例场景核心
  │   ├─ gateway.pid
  │   ├─ launchd/systemd
  │   └─ ps 进程扫描
  │
  └─ 命中 → external；不命中 → 等用户操作

用户点"启动 Gateway"
  │
  ├─ start() 入口 cleanupOrphanGateway()（防 last-second 孤儿）
  ├─ 检查 externalGateway
  └─ 自启：spawn(detached) → _verifyStartup → 写 JSON
                                          → emitStatusChange({source: 'gui'})

健康检查 30s
  └─ 验证已记录的 external 是否还活；不重扫

before-quit
  ├─ stop() → killProcessTree → 等 ≤ 2s → 删 JSON
  └─ process.on('exit') 兜底

process.exit (崩溃)
  └─ process.on('exit') 同步 best-effort
  └─ 下次启动 cleanupOrphanGateway() 真正兜底
```

### 8. 文件变更清单

**修改**：

- `src/main/gateway-manager.js`
  - `start()`：spawn 加 `detached`；`cleanupOrphanGateway()` 调用；`_verifyStartup` 后写 JSON
  - `stop()`：`child.kill` → `killProcessTree`；成功后 `unlink` JSON
  - `takeover()`：杀掉外部后，`start()` 会写 JSON（自然衔接）
  - `restartExternal()`：用完一次重扫，不需要改
  - `_isManagedPid()`：加 `_spawnId` 比对
  - 新增 `_spawnId`（构造时 `crypto.randomUUID()`）
  - 新增 `_readManagedSpawnId()` / `_writeManagedFile()` / `_unlinkManagedFile()` / `cleanupOrphanGateway()` / `killProcessTree()`
  - `detectExternalGateway()` 第一步加 JSON 检测

- `src/main/ipc-handlers.js`
  - 启动 IIFE：在 `detectExternalGateway` 前调 `cleanupOrphanGateway`
  - `gateway-status` 现有重扫逻辑保留
  - 新增 IPC `gateway-page-enter`（renderer 进入 Gateway 页时主动触发一次完整重扫 + 健康检查），与 `gateway-recheck` 行为一致

- `src/main/index.js`
  - `before-quit`：调 `gateway.stop()` 后加 `gateway._unlinkManagedFile()`
  - 新增 `process.on('exit')` 同步兜底
  - 新增 helper `gatewayManagerManagedFilePath()`（返回 `~/.hermes/gateway.gui-managed.json` 绝对路径）

- `src/preload/index.js`
  - 暴露 `gatewayPageEnter` 调 `gateway-page-enter` IPC

- `src/renderer/app.js`
  - 切换到 `#page-gateway` 时调 `gatewayPageEnter()`

**新增**：无（JSON 文件运行时由代码生成）

### 9. 测试

- **单元/集成**：
  - `gateway-manager.js` 抽几个纯函数（`_isManagedPid`、`_readManagedSpawnId`、`_isGatewayCommandLine`）单测
  - 模拟 JSON 文件存在 / PID 死 / PID 活但 cmdline 不匹配三种情况，验证 `cleanupOrphanGateway` 行为
- **手工 e2e**（参照 `docs/testing.md`）：
  - 场景 A：dev 启一个 gateway → 关闭 GUI → `ps -A` 应看不到该 PID
  - 场景 B：dev 启一个 + 终端启一个 → dev 启动时 `start()` 应被拒，UI 显示"外部 Gateway 运行中"
  - 场景 C：硬 kill 父 GUI（kill -9 electron）→ 再开 GUI → 进入 Gateway 页 → 旧 gateway 应在 ≤ 1s 内被识别为孤儿杀干净
  - 场景 D：开 dev + packaged 两个 GUI → 第二个启动时第一个已启的 gateway 应被识别为"非本实例管理"，第二个进观察模式
  - 场景 E：feishu/dingtalk app_id 锁竞争回归——确保杀掉主进程时 channel workers 也死（`detached` 起的进程组，`ps -A` 看不到遗留 workers）

## 待定

- 进程组 spawn 在某些 Python 父进程 fork + setsid 的场景下会建嵌套进程组；目前假设 hermes-agent gateway 不调 `os.setsid`，先按这个假设实施；如果有嵌套问题再切到 `prctl(PR_SET_PDEATHSIG)`（仅 Linux）方案

## 已知限制

- **多 GUI 实例同时点 takeover**：两个 GUI 几乎同时调 takeover，会出现"先 stop 外部成功，再 start 失败"或"两个 start 并发抢锁"——接受这种竞态，最坏后果是用户手动重试一次
- **崩溃兜底依赖下次启动**：电源断电 / `kill -9` GUI 进程 + 不再启动 GUI 的情况下，孤儿 gateway 永远不被清。文档里说明这一点
