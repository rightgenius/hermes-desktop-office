# Gateway & Channel 集成设计

**日期**: 2026-05-25
**状态**: 待审核

## 概述

在 Hermes Desktop for Office GUI 中新增 Gateway 管理页面，使用户能够在图形界面中管理 Hermes Agent 的 messaging gateway 功能，包括启动/停止、平台配置（钉钉/飞书）、Channel 列表查看和实时日志监控。

## 需求

1. GUI 程序默认启用 Gateway 能力，支持在钉钉/飞书上通过 channel 聊天
2. 检测用户本地是否已有 Gateway 运行（通过 `hermes gateway` 或 systemd/launchd 服务），如有则复用并只读显示，无则 GUI 自行启动
3. 用户可在界面看到当前 Gateway 状态、来源、连接的 platform
4. Channel 消息可被正确处理，Channel 列表自动发现
5. 在 Rail 增加 Gateway 按钮和对应页面

## 架构设计

### 1. 页面结构

在 Rail 导航栏新增 Gateway 按钮，排在设置按钮之后（自上而下：对话 → 设置 → Gateway → 技能 → 日志 → 定时任务）。

Gateway 页面包含四个区域：

| 区域 | 内容 |
|------|------|
| 运行状态 | Gateway 运行状态、来源、PID、Profile、管理器、运行时长、版本、启停/重启按钮、开机自启开关 |
| 平台配置 | 钉钉/飞书的开关、凭证配置（App ID/Secret）、连接模式、群聊策略 |
| Channel 列表 | 自动发现的所有 Channel，显示平台、名称、状态、最后活跃时间 |
| 实时日志 | Gateway 运行日志流，支持清空和导出 |

### 2. Gateway 检测与复用策略

**自动检测 + 只读显示**（方案 A）：

- GUI 启动时通过 `hermes gateway status` 检测外部 Gateway
- 检测到外部 Gateway → 显示"使用外部 Gateway"，只读状态，不显示启停按钮
- 无外部 Gateway → GUI 自己启动，显示完整控制按钮
- 用户可随时在设置中切换模式

检测逻辑：
1. 检查 `~/.hermes/gateway.pid` 文件
2. 检查 systemd/launchd 服务状态
3. 扫描进程表中 `hermes gateway` 相关进程
4. 排除当前 GUI 进程及其祖先进程

### 3. 凭证管理

凭证获取采用三层策略：

| 优先级 | 方式 | 说明 |
|--------|------|------|
| 1 | 自动读取已有配置 | 从 `~/.hermes/.env` 和 `config.yaml` 读取，预填充表单 |
| 2 | 扫码自动注册（推荐） | 调用 Hermes 的 device flow API，用户扫码自动创建 Bot |
| 3 | 手动输入（备选） | 带引导说明和开放平台链接 |

**重要区分**：CLI 授权令牌（`~/.lark-cli/`）与 Gateway 应用凭证（`~/.hermes/.env`）是独立的。CLI 的 OAuth token 用于 CLI 工具操作用户身份，Gateway 需要的是应用级凭证（App ID/Secret）。

#### 钉钉凭证

- 来源变量：`DINGTALK_CLIENT_ID`、`DINGTALK_CLIENT_SECRET`
- 配置位置：`config.yaml` 的 `platforms.dingtalk.extra.client_id/client_secret` 或 `.env`
- 连接方式：仅支持 Stream 模式（dingtalk-stream SDK 长连接 WebSocket）
- Channel 发现：自动发现，无需手动配置单个 channel
- 扫码注册：调用 `dingtalk_qr_auth()` — 通过 oapi.dingtalk.com 的 device flow 自动注册应用

#### 飞书凭证

- 来源变量：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_VERIFICATION_TOKEN`（可选）
- 配置位置：`config.yaml` 的 `platforms.feishu.extra.app_id/app_secret` 或 `.env`
- 连接方式：WebSocket 长连接（推荐）或 Webhook 模式
- Channel 发现：自动发现，无需手动配置单个 channel
- 扫码注册：调用 `feishu.qr_register()` — 通过飞书开放平台 API 自动创建 Bot

### 4. 凭证引导

每个平台配置卡片顶部显示引导区域，包含：
- 步骤说明（如何获取凭证）
- 跳转链接（开放平台地址）
- 扫码注册按钮（如可用）

#### 钉钉引导

```
如何获取钉钉凭证？
1. 登录 钉钉开放平台 → 创建应用 → 选择"企业内部开发"
2. 在应用基本信息页面获取 AppKey 和 AppSecret
3. 在应用功能 → 机器人 中开启机器人能力
→ 前往钉钉开放平台 (https://open-dev.dingtalk.com/)
```

#### 飞书引导

```
如何获取飞书凭证？
1. 登录 飞书开放平台 → 创建企业自建应用
2. 在应用凭证页面获取 App ID 和 App Secret
3. 在应用功能 → 机器人 中添加机器人能力，复制 Verification Token（可选）
4. 推荐选择 WebSocket 长连接模式，无需配置公网回调地址
→ 前往飞书开放平台 (https://open.feishu.cn/app)
```

### 5. 技术实现

#### 后端 (Main Process)

**GatewayManager 启动方式**：

Gateway 是独立于 Agent 的进程。GUI 通过 spawn `hermes gateway run` 子进程启动 Gateway，而非通过 agent-bridge.py。

- 工作目录：`src/hermes-agent`（开发）或 `Resources/hermes-agent`（生产）
- 环境变量：继承当前进程环境，包含 `HERMES_HOME` 和 `~/.hermes/.env` 中的变量
- stdin/stdout：Gateway 使用自己的日志输出，GUI 通过读取 stderr 获取日志流
- 生命周期：GUI 退出时通过 SIGTERM 优雅停止 Gateway

**配置保存格式**：

配置保存遵循 Hermes 惯例：
- 敏感凭证（App ID/Secret/Token）→ 写入 `~/.hermes/.env`（`KEY=VALUE` 格式）
- 平台开关和策略 → 写入 `~/.hermes/config.yaml` 的 `platforms.<name>` 段
- GUI 保存配置时同时更新两个文件，确保 CLI 和 GUI 共享同一配置

**扫码注册 GUI 适配**：

Hermes 的 `dingtalk_qr_auth()` 和 `feishu.qr_register()` 原本在终端渲染 QR 码。GUI 需要：
1. 调用注册 API 获取 `verification_uri_complete`
2. 使用 `qrcode` 库生成 QR 码图片（PNG base64）
3. 在模态对话框中展示 QR 码图片
4. 轮询注册状态直到成功或超时
5. 成功后自动保存凭证到 `.env`

**新增 IPC 通道**：

| 通道 | 方向 | 说明 |
|------|------|------|
| `gateway-status` | renderer → main | 获取 Gateway 状态（检测外部/自启） |
| `gateway-start` | renderer → main | 启动 Gateway（GUI 自启模式） |
| `gateway-stop` | renderer → main | 停止 Gateway |
| `gateway-restart` | renderer → main | 重启 Gateway |
| `gateway-config-get` | renderer → main | 读取平台配置（从 .env + config.yaml） |
| `gateway-config-save` | renderer → main | 保存平台配置 |
| `gateway-qr-auth` | renderer → main | 触发扫码注册（钉钉/飞书） |
| `gateway-channels` | renderer → main | 获取 Channel 列表（读取 channel_directory.json） |
| `gateway-log` | main → renderer | 实时日志推送（event） |
| `gateway-status-change` | main → renderer | Gateway 状态变化推送（event） |

**新增模块**：`src/main/gateway-manager.js`

```javascript
class GatewayManager {
  constructor(mainWindow) { ... }
  
  // 检测外部 Gateway
  async detectExternalGateway() { ... }
  
  // 启动/停止/重启
  async start() { ... }
  async stop() { ... }
  async restart() { ... }
  
  // 读取/保存配置
  async getConfig() { ... }
  async saveConfig(platform, config) { ... }
  
  // 扫码注册
  async qrAuth(platform) { ... }
  
  // 获取 Channel 列表
  async getChannels() { ... }
  
  // 日志流
  startLogStream() { ... }
  stopLogStream() { ... }
}
```

#### 前端 (Renderer)

**新增页面**：`#page-gateway`

**新增 Rail 按钮**：
```html
<button class="rail-btn" data-page="gateway" title="Gateway">
  <svg viewBox="0 0 24 24" ...> <!-- 连接/网络图标 --> </svg>
</button>
```

**页面布局**：
- 页面头部：标题 + Gateway 状态徽章
- 运行状态卡片
- 平台配置卡片（钉钉 + 飞书，可折叠）
- Channel 列表卡片
- 实时日志卡片

**新增 preload API**：
```javascript
gatewayStatus: () => ipcRenderer.invoke('gateway-status'),
gatewayStart: () => ipcRenderer.invoke('gateway-start'),
gatewayStop: () => ipcRenderer.invoke('gateway-stop'),
gatewayRestart: () => ipcRenderer.invoke('gateway-restart'),
gatewayConfigGet: () => ipcRenderer.invoke('gateway-config-get'),
gatewayConfigSave: (platform, config) => ipcRenderer.invoke('gateway-config-save', platform, config),
gatewayQrAuth: (platform) => ipcRenderer.invoke('gateway-qr-auth', platform),
gatewayChannels: () => ipcRenderer.invoke('gateway-channels'),
onGatewayLog: (fn) => { ... },
onGatewayStatusChange: (fn) => { ... },
```

### 6. 数据流

```
┌─────────────────────────────────────────────────────────┐
│                        GUI Renderer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 状态卡片  │  │ 配置卡片  │  │Channel列表│  │ 日志流  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│       ▼              ▼              ▼              ▼      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  Preload API                         │ │
│  └────────────────────────┬────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────┘
                            │ IPC
┌───────────────────────────┼─────────────────────────────┐
│                        Main Process                      │
│  ┌───────────────────────┴────────────────────────────┐ │
│  │              GatewayManager                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │ │
│  │  │ 检测外部  │  │ 配置读写  │  │ 扫码注册 (spawn) │  │ │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │ │
│  └───────────────────────┬────────────────────────────┘ │
│                          │                               │
│  ┌───────────────────────┴────────────────────────────┐ │
│  │              ~/.hermes/                              │ │
│  │  .env          config.yaml      channel_directory.json│
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7. 错误处理

| 场景 | 处理方式 |
|------|----------|
| 外部 Gateway 运行中 | 显示只读状态，隐藏启停按钮，显示来源信息 |
| 凭证配置不完整 | 平台开关自动关闭，显示"请先配置凭证"提示 |
| 扫码注册失败 | 显示错误信息，回退到手动输入模式 |
| Channel 列表为空 | 显示"暂无 Channel，发送消息后自动发现" |
| 日志文件不存在 | 显示"Gateway 未运行，无日志" |

### 8. 安全考虑

- 凭证输入框默认 `type="password"`，提供显示/隐藏切换
- 保存配置时敏感字段写入 `~/.hermes/.env`（已有惯例）
- 不将凭证暴露到 localStorage 或 DOM 属性
- 扫码注册过程在主进程执行，renderer 仅接收结果

## 文件变更清单

### 新增文件
- `src/main/gateway-manager.js` — Gateway 管理模块
- `docs/superpowers/specs/2026-05-25-gateway-channel-design.md` — 本设计文档

### 修改文件
- `src/renderer/index.html` — 新增 Gateway Rail 按钮和页面
- `src/renderer/styles.css` — 新增 Gateway 页面样式
- `src/renderer/app.js` — 新增 Gateway 页面逻辑
- `src/main/ipc-handlers.js` — 新增 Gateway IPC 处理器
- `src/preload/index.js` — 新增 Gateway API
- `src/main/index.js` — 初始化 GatewayManager
