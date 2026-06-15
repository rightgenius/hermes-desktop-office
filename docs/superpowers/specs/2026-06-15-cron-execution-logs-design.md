# 定时任务执行日志设计

**日期:** 2026-06-15
**状态:** 已确认

## 目标

为每次定时任务执行保存可审计记录，在桌面界面中查看执行状态、时间、Agent 输出、工具调用和执行期间的控制台输出。日志使用全局容量上限，默认 100 MB，用户可在界面修改；达到上限时优先删除最旧的完整执行记录，且单次执行日志也不能无限增长。

## 方案选择

采用独立的 JSONL 日志存储层，而不是继续扩展现有 Markdown 最终输出文件，也不使用数据库。

- Markdown 文件无法可靠保存不同类型事件、状态和控制台级别。
- SQLite 对当前规模引入额外原生依赖和打包复杂度。
- JSONL 可以边执行边追加，进程异常退出时仍保留已写内容，并且无需新增依赖。

## 架构

### AgentManager 内部事件

`AgentManager` 继承 `EventEmitter`，在继续向 renderer 发送现有 IPC 的同时发出内部事件：

- `response`: `{ event, data, sessionId, timestamp }`
- `log`: `{ level, message, timestamp }`

定时任务执行器按 `sessionId` 订阅 response。Agent 进程 stdout 中无法解析为协议 JSON 的文本和 stderr 没有 session 标识，因此在定时任务执行窗口内记录为该次执行的控制台日志。当前 cron tick 串行执行任务，不会同时归属到多个 cron run。

### CronLogStore

新增 `src/main/cron-log-store.js`，负责：

- 路径：`~/.hermes/cron/logs/`
- 每次执行创建 `<started-at>_<run-id>.jsonl.active`
- 每行是一个带时间戳的结构化事件
- 完成后追加 `run_end` 并原子重命名为 `.jsonl`
- 列出执行摘要、读取单条详情、按任务筛选、清空日志
- 统计当前存储量
- 按全局容量上限删除最旧 `.jsonl`
- 活跃文件达到可用容量后停止写入普通事件，并保留一条 `log_truncated` 标记
- 应用异常退出遗留的 `.active` 文件在下次扫描时作为 `interrupted` 记录展示

日志上限来自 GUI config 的 `cronLogMaxMb`，默认 100 MB。合法范围为 10 MB 到 10240 MB，保存时取整。容量回收只删除完整或中断记录，不删除当前正在写入的文件。

### CronManager 集成

每次 `_runJob`：

1. 创建 run 日志并写入任务快照。
2. 订阅 AgentManager 内部 response/log 事件。
3. 记录 Agent 文本 chunk、reasoning/status、工具开始/结束、控制台输出。
4. 执行成功或失败后写入结束状态、耗时、错误和最终输出。
5. 结束订阅并触发容量回收。
6. 向 renderer 发送 `cron-log-updated`，使日志列表和当前详情自动刷新。

保留原有 `output/{job_id}/*.md` 最终输出兼容行为。

## IPC

新增：

- `cron:logs:list({ jobId, limit })`
- `cron:logs:get(runId)`
- `cron:logs:clear()`
- `cron:logs:settings:get()`
- `cron:logs:settings:set({ maxMb })`
- renderer event `cron-log-updated`

所有读取接口只接受存储层返回的 run id，不接受任意文件路径。

## 界面

定时任务页面保留现有任务卡片，并新增“执行日志”审计区：

- 存储量显示：已用 / 上限
- 上限输入框（MB）和保存按钮
- 任务筛选（全部任务或指定任务）
- 刷新与清空按钮
- 执行列表：状态、任务名、开始时间、耗时、日志大小
- 详情：按时间顺序显示事件；控制台行保留 INFO/WARN/ERROR 级别；工具调用和 Agent 输出使用不同样式
- 每个任务卡片增加“执行日志”按钮，点击后自动筛选该任务

所有动态文本经过 `escapeHtml()`，日志详情不渲染任意 HTML。

## 错误处理

- 单条损坏 JSON 行跳过，其余事件仍可读取。
- 缺少结束事件的 `.active` 文件标记为“执行中”；若对应 session 已不存在则在应用重启后的扫描中显示“已中断”。
- 写盘错误不改变任务本身的执行结果，但通过 Agent 运行日志报告。
- 设置非法容量时 IPC 返回错误，界面保留原值。
- 清空操作需要用户确认，且不删除当前活跃日志。

## 测试

- `CronLogStore`：流式写入、摘要与详情、失败状态、遗留 active、容量淘汰、单次日志截断、清空、参数校验。
- `AgentManager`：内部 response/log 事件与现有 renderer IPC 同时发送。
- `CronManager`：执行成功/失败时订阅、记录和清理监听器。
- IPC/preload 与 renderer 静态回归：接口暴露、控件存在、动态文本转义。
- 全量 `npm run test:main`，并在开发模式打开 cron 页面验证布局、容量设置和日志详情。
