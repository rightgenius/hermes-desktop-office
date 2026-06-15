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
