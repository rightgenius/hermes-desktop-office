# Hermes Desktop for Office

Hermes Desktop for Office 是一个面向办公场景的桌面 AI 助手。它把 Hermes Agent、飞书 CLI、钉钉 CLI、Office 文档技能和图形界面打包在一起，让非程序员也能通过一个应用完成配置、授权、对话、日志查看和企业办公工具调用。

**镜像仓库**：[GitHub](https://github.com/rightgenius/hermes-desktop-office) | [Gitee](https://gitee.com/nius/hermes-desktop-office)

## 适合谁使用

这个项目的目标不是让用户自己搭环境、装 Python、下载命令行工具、调配置文件，而是提供一个已经打包好的桌面程序：

- 不熟悉命令行的办公用户，可以通过图形界面完成配置和授权。
- 需要同时使用飞书、钉钉和 Office 文档能力的团队，可以在一个入口里集中管理。
- 需要本地运行 AI Agent 的用户，可以直接启动、停止、查看日志和切换工作区。
- 开发者仍然可以从源码运行和调试，但普通用户不需要自己折腾依赖。

## 主要功能

### 图形界面

- 三栏式桌面界面：左侧导航、中间会话/工作区面板、右侧主内容区。
- 设置页：配置模型服务商、API Key、端点 URL、默认模型和工作区。
- 对话页：与 Hermes Agent 聊天，支持流式输出、Markdown 渲染、会话历史和停止生成。
- 工作区面板：选择目录、浏览文件树、预览常见文本文件。
- 技能页：查看内置 Skills、用户 Skills 和 Agent 生成的 Skills，并管理启用状态。
- 日志页：启动/停止/重启 Agent，支持日志级别着色、过滤、搜索、统计和导出。
- Gateway 页：管理飞书/钉钉消息 Gateway、平台配置、扫码注册、Channel 列表和实时日志。
- 定时任务页：创建和管理本地定时任务。

### 聚合飞书和钉钉 CLI

应用内置并封装两个办公平台 CLI：

- **飞书 / Lark CLI**：用于飞书授权、权限状态检查和飞书相关办公能力。
- **钉钉 / DWS CLI**：用于钉钉授权、组织访问和钉钉工作空间能力。

用户不需要手动下载 CLI，也不需要记住命令行参数。授权、状态检查、诊断和平台配置都可以在界面里完成。

### 内置 Hermes Agent

- 内置 Hermes Agent 子进程管理。
- 支持通过图形界面启动、停止、重启 Agent。
- 支持将当前工作区传给 Agent，让对话和文件上下文关联。
- 支持 Agent 运行日志、工具调用状态和错误信息展示。

### Office 文档技能

项目随包提供 Office 文档相关 Skills：

- Word / DOCX 文档处理。
- PowerPoint / PPTX 演示文稿处理。
- Excel / XLSX 表格处理。
- 飞书、钉钉和 DWS 相关办公技能。

这些能力会随应用一起打包，不要求普通用户自己安装 Python 包或整理技能目录。

### 已打包依赖

正式安装包包含运行所需组件：

| 组件 | 说明 |
|------|------|
| Electron 桌面运行时 | 图形界面基础 |
| Hermes Agent | 本地 AI Agent |
| Python Runtime | 独立 Python 运行时 |
| Hermes Agent 依赖 | 打包到应用资源目录 |
| 飞书 CLI | `lark-cli` 预编译二进制 |
| 钉钉 CLI | `dws` 预编译二进制 |
| Office Skills | 文档、表格、演示文稿相关技能 |

普通用户安装应用后即可使用，不需要额外安装 Node.js、Python、pip、uv、飞书 CLI 或钉钉 CLI。

## 安装方式

请从 Release 页面下载对应系统的安装包：

- macOS Apple Silicon：`.dmg`
- Windows x64：`.exe`
- Linux x64：`.AppImage` 或 `.deb`

首次启动后，按向导完成：

1. 选择或填写模型服务商、API Key、端点 URL 和默认模型。
2. 选择工作区目录。
3. 按需完成飞书授权。
4. 按需完成钉钉授权。
5. 启动 Agent，开始使用。

详细说明见 [安装与开发指南](docs/install.md)。

## 当前版本

当前版本：**0.9.0**

本版本重点完善了普通用户可直接使用的桌面体验：

- 中文 README 和面向非程序员的产品说明。
- Agent 日志页增强：过滤、搜索、导出、统计和级别着色。
- 文档待办清理：明确 `docs/tasks.md` 是当前 backlog 来源。
- 安装、测试和发布文档补齐。

完整版本说明见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

## 给开发者

普通用户不需要阅读本节。开发者从源码运行时可使用：

```bash
git submodule update --init --recursive
npm install
npm run setup:agent
npm run download-clis
npm run dev
```

常用测试：

```bash
npm run test:main
npm run test:scanner
npm run test:e2e:gateway
```

跨平台构建：

```bash
npm run prebuild:mac
npm run build:mac

npm run prebuild:win
npm run build:win

npm run prebuild:linux
npm run build:linux
```

更多测试和发布流程见：

- [测试入口说明](docs/testing.md)
- [发布/打包验收清单](docs/release-checklist.md)

## 项目结构

```text
hermes-desktop-office/
├── src/
│   ├── main/              # Electron 主进程、Agent/Gateway/IPC 管理
│   ├── renderer/          # 桌面图形界面
│   ├── preload/           # 安全暴露给界面的 API
│   └── hermes-agent/      # Hermes Agent submodule，请勿直接修改
├── assets/
│   ├── feishu-cli/        # 飞书 CLI 二进制
│   ├── dws-cli/           # 钉钉 CLI 二进制
│   └── python-runtime/    # 打包用 Python Runtime
├── skills/office/         # Office、飞书、钉钉相关技能
├── scripts/               # CLI 下载、Python/依赖打包、发布同步脚本
├── docs/                  # 安装、测试、发布和任务文档
├── tests/                 # 主进程、E2E、打包 smoke 测试
└── package.json
```

## 发布

GitHub Actions 负责跨平台构建和 GitHub Release 发布。Gitee 作为代码镜像，发布说明可通过脚本同步：

```bash
GITEE_TOKEN=xxx npm run sync:release v0.9.0
```

Gitee 单文件附件大小有限，安装包以 GitHub Release 为准。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
