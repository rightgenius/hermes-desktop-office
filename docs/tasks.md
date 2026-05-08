# 开发任务清单

## GUI 设计规范

### 配色方案（参考 Claude 浅色主题）
| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景 | `#F9F9F9` | 页面底色 |
| 卡片/面板背景 | `#FFFFFF` | 内容容器 |
| 主文字 | `#1A1A1A` | 标题、正文 |
| 次要文字 | `#6B6B6B` | 描述、标签 |
| 边框/分割线 | `#E5E5E5` | 线条、卡片边框 |
| 主色调 | `#DA7756` | 按钮、链接、高亮 |
| 主色 Hover | `#C46749` | 按钮悬停 |
| 成功状态 | `#2E9B5A` | 已连接、已授权 |
| 警告状态 | `#E8A54B` | 即将过期、部分异常 |
| 错误状态 | `#D95C41` | 连接失败、授权过期 |
| 输入框背景 | `#F5F5F5` | 表单输入 |
| 代码/日志区背景 | `#F3F3F3` | 等宽字体区域 |
| 字体 | Inter (英文) / PingFang SC (中文) / JetBrains Mono (代码) |

### 布局规范
- 侧边栏宽度：220px
- 卡片圆角：8px
- 按钮圆角：6px
- 卡片阴影：`0 1px 3px rgba(0,0,0,0.06)`
- 间距系统：4 / 8 / 12 / 16 / 24 / 32px

---

## 开发任务

### Phase 1: 项目基础搭建
- [x] 1.1 初始化项目目录和 git 仓库
- [x] 1.2 添加 hermes-agent 为 git submodule
- [x] 1.3 创建 CLI 二进制下载脚本
- [x] 1.4 配置 package.json 和 electron-builder
- [ ] 1.5 安装 Electron 核心依赖

### Phase 2: Electron 主进程
- [ ] 2.1 创建主进程入口 `src/main/index.js`
- [ ] 2.2 实现窗口创建与生命周期管理
- [ ] 2.3 实现 IPC 通信通道定义
- [ ] 2.4 实现 Hermes Agent 子进程管理（启动/停止/重启）
- [ ] 2.5 实现 CLI 工具执行器（lark-cli / dws 命令封装）
- [ ] 2.6 实现配置文件读写（API Token、工作空间路径等）

### Phase 3: 前端页面骨架
- [ ] 3.1 搭建 HTML/CSS 基础框架（侧边栏 + 主内容区 + 顶部状态栏）
- [ ] 3.2 实现侧边栏导航组件
- [ ] 3.3 实现顶部全局状态指示器组件
- [ ] 3.4 实现页面路由/切换逻辑

### Phase 4: 设置与配置页 (`/settings`)
- [ ] 4.1 创建设置页面布局
- [ ] 4.2 API 配置表单（Gateway URL、Token、模型选择）
- [ ] 4.3 测试连接功能
- [ ] 4.4 工作区路径选择器
- [ ] 4.5 通用设置（开机自启、主题、语言）
- [ ] 4.6 表单数据持久化（保存到配置文件）

### Phase 5: CLI 授权页 (`/auth`)
- [ ] 5.1 创建授权页面布局
- [ ] 5.2 飞书授权卡片（版本、状态、授权按钮、用户信息）
- [ ] 5.3 钉钉授权卡片（同上）
- [ ] 5.4 授权进度弹窗（device_code 轮询、倒计时）
- [ ] 5.5 一键诊断功能（lark-cli doctor + dws doctor）
- [ ] 5.6 诊断结果可视化展示

### Phase 6: 对话页 (`/chat`)
- [ ] 6.1 创建对话页布局（左侧对话列表 + 右侧消息区 + 底部输入区）
- [ ] 6.2 对话列表组件（新建、历史列表）
- [ ] 6.3 消息渲染组件（用户/Agent 气泡、流式输出）
- [ ] 6.4 输入区组件（文本框、发送、停止生成）
- [ ] 6.5 对接 Hermes Agent WebSocket/API 通信

### Phase 7: 运行日志页 (`/logs`)
- [ ] 7.1 创建日志页布局
- [ ] 7.2 进程控制面板（启动/停止/重启、状态显示）
- [ ] 7.3 实时日志流组件（滚动、级别过滤、搜索）
- [ ] 7.4 日志导出功能

### Phase 8: 全局弹窗与向导
- [ ] 8.1 首次启动向导（API 配置 → 飞书授权 → 钉钉授权 → 完成）
- [ ] 8.2 错误提示弹窗组件
- [ ] 8.3 CLI 升级弹窗
- [ ] 8.4 退出确认弹窗

### Phase 9: 打包与发布
- [ ] 9.1 下载各平台 CLI 二进制文件
- [ ] 9.2 macOS 打包（.dmg）
- [ ] 9.3 Windows 打包（.exe / .msi）
- [ ] 9.4 安装包测试
- [ ] 9.5 GitHub Release 发布准备

---

## 文件清单

### 待创建文件
| 文件 | 用途 |
|------|------|
| `src/main/index.js` | Electron 主进程入口 |
| `src/main/ipc-handlers.js` | IPC 通道处理 |
| `src/main/agent-manager.js` | Hermes Agent 进程管理 |
| `src/main/cli-runner.js` | CLI 工具执行封装 |
| `src/main/config-store.js` | 配置文件读写 |
| `src/preload/index.js` | preload 脚本（安全暴露 API） |
| `src/renderer/index.html` | 主 HTML 页面 |
| `src/renderer/styles.css` | 全局样式 |
| `src/renderer/app.js` | 前端应用逻辑 |
| `src/renderer/components/sidebar.js` | 侧边栏组件 |
| `src/renderer/components/statusbar.js` | 顶部状态栏组件 |
| `src/renderer/components/settings-page.js` | 设置页组件 |
| `src/renderer/components/auth-page.js` | 授权页组件 |
| `src/renderer/components/chat-page.js` | 对话页组件 |
| `src/renderer/components/logs-page.js` | 日志页组件 |
| `src/renderer/components/dialogs.js` | 弹窗组件集合 |
