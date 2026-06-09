# Hermes Desktop for Office — 安装与开发指南

## 普通用户安装

适用系统：
- macOS ARM64（Apple Silicon）
- Windows x64
- Linux x64

安装步骤：
1. 从 GitHub Release 下载对应平台安装包。
2. macOS：打开 `.dmg`，将应用拖入 Applications。
3. Windows：运行 `.exe` 安装包，或使用 portable 版本。
4. Linux：使用 `.AppImage` 或 `.deb`。
5. 首次启动后按向导配置模型 API、工作区、飞书/钉钉授权。

安装包目标是零外部依赖：Electron、Hermes Agent、CLI 二进制、Python runtime 和 Office 技能依赖都应随应用打包。

## 开发环境

必需依赖：

| 依赖 | 建议版本 | 说明 |
|------|----------|------|
| Node.js | 20+ | Electron 与构建脚本 |
| npm | 随 Node.js | 安装前端/构建依赖 |
| Git | 2.30+ | submodule 与版本管理 |
| Python | 3.13 优先 | 开发期 agent venv；生产包使用 bundled Python |
| uv | 最新稳定版 | Hermes Agent 依赖安装 |

首次准备：

```bash
git submodule update --init --recursive
npm install
npm run setup:agent
npm run download-clis
```

如果 GitHub 访问慢，可在执行 submodule 或 CLI 下载前设置代理：

```bash
export https_proxy=socks5://127.0.0.1:7897
export all_proxy=socks5://127.0.0.1:7897
```

## 开发运行

```bash
npm run dev
```

开发模式会使用：
- `src/main/index.js` 作为 Electron 主进程入口。
- `src/hermes-agent` submodule 作为 Hermes Agent 源码。
- `assets/feishu-cli/<platform>/lark-cli` 和 `assets/dws-cli/<platform>/dws` 作为内置 CLI。
- 本机 Python/venv 用于开发期 agent 依赖。

## 打包构建

macOS：

```bash
npm run prebuild:mac
npm run build:mac
```

Windows：

```bash
npm run prebuild:win
npm run build:win
```

Linux：

```bash
npm run prebuild:linux
npm run build:linux
```

`prebuild:*` 会准备 Hermes Agent venv、standalone Python runtime 和 bundled agent deps。`build:*` 会下载 CLI 二进制并调用 `electron-builder` 产出安装包。

## 常用维护命令

```bash
npm run download-clis:clean
npm run bundle:python:macos
npm run bundle:deps:macos
npm run test:main
npm run test:e2e:gateway
npm run test:packaged
```

## 常见问题

### Agent 未安装或启动失败

```bash
git submodule update --init --recursive
npm run setup:agent
```

### CLI 不存在或不可执行

```bash
npm run download-clis:clean
```

确认当前平台目录下存在：
- `assets/feishu-cli/<platform>/lark-cli`
- `assets/dws-cli/<platform>/dws`

Windows 对应文件带 `.exe` 后缀。

### 打包后 Python 模块缺失

重新运行对应平台的依赖打包：

```bash
npm run bundle:deps:macos
```

如果新增 Office skill Python 依赖，需要同步更新 `scripts/bundle-agent-deps.sh`。

### macOS 首次打开被系统拦截

在 Finder 中右键应用，选择“打开”，再确认启动。发布版本如启用签名和 notarization，应在 release checklist 中确认签名状态。
