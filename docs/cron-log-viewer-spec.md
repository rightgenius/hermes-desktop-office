# 定时任务完整日志查看器规格

## 背景与目标

当前“定时任务审计 > 执行日志”只展示 `~/.hermes/cron/logs/*.jsonl` 中被 GUI watcher 收集到的事件。实际定时任务还会把最终回复写到 `~/.hermes/cron/output/<jobId>/*.md`，运行过程和错误可能写到 `~/.hermes/logs/agent.log`、`errors.log`、`gateway.log`。当 watcher 误创建 active 记录或没有正确关联 output 文件时，页面只显示 `run_start` 和策略事件，看不到实际执行对话。

本功能目标：用户选中任意定时任务执行记录后，可以查看与该次执行相关的所有日志文件原文，允许多个文件用标签页展示，并支持实时刷新仍在增长的文件。

## 范围

### 必须实现

- 在执行日志详情区新增“事件视图 / 文件视图”切换。
- 文件视图以标签页展示同一次 run 相关的多个日志文件。
- 每个标签页展示文件原始内容，保留换行和等宽字体，支持纵向滚动。
- 对 active 文件和仍在增长的日志文件支持实时刷新。
- 支持手动刷新当前文件和刷新文件列表。
- 支持复制当前文件内容。
- 支持在文件内容内搜索关键词。
- 不修改 `src/hermes-agent/` 子模块。

### 不做

- 不实现日志内容编辑。
- 不实现跨文件全文索引数据库。
- 不把 4GB 级别的 `gateway.error.log` 整文件读进前端。
- 不改变 cron 调度执行逻辑。

## 数据源与关联规则

### 主数据源

后端新增 IPC 聚合接口，从以下位置发现文件：

- 审计 JSONL：`~/.hermes/cron/logs/*.jsonl`、`~/.hermes/cron/logs/*.jsonl.active`
- 最终输出：`~/.hermes/cron/output/<jobId>/*.md`
- Agent 运行日志过滤视图：`~/.hermes/logs/agent.log`、轮转文件 `agent.log.1` 到 `agent.log.5`
- 错误日志过滤视图：`~/.hermes/logs/errors.log`、轮转文件 `errors.log.1` 到 `errors.log.5`
- Gateway 诊断过滤视图：`~/.hermes/logs/gateway.log`

全局日志文件不作为“原始整文件”展示。`agent.log`、`errors.log`、`gateway.log` 只能通过后端生成过滤后的虚拟文件；默认文件列表只包含高置信度匹配结果，低置信度时间窗口内容必须由用户显式开启。

### run 关联

后端根据 `runId` 读取审计 JSONL，取出：

- `jobId`
- `jobName`
- `summary.startedAt`
- `summary.finishedAt`
- 所有 `run_start.startedAt`
- `run_end.output`

文件关联规则：

- 审计文件：精确匹配当前 `runId`。
- output 文件：限定 `~/.hermes/cron/output/<jobId>/`，优先选择修改时间在 run 时间窗口内的 `.md`。
- 时间窗口：
  - 已完成 run：`startedAt - 10s` 到 `finishedAt + 10s`
  - active run：`startedAt - 10s` 到 `min(当前时间, startedAt + 15m)`
- 如果 active run 没有关联到 output 文件，但同 jobId 最新 output 文件的 mtime 在 `last_run_at ± 30s` 内，也作为候选并标记 `confidence: "time-near"`.
- `agent.log` / `errors.log`：默认只展示带 session 标记的行，正则为 `\\[cron_<jobId>_\\d{8}_\\d{6}\\]`，标记 `confidence: "session"`。
- `gateway.log`：默认只展示明确包含当前 `jobId`、`cron_<jobId>`、关联 output 路径或 `Request debug dump` 中当前 session 标记的行，标记 `confidence: "explicit"`。
- 时间窗口匹配只能作为排查模式，标记 `confidence: "time-window"`，默认不出现在文件标签页中。用户点击“显示推断日志”后才加载，并在 UI 顶部提示“按时间窗口推断，可能包含无关日志”。
- 如果某类全局日志没有高置信度匹配，不创建空标签页。
- 后端返回的每个全局日志虚拟文件必须包含 `filterDescription`，说明使用了 session、explicit 还是 time-window 规则。

## IPC 接口

在 `src/preload/index.js` 暴露：

- `cronLogFilesList(runId, options)`
- `cronLogFileRead(fileId, options)`

在 `src/main/ipc-handlers.js` 注册：

```js
ipcRenderer.invoke('cron:logs:files:list', runId, { includeInferred })
ipcRenderer.invoke('cron:logs:files:read', fileId, { offset, limitBytes, tail })
```

### `cron:logs:files:list`

入参：

```json
{
  "runId": "1781593386700-qm7tykpd",
  "options": {
    "includeInferred": false
  }
}
```

返回：

```json
{
  "success": true,
  "runId": "1781593386700-qm7tykpd",
  "files": [
    {
      "id": "audit:1781593386700-qm7tykpd",
      "kind": "audit-jsonl",
      "label": "审计 JSONL",
      "path": "/Users/nius/.hermes/cron/logs/2026-06-16T07-03-06-700Z_1781593386700-qm7tykpd.jsonl",
      "sizeBytes": 9261,
      "mtimeMs": 1781593386700,
      "active": false,
      "confidence": "exact"
    },
    {
      "id": "output:3c3223e9352a:2026-06-16T07-03-04-963Z.md",
      "kind": "output-md",
      "label": "最终输出",
      "path": "/Users/nius/.hermes/cron/output/3c3223e9352a/2026-06-16T07-03-04-963Z.md",
      "sizeBytes": 75,
      "mtimeMs": 1781593384963,
      "active": false,
      "confidence": "time-near"
    },
    {
      "id": "agent:3c3223e9352a:2026-06-16T07-03-02.878Z",
      "kind": "agent-log-filtered",
      "label": "Agent 日志",
      "path": "/Users/nius/.hermes/logs/agent.log",
      "sizeBytes": 505454,
      "mtimeMs": 1781593500000,
      "active": true,
      "confidence": "session",
      "filterDescription": "仅显示包含 [cron_3c3223e9352a_YYYYMMDD_HHMMSS] session 标记的行"
    }
  ]
}
```

### `cron:logs:files:read`

入参：

```json
{
  "fileId": "output:3c3223e9352a:2026-06-16T07-03-04-963Z.md",
  "options": {
    "offset": 0,
    "limitBytes": 262144,
    "tail": false
  }
}
```

返回：

```json
{
  "success": true,
  "fileId": "output:3c3223e9352a:2026-06-16T07-03-04-963Z.md",
  "content": "# Generated Test Output\\n\\nFinal result: 42\\n",
  "offset": 0,
  "nextOffset": 42,
  "sizeBytes": 42,
  "mtimeMs": 1781593384963,
  "truncatedBefore": false,
  "truncatedAfter": false,
  "active": false
}
```

读取限制：

- 默认每次最多读取 `256 KB`。
- 文件大于 `1 MB` 时默认 tail 最后 `256 KB`，顶部显示“已显示文件末尾 256 KB，可点击加载更早内容”。
- `agent.log`、`errors.log`、`gateway.log` 只返回过滤后的虚拟内容，不返回整文件。
- 高置信度虚拟文件最多返回最近 `2 MB` 的匹配内容；超过时保留尾部并设置 `truncatedBefore: true`。
- 时间窗口推断虚拟文件最多返回最近 `512 KB` 的匹配内容，并始终返回 `confidence: "time-window"`。
- `fileId` 必须由 `cron:logs:files:list` 生成，后端不得接受任意前端路径读取。

## 后端实现要求

新增 `src/main/cron-log-files.js`，职责：

- 根据 `runId` 调用现有 `CronLogStore.getRun(runId)` 或复用同等逻辑定位审计文件。
- 生成文件清单和稳定 `fileId`。
- 维护进程内 `fileId -> descriptor` 缓存，缓存 TTL 为 10 分钟。
- 安全读取文件内容，防止路径逃逸。
- 对 `agent.log`、`errors.log`、`gateway.log` 提供过滤后的虚拟文件内容；默认只返回高置信度匹配，时间窗口推断必须由单独参数启用。

修改 `src/main/cron-manager.js`：

- 暴露 `listExecutionLogFiles(runId, options)`。
- 暴露 `readExecutionLogFile(fileId, options)`。
- 修正重复 `run_start`：`logStore.startRun(job)` 已写入开始事件时，不再追加第二个 `run_start`。
- 修正 watcher 启动时误建 active 记录的问题：启动时应 seed `_lastSeenRunAt`，但提供“最近输出文件”关联，让用户仍可查看历史输出。

修改 `src/main/ipc-handlers.js`：

- 增加 `cron:logs:files:list`。
- 增加 `cron:logs:files:read`。

修改 `src/preload/index.js`：

- 增加 `cronLogFilesList(runId, options)`。
- 增加 `cronLogFileRead(fileId, options)`。

## 前端 UI 规格

修改 `src/renderer/index.html`：

- 在 `cron-log-detail` 内保留现有事件视图。
- 增加详情内部视图切换：
  - `事件`
  - `文件`

文件视图结构：

- 顶部工具栏：
  - 文件标签页列表
  - “刷新列表”按钮
  - “刷新当前”按钮
  - “自动刷新”开关
  - “显示推断日志”开关
  - 搜索输入框
  - “复制”按钮
- 内容区：
  - `<pre>` 原文展示
  - 大文件提示条
  - 读取失败提示
  - 空状态“没有关联日志文件”

交互：

- 选中 run 后，默认仍显示事件视图，避免破坏当前使用习惯。
- 点击“文件”后加载文件列表。
- 文件标签默认排序：
  1. 审计 JSONL
  2. 最终输出 Markdown
  3. Agent 日志（仅有 session 标记匹配时出现）
  4. 错误日志（仅有 session 标记匹配时出现）
  5. Gateway 诊断日志（仅有 explicit 匹配时出现）
  6. 推断日志（用户打开“显示推断日志”后出现）
- 标签显示 `label`、大小、active 状态和置信度。
- `confidence: "time-window"` 标签必须显示醒目的“推断”标记，不得与精确任务日志混淆。
- active 文件标签显示小圆点或“实时”标记。
- 自动刷新开启时，每 2 秒重新读取当前标签；如果文件大小未变，不重绘内容。
- 自动刷新只对 `active: true` 或当前 run 状态为 `running/unknown` 默认开启；已完成 run 默认关闭。
- “显示推断日志”默认关闭。开启后重新调用 `cronLogFilesList(runId, { includeInferred: true })`，追加时间窗口推断虚拟文件。
- 刷新时保留用户滚动位置：
  - 如果用户在底部 24px 内，刷新后继续滚到底部。
  - 如果用户正在查看中间内容，刷新后不强制滚动。
- 搜索只在当前文件内容内执行，显示匹配数量，并提供上一个/下一个跳转。

样式：

- 复用现有深色主题变量。
- 日志内容使用 `var(--font-mono)`。
- 标签页不使用嵌套卡片；放在详情区内部工具栏。
- 详情区域应修正滚动容器：`cron-log-detail` 是纵向滚动容器，事件视图和文件视图都不得把内容裁掉。

## 状态与错误处理

- 文件不存在：显示“文件已不存在，请刷新列表”。
- 文件过大：默认 tail，允许加载更早内容。
- 后端读取失败：显示错误文本，不清空现有内容。
- run 无审计文件：文件视图显示空状态，并保留事件视图现状。
- active 文件完成并被 rename：刷新列表后旧 active 标签替换为 finalized 标签，尽量保持同 kind 标签仍被选中。
- 日志轮转：如果 `agent.log` / `errors.log` 被截断或轮转，刷新时重新按 session 标记过滤当前可用文件和轮转文件；不得自动退化到时间窗口。
- 没有 session/explicit 匹配时：不显示 Agent/Error/Gateway 标签，只显示“无精确匹配的全局日志，可开启推断日志辅助排查”。

## 验收标准

- 选择 `2026-06-16T07-03-06-700Z_1781593386700-qm7tykpd.jsonl` 对应 run 时，文件视图能看到：
  - 审计 JSONL
  - `2026-06-16T07-03-04-963Z.md` 最终输出
- 选择 active run 时，文件视图至少能看到 active 审计 JSONL，并随文件增长自动刷新。
- 对同一个 run，事件视图仍能正常显示原有事件。
- 自动刷新不会把正在阅读中部内容的用户强制滚到底部。
- 读取 `gateway.error.log` 这类超大文件不会卡住渲染进程。
- 前端不能通过 IPC 读取任意文件路径。
- 没有 session/explicit 匹配时，默认文件列表不显示 Agent/Error/Gateway 标签。
- 开启“显示推断日志”后，才出现 `confidence: "time-window"` 的推断标签，并展示可能包含无关日志的提示。

## 测试计划

### 单元测试

- `cron-log-files` 能根据 runId 定位审计文件。
- output 文件能按 jobId 和时间窗口关联。
- 大文件读取默认 tail，不超过 `limitBytes`。
- 非法 `fileId` 返回错误。
- 路径逃逸 descriptor 被拒绝。
- `includeInferred: false` 时不返回时间窗口推断日志。
- `includeInferred: true` 时返回推断日志，且所有推断 descriptor 都标记 `confidence: "time-window"`。
- 全局日志有 session 标记匹配时返回过滤虚拟文件；没有 session/explicit 匹配时不创建默认标签。

### 集成测试

- 准备临时 `~/.hermes/cron/logs`、`output`、`logs` fixture。
- 调用 `cron:logs:files:list` 返回多文件列表。
- 调用 `cron:logs:files:read` 能读取审计 JSONL、output MD、过滤后的 agent log。
- active 文件追加内容后再次 read，`sizeBytes` 和 `content` 更新。
- 准备一个只在时间窗口内相关但没有 session 标记的 agent.log fixture，确认默认 list 不返回它，开启 `includeInferred` 后才返回。

### 手动验证

- 启动 `npm run dev`。
- 打开“定时任务 > 执行日志”。
- 选择一条已完成 run，切到“文件”，确认多个标签页可切换。
- 选择一条 active run，打开自动刷新，确认内容实时增长。
- 搜索 `Final result`、`run_start`、`ERROR`，确认匹配跳转正常。
- 复制当前文件内容，粘贴检查完整性。
