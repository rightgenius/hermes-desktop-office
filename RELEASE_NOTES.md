# Release Notes v0.9.5

## 新增与改进

### 定时任务交互

- 定时任务卡片的「立即执行」改为**对话模式**：不再走 gateway 调度队列，而是新建一个 chat session，把任务的内联 prompt（`job.prompt`，兼容老格式 `job.taskPrompt`）作为用户消息发给 agent，然后跳转到对话页面让用户实时看到 agent 的流式响应。任务的定时调度不受影响，gateway 该跑照跑。
- 抽出 `sendChatMessage(text, options)` 公共函数，对话输入框和 cron 触发按钮共用同一条「加入用户消息 → 调 agentSendMessage」路径，cron 触发的 session 支持 `options.title` 覆盖自动生成的标题（侧栏带 ⏰ 前缀）。

### 定时任务可追溯性

- 定时任务卡片标题右侧新增任务 hash（`job.id`，12 字符）小标签，**点击复制到剪贴板**（带「已复制」视觉反馈），方便跟 `~/.hermes/cron/jobs.json` 里的条目一一对应。

## 修复

- 修复 cron 弹窗技能列表 checkbox 漂在 name 标题上方一行的 bug。根因是父元素 `.cron-skill-list` 是 `display: flex`，子 `<label>` 作为 flex item 在 Chromium 里被 blockify，`display: grid` 被静默降级为 `display: block`（CSS Display 规范只规定 blockify 行内级值，这是 Chromium 长期存在的偏差）。改为 2 列 grid + 3 行显式 row 布局（checkbox | name 在第 1 行，description 在第 2 行，path 在第 3 行），并加 `display: grid !important` 绕开 flex item blockify。
- 恢复 cron 弹窗「自动授权策略」三列横排，窄屏（@media max-width:720px）塌成单列，与 `test-cron-modal-ui.js` 的契约对齐（之前被改成单列 flex 时把测试弄挂了）。

## 测试

- 新增 e2e 回归测试 `tests/cron-skill-row-alignment.spec.js`：打开 cron 弹窗，截图技能列表，对每行做硬断言 `|checkbox.top - name.firstChild.top| ≤ 2px`。回滚验证：去掉 `display: grid !important` 测试立即 fail（delta 21.5px），证明测试真的在守这个回归点。
- 主进程 + 渲染回归测试 214 项全过；新增 cron UI e2e 测试 1 项全过。

---

# Release Notes v0.9.4

## 新增与改进

### 定时任务执行审计

- 新增定时任务执行日志的完整详情视图，支持在“事件 / 文件”之间切换。
- 文件视图聚合审计 JSONL、最终 output Markdown、Agent 日志、错误日志和 Gateway 日志，并按 runId、jobId、session 标记和时间窗口关联。
- 日志详情支持文件标签、刷新文件列表、刷新当前文件、复制内容、关键词搜索和“显示推断日志”排查模式。
- 定时任务执行历史现在使用真实 `startedAt` 关联输出文件，避免 watcher 观察时间误导详情匹配。
- GUI watcher 启动时会跳过历史 `last_run_at`，避免重启应用后生成假的 active 执行记录。
- 同一个任务连续触发时会拆分为独立审计 run，旧 run 会标记为 interrupted，避免多个执行详情混在一起。
- 修复详情面板为空白发黑的问题；筛选、清空和重新选择日志时保留详情骨架 DOM。
- 修复详情内容无法滚动的问题，事件视图和文件内容现在在内层面板独立滚动。

### 定时任务调度与自动授权

- GUI 新建和编辑定时任务时保存结构化 `schedule`，与 Hermes Agent cron scheduler 兼容。
- 编辑弹窗会正确回填已有调度配置，未修改调度时不会把原 schedule 覆盖成默认值。
- 支持 interval、cron 表达式和一次性时间三类调度输入的规范化与 next run 计算。
- 定时任务自动授权接入 GUI、bridge、主进程配置和前端策略选择。
- 新增内置 denylist、自动授权决策事件和权限审计 tab，帮助排查定时任务执行时的授权决策。
- 定时任务卡片里的“下次 / 上次”现在直接显示具体本地时间，不再显示“几分钟前 / 几分钟后”。

### Gateway 与运行状态

- 定时任务触发逻辑由 GUI 手动触发改为观察 `jobs.json`、output 和审计文件的 watcher 模式，避免 GUI 与 Gateway 调度职责混淆。
- Gateway 外部进程运行时会提示 `dws` / `lark-cli` 可能不可用或版本不一致，并引导使用 GUI 接管。
- 定时任务页的“已停止”语义调整为“GUI 同步已停止”，避免误解为 Gateway scheduler 停止执行任务。
- 修复打包依赖扁平化和 `cron:trigger` 返回结构不一致导致的相关问题。

### 稳定性修复

- 修复首次聊天前 Agent warmup 时机导致的问题。
- 修复桌面审批提示的恢复和关闭清理行为。
- 修复输入法组合状态下按 Enter 误发送消息的问题。
- 修复 IPC handler 幂等注册时 wrapper 递归调用自身的问题。
- packaged smoke test 在 CI 中跳过会真实调用 LLM 的 case，减少发布构建误失败。
- 更新 hermes-agent 子模块到包含 remote-gateway artifact 的版本。

## 文档

- 新增定时任务完整日志查看器规格。
- 新增定时任务调度编辑修复规格。
- 新增运行状态提示与恢复入口规格。
- README 补充定时任务自动授权与审计说明。

## 验证

- 主进程与渲染回归测试 214 项通过。
- 新增 cron 日志文件关联、历史 run 起始时间、重启 watcher、连续 run、详情空白、详情滚动和定时任务绝对时间展示等回归测试。

## 历史版本

---

# Release Notes v0.9.3

## 修复

- 修复打包应用中 Agent 终端执行 `dws` 或 `lark-cli` 时提示 `command not found` 的问题。
- Agent 与 Gateway 子进程启动时会把随应用打包的 CLI 目录加入 `PATH`。
- Windows 使用现有的 `Path` 环境变量和分号分隔符，macOS/Linux 使用 `PATH` 和冒号分隔符。
- CLI 路径解析统一复用同一套跨平台逻辑，避免 GUI 与 Agent 使用不同路径。

## 验证

- 主进程测试 62 项通过。
- 已从 macOS 打包目录验证 `dws --version` 与 `lark-cli --version` 可通过注入后的 `PATH` 直接执行。
- 新增 Windows 与 POSIX PATH 处理、打包路径解析和缺失单个 CLI 时的回归测试。

## 历史版本

---

# Release Notes v0.9.2

## 修复

- 修复 Windows 打包应用误把 `app.asar/src/hermes-agent` 识别为开发环境的问题。
- 打包模式下 Agent 和 Gateway 强制使用 `Resources/hermes-agent` 与 bundled Python runtime。
- Hermes Agent 不再重复打入 `app.asar`，避免路径歧义并减小安装包体积。

## 验证

- 新增打包模式 Hermes Agent 路径选择回归测试。
- 新增 asar 不包含 Hermes Agent 的构建配置回归测试。
- 主进程测试 58 项通过，Skills scanner 40 项通过。

## 历史版本

---

# Release Notes v0.9.1

## 修复

- 修复 macOS CI 和 Release 构建未打包 standalone Python runtime 与 Agent Python 依赖的问题。
- 为 Windows、Linux 和 macOS 构建统一使用 Python 3.13 生成 Agent 依赖。
- 修复跨平台连续构建时可能复用其他操作系统 Python runtime 缓存的问题。
- 修复 Linux CI 可能把 `chrome-sandbox` 等辅助程序误认为应用入口的问题。

## 验证改进

- packaged smoke test 会真实启动 Agent，并等待 bridge 返回“Agent 已就绪”。
- Windows/Linux CI 可检测 Python 架构、ABI、DLL/so 和依赖加载错误。
- 新增 CI/Release 构建顺序与 runtime 平台缓存回归测试。

## 支持平台

- macOS Apple Silicon
- Windows x64
- Linux x64

## 历史版本

---

# Release Notes v0.9.0

## 版本定位

v0.9.0 是面向普通办公用户的桌面体验版本。这个版本强调“下载应用即可使用”：把 Hermes Agent、飞书 CLI、钉钉 CLI、Office Skills、Python runtime 和图形界面整合到一个桌面程序中，减少非程序员手动安装依赖、下载命令行工具和编辑配置文件的成本。

## 新增与改进

### 中文产品说明
- README 改为中文，说明项目目标、适用人群和核心功能。
- 明确普通用户使用安装包即可运行，不需要自行安装 Node.js、Python、CLI 或 Office 依赖。
- 补充开发者运行、测试和构建入口。

### 图形界面能力整理
- 对话、设置、Gateway、Skills、日志、定时任务和工作区面板能力集中说明。
- 强调飞书 CLI 和钉钉 DWS CLI 已由桌面应用聚合封装。
- 明确 Office 文档技能随应用打包。

### Agent 日志页增强
- 日志支持 INFO/WARN/ERROR/DEBUG 级别着色。
- 支持按级别过滤、关键词搜索、可见日志导出和日志行数统计。
- 保留自动滚动到底部的使用体验。

### 文档与发布流程
- `docs/tasks.md` 成为当前 backlog 的权威入口。
- `docs/phase-10-ui-plan.md` 标记为历史 UI 重构计划，避免重复执行旧 checklist。
- 新增测试入口说明：`docs/testing.md`。
- 新增发布/打包验收清单：`docs/release-checklist.md`。
- 更新安装与开发指南：`docs/install.md`。
- 为模型 API 配置文档增加高变动信息核验规则。

## 面向用户的安装说明

正式安装包应包含：
- Electron 桌面运行时
- Hermes Agent
- standalone Python runtime
- Hermes Agent Python 依赖
- 飞书 `lark-cli`
- 钉钉 `dws`
- Office / 飞书 / 钉钉 Skills

普通用户下载对应系统安装包后即可打开应用并按向导配置。

## 支持平台

- macOS Apple Silicon
- Windows x64
- Linux x64

## 验证

本版本准备过程中已验证：

```bash
npm run test:main
npm run test:scanner
node --check src/renderer/log-utils.js
node --check src/renderer/app.js
node --check src/main/ipc-handlers.js
node --check src/preload/index.js
```

## 历史版本

---

# Release Notes v0.4.0

## What's New

### Collapsible Tool Calls
- Completed tool calls automatically collapse into a summary badge (e.g. "✓ 5 个工具完成")
- Running tools remain visible with a warning border and spinner
- Click the summary to expand and see individual tool call details
- Each tool call can be further expanded to view arguments and results
- Error counts are shown separately in the summary

### Chinese Tool Names
- All tool calls now display user-friendly Chinese names instead of technical identifiers
- Examples: `terminal` → 执行命令, `read_file` → 读取文件, `skill_view` → 查看技能
- Supports pattern matching for `browser_*`, `mcp_*`, `ha_*`, `feishu_*` prefixed tools

## Improvements

- Separate CI and Release workflows for cleaner automation
- Drop macOS x64 build target (macOS arm64 only)
- Add CI/CD documentation to AGENTS.md
- New E2E test suite for collapsible tool call UI (10 tests)

## Supported Platforms

- macOS arm64
- Windows x64
- Linux x64
