# 定时任务调度编辑修复规格

## 背景

当前 GUI 定时任务页直接读写 `~/.hermes/cron/jobs.json`，但保存的 `schedule` 是字符串，例如 `"every 10m"`。Gateway 内的 Hermes Agent `cron.scheduler` 实际读取同一个 `jobs.json`，并期望 `schedule` 是结构化对象，例如：

```json
{
  "kind": "interval",
  "minutes": 10,
  "display": "every 10m"
}
```

这个格式不一致会导致 GUI 新建或编辑后的任务无法可靠计算 `next_run_at`，从而影响 Gateway 的实际触发时间。编辑弹窗还没有回填现有 schedule，用户保存时可能把原来的触发时间覆盖为默认 `every 30m`。

## 目标

- GUI 新建、编辑、立即执行后，`jobs.json` 中的 `schedule` 和 `next_run_at` 必须与 Hermes Agent cron scheduler 兼容。
- 编辑弹窗必须正确回填现有调度配置，未修改调度时不得意外覆盖原触发时间。
- GUI 不再保存裸字符串 schedule；写入 `jobs.json` 的 schedule 必须是结构化对象。
- 编辑定时任务弹窗必须适合编辑长提示词：弹窗加宽，提示词输入框撑满内容区，并提供足够高度。
- 调度方式单选项必须横向展示且不换行；自动授权策略必须改成清晰、紧凑、可点击区域明确的选项样式。
- 不修改 `src/hermes-agent/` 子模块。

## 当前问题

### 1. GUI 保存裸字符串 schedule

`src/renderer/app.js` 的 `getCronSchedule()` 返回字符串：

- `every 10m`
- `30m`
- `0 9 * * *`
- `2026-06-16T15:30`

`saveCronJob()` 将这个字符串作为 `schedule` 和 `schedule_display` 传给 `window.api.cronCreate()` / `window.api.cronUpdate()`。

### 2. Electron CronManager 直接写入字符串

`src/main/cron-manager.js` 的 `createJob()` / `updateJob()` 直接保存 `data.schedule`，没有 parse 或规范化。`_computeNextRun()` 又按 `schedule.kind` 判断，因此对字符串 schedule 会返回 `null`。

### 3. Gateway scheduler 期望结构化 schedule

Hermes Agent `src/hermes-agent/cron/jobs.py` 中的 `parse_schedule()` 会将字符串解析为结构化对象，`compute_next_run()` 依赖 `schedule["kind"]`、`schedule["minutes"]`、`schedule["expr"]`、`schedule["run_at"]` 等字段。

### 4. 编辑弹窗不回填 schedule

`editCronJob()` 只回填任务名、提示词、重复次数、工作目录和自动授权策略，没有把现有 `job.schedule` 解析回表单控件。保存时会使用默认选中的“间隔执行 every 30m”覆盖原 schedule。

### 5. 编辑弹窗布局不适合长内容

当前编辑定时任务弹窗宽度偏窄，`textarea` 没有撑满弹窗内容区，导致长提示词只能在很小区域内编辑。调度方式单选项在窄宽度下被迫换行，标签阅读困难。自动授权策略的单选项视觉上像散落的文字和圆点，点击目标不明确，也没有清楚表达当前选中状态。

## 设计决策

### schedule 规范形态

GUI 主进程写入 `jobs.json` 时必须保存以下结构之一：

```json
{ "kind": "interval", "minutes": 10, "display": "every 10m" }
```

```json
{ "kind": "cron", "expr": "0 9 * * *", "display": "0 9 * * *" }
```

```json
{ "kind": "once", "run_at": "2026-06-16T15:30:00+08:00", "display": "once at 2026-06-16 15:30" }
```

`schedule_display` 只作为 UI 展示字段，值必须来自结构化 schedule 的 `display` 字段，不能作为调度真值。

### 解析策略

实现时不要修改 Hermes Agent 子模块。Electron 主进程新增本地等价解析逻辑，行为对齐 Hermes Agent `cron.jobs.parse_schedule()` 的 GUI 已支持输入范围：

- `every <number>m|h|d`
- `<number>m|h|d`
- 5 位 cron 表达式
- `datetime-local` 产生的 ISO-like 字符串

不要求支持 Hermes Agent 未来新增的所有 schedule 语法；但当前 GUI 能输入的语法必须 100% 解析成 Gateway 兼容对象。

### next_run_at 计算策略

`CronManager._computeNextRun(schedule, lastRunAt)` 必须接受结构化 schedule：

- `interval`：没有 `lastRunAt` 时为当前时间 + minutes；有 `lastRunAt` 时为 `lastRunAt + minutes`。
- `once`：返回 `schedule.run_at`。
- `cron`：GUI 侧可不完整实现 croniter；保存时允许 `next_run_at` 为 `null`，但必须让 Gateway 在下次读到结构化 schedule 后通过 Hermes Agent 自己恢复。

如果不引入 JS cron 解析依赖，则 cron 表达式在 GUI 保存后 `next_run_at` 可为 `null`，但 `schedule.kind === "cron"` 和 `schedule.expr` 必须正确，确保 Gateway 的 `get_due_jobs()` 能恢复 `next_run_at`。

## 实现要求

### 后端：Electron CronManager

修改 `src/main/cron-manager.js`：

- 增加 `parseCronScheduleInput(scheduleInput)`，将 GUI 字符串输入解析为结构化 schedule。
- 增加 `normalizeCronSchedule(schedule)`，兼容已有结构化对象和历史字符串。
- `createJob(data)`：
  - 先 normalize `data.schedule`。
  - 保存结构化 `schedule`。
  - 保存 `schedule_display: schedule.display`。
  - 用结构化 schedule 计算 `next_run_at`。
- `updateJob(jobId, updates)`：
  - 如果 `updates.schedule` 存在，先 normalize。
  - 只有 schedule 变更时才重算 `next_run_at`。
  - 未传 schedule 时不得改动原 schedule 或 `next_run_at`。
- `_computeNextRun()` 改为只处理结构化 schedule，并对历史字符串先 normalize。
- `listJobs()` 返回前可对历史字符串 schedule 做只读 normalize，用于 UI 正确展示；是否立即迁移落盘由后续决定。

### 前端：编辑弹窗回填

修改 `src/renderer/app.js`：

- `editCronJob(jobId)` 必须根据 `job.schedule` 回填表单：
  - `interval`：选中“间隔执行”，填入数值和单位，勾选“重复执行”。
  - `cron`：选中“Cron 表达式”，填入 `expr`。
  - `once`：选中“一次性执行”，填入 `datetime-local` 可接受的本地时间字符串。
  - 历史字符串：按同样规则解析回表单；解析失败则保留默认值并提示用户重新选择调度方式。
- `getCronSchedule()` 可以继续返回 GUI 输入字符串，但推荐改名为 `getCronScheduleInput()`，明确它不是存储格式。
- 保存编辑时，如果用户没有触碰调度控件，应仍提交当前回填后的调度值；不得落回默认 `every 30m`。
- 切换调度类型时继续沿用现有显示/隐藏逻辑。

### IPC 契约

`src/preload/index.js` 和 `src/main/ipc-handlers.js` 的外部方法名不需要变化：

- `cronCreate(data)`
- `cronUpdate(jobId, updates)`

但主进程必须把 `data.schedule` 视为 GUI 输入，不能直接写入存储。

### 前端：编辑弹窗布局与样式

修改 `src/renderer/index.html` 和 `src/renderer/styles.css`，必要时少量调整 `src/renderer/app.js` 中弹窗 class 或状态同步逻辑：

- 编辑定时任务弹窗内容宽度应扩大到适合长提示词编辑：
  - 桌面宽度建议：`min(860px, calc(100vw - 48px))`。
  - 移动或窄窗口下不得溢出视口，应保留左右安全边距。
  - 弹窗主体高度超出视口时，只滚动内容区，底部按钮栏保持可见。
- 提示词输入框必须撑满弹窗内容区宽度：
  - `width: 100%`。
  - `box-sizing: border-box`。
  - 最小高度建议不小于 `220px`。
  - 支持垂直 resize，但不得破坏弹窗布局。
  - 使用现有暗色主题变量，不能出现系统默认白底 textarea。
- 调度方式单选项必须横向排列且不换行：
  - 三个选项“间隔执行 / Cron 表达式 / 一次性执行”在桌面宽度下必须在同一行。
  - 每个选项内部的 radio 和文字保持同一行。
  - `Cron 表达式` 不应拆成多行。
  - 窄窗口下可压缩间距，但应优先保持文字完整；只有在极窄宽度下才允许整体换行。
- 自动授权策略必须改成选项卡片或 segmented radio 样式：
  - 每个策略是一块完整可点击区域，包含 radio、策略名称、说明文字。
  - 选中项应有明显边框或背景高亮，且使用 `--accent` / `--accent-soft` 等语义变量。
  - 三个策略在弹窗宽度足够时横向三列展示；窄窗口可变为单列。
  - 策略文案保持现有含义：
    - 黑名单模式：默认全开，命中内置黑名单时拒绝。
    - 每次询问：危险命令弹窗确认。
    - 白名单模式：仅放行明确允许的命令。
  - “查看内置黑名单”链接保留，并与说明文本对齐，不应挤压单选项布局。
- 重复执行 checkbox 和标签应使用一致的表单布局：
  - checkbox 与“重复执行”文字同一行。
  - 不应出现 checkbox 单独漂在上方、文字在下方的布局。
  - 点击文字也应能切换 checkbox。
- 所有样式必须使用现有语义 CSS 变量，例如 `--bg-secondary`、`--bg-tertiary`、`--border-color`、`--text-primary`、`--text-secondary`、`--accent`，不要新增硬编码主题色。

### 历史数据兼容

已有 `jobs.json` 中可能存在：

```json
"schedule": "every 10m"
```

实现必须兼容读取和编辑这些历史任务：

- `listJobs()` 能返回可被 UI 回填的 schedule 信息。
- `updateJob()` 保存后应写成结构化 schedule。
- 不要求启动时批量迁移所有历史任务。

## 验收标准

- 新建“每 10 分钟”任务后，`jobs.json` 中保存：

```json
"schedule": { "kind": "interval", "minutes": 10, "display": "every 10m" }
```

- 编辑一个已有 `"schedule": "every 10m"` 的历史任务并保存后，`jobs.json` 中 schedule 变成结构化对象。
- 编辑任务时，弹窗能正确显示现有间隔、cron 表达式或一次性时间，不会默认覆盖为 `every 30m`。
- 保存 interval schedule 后，`next_run_at` 是当前时间或 `last_run_at` 加上 interval。
- 保存 once schedule 后，`next_run_at` 等于 `run_at`。
- 保存 cron schedule 后，`schedule.kind === "cron"` 且 `schedule.expr` 正确；Gateway 能在后续 tick 中恢复或计算下一次执行时间。
- “立即执行”仍只设置 `next_run_at = now`，不改变 schedule 对象。
- 编辑定时任务弹窗在桌面视口下明显加宽，提示词输入框占满内容区宽度，长提示词可以舒适编辑。
- 调度方式三个单选项在桌面视口下同一行展示，文字不拆行。
- 自动授权策略显示为三块清晰的可点击选项，选中状态明确，说明文字不挤压、不错位。
- 重复执行 checkbox 与标签在同一行，点击标签可切换。
- 在窄窗口下弹窗不横向溢出，内容区可滚动，底部取消/保存按钮仍可见。

## 测试计划

### 单元测试

新增或扩展主进程可测试模块：

- `parseCronScheduleInput("every 10m")` 返回 `{ kind: "interval", minutes: 10, display: "every 10m" }`。
- `parseCronScheduleInput("every 2h")` 返回 minutes `120`。
- `parseCronScheduleInput("1d")` 返回 `{ kind: "once", run_at: <ISO>, display: "once in 1d" }`。
- `parseCronScheduleInput("0 9 * * *")` 返回 `{ kind: "cron", expr: "0 9 * * *", display: "0 9 * * *" }`。
- `normalizeCronSchedule({ kind: "interval", minutes: 5 })` 保留结构化对象并补齐 display。
- `_computeNextRun({ kind: "interval", minutes: 10 }, lastRunAt)` 返回 `lastRunAt + 10m`。
- `_computeNextRun({ kind: "once", run_at })` 返回 `run_at`。

### 集成测试

- 用临时 cron 目录创建任务，调用 `createJob({ schedule: "every 10m" })`，断言落盘 schedule 是结构化对象。
- 对历史字符串任务调用 `updateJob(jobId, { schedule: "every 30m" })`，断言落盘 schedule 结构化且 `next_run_at` 更新。
- 调用 `updateJob(jobId, { name: "new name" })`，断言 schedule 和 `next_run_at` 不变。

### 手动验证

- 启动 `npm run dev`。
- 新建 interval、cron、once 三类任务，检查 `~/.hermes/cron/jobs.json`。
- 分别编辑三类任务，确认弹窗回填正确。
- 打开包含长提示词的任务，确认提示词 textarea 撑满弹窗宽度且高度足够，不再显示为小白框。
- 检查调度方式三项在桌面视口同一行展示，`Cron 表达式` 不换行。
- 检查自动授权策略三项的选中态、hover 态、点击区域和说明文字布局。
- 缩窄窗口后重新打开弹窗，确认弹窗不溢出视口，内容区可滚动，底部按钮可操作。
- 修改 interval 后保存，确认 Gateway 下一次 tick 能按新的 `next_run_at` 执行。
- 点击“立即执行”，确认 schedule 对象保持不变，只更新 `next_run_at`。

## 风险与注意事项

- 不要直接调用或修改 `src/hermes-agent/cron/jobs.py`；它是 submodule。
- 不要把 `schedule_display` 当成调度真值。
- 不要在 renderer 中写入最终存储结构；最终规范化必须在主进程完成。
- 不要在编辑弹窗打开时重置 schedule 控件，必须先根据任务数据回填。
- cron 表达式如果 GUI 不计算下一次时间，必须至少保存结构化对象，让 Gateway 恢复。
- 不要只给 textarea 设置固定像素宽度；必须让它跟随弹窗内容区响应式撑满。
- 不要为了避免换行而让弹窗内容横向滚动；调度方式和授权策略要通过布局约束解决。
