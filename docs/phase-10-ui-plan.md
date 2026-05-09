# Hermes Desktop Office — UI 重构与功能完善计划

## 现状分析

### 当前项目核心问题

**UI 层面（界面太丑）：**
- 侧边栏使用 emoji 图标（⚡💬🔑📋），非现代 SVG icon
- 卡片式表单布局，像传统后台管理系统，不是聊天应用的现代 UI
- 没有暗色模式支持
- 没有 CSS 过渡动画
- 顶部状态栏占空间且不美观
- 按钮样式原始，没有 focus ring 和 hover 动效
- 聊天页面没有空状态引导（suggestion grid）
- 日志页面没有语法着色、级别颜色

**功能层面（空架子）：**
- 对话页：仅添加文本气泡，**没有真正与 Hermes Agent 通信**，没有流式输出，没有 markdown 渲染
- 日志页：纯文本追加，**没有级别过滤、搜索、导出**
- 设置页：基础表单，没有模型选择、主题切换
- 没有会话管理（session list、历史对话）
- 没有工作区文件浏览器
- 没有快捷键支持

### 参考项目亮点（hermes-webui）
- 三栏布局：rail（窄图标导航）+ sidebar（会话列表）+ main（聊天区）
- CSS 变量系统：light/dark 主题 + 8 种 skin
- SVG 图标（Feather icon 风格）
- Markdown 渲染 + 代码高亮（streaming-markdown + Prism.js）
- 空状态 suggestion grid
- 实时 tool cards（显示 Agent 正在执行的操作）
- 会话搜索、新建对话
- 丰富的设置面板（分 section）

---

## Phase 10: UI 全面重构

### 10.1 设计系统升级
- [ ] 重写 CSS 变量系统，参考 hermes-webui 的 token 命名
  - 新增 `:root.dark` 暗色主题支持
  - 使用语义化变量名（`--bg`/`--surface`/`--text`/`--muted`/`--accent`）
  - 添加 focus-ring、hover-bg、border-subtle 等细节 token
- [ ] 替换 emoji 为 SVG inline icons（使用 feather icon 风格的简单 SVG path）
- [ ] 添加全局过渡动画（`transition: background-color, border-color, color 0.15s ease`）
- [ ] 优化排版：增加字重层次、行高、间距系统

**opencode 任务说明**：重写 `src/renderer/styles.css`，参考 `/tmp/hermes-webui-ref/static/style.css` 的 CSS 变量结构和配色体系，保留 `#DA7756` 品牌主色。

### 10.2 布局重构 — 三栏式现代布局
- [ ] 将现有顶部状态栏 + 侧边栏布局改为：
  - **顶部标题栏**（app-titlebar）：应用名 + 连接状态点
  - **左侧导航栏**（rail）：SVG 图标按钮（配置/授权/对话/日志），hover 显示 tooltip
  - **中间面板**（sidebar）：对话页显示会话列表，设置页显示设置菜单
  - **右侧主区域**（main）：聊天消息区 / 表单内容区
- [ ] 重写 `src/renderer/index.html` 结构
- [ ] 添加 sidebar 可拖拽调整宽度功能

**opencode 任务说明**：重写 HTML 结构和对应的 CSS 布局，参考 hermes-webui 的 `.rail` + `.sidebar` + `.main` 三栏模式。

### 10.3 对话页重构（核心功能）
- [ ] 添加会话列表 sidebar（新建对话 + 历史列表 + 搜索过滤）
- [ ] 空状态显示 suggestion grid（3-4 个快捷建议按钮）
- [ ] **实现真正的 Agent 通信**：
  - 在主进程新增 WebSocket 或 HTTP 通道连接 Hermes Agent
  - 渲染器发送消息 -> 主进程转发到 Agent -> Agent 响应流式返回 -> 渲染器逐段显示
- [ ] 实现流式消息渲染（逐 chunk 显示，打字机效果）
- [ ] 添加 Markdown 渲染支持（引入 marked.js 或简单实现）
- [ ] 添加代码块语法高亮（引入 highlight.js 轻量版）
- [ ] 用户气泡和 Agent 气泡样式区分（参考 hermes-webui 的消息样式）
- [ ] 添加滚动到底部按钮和跳转到会话开始按钮

**opencode 任务说明**：需要新建 IPC 通道实现 Agent 通信，重写对话页的 HTML/CSS/JS。通信方案：主进程通过 spawn 启动 Agent 并捕获 stdout/stderr，通过 WebSocket 或 EventSource 转发到渲染器。

### 10.4 日志页重构
- [ ] 日志按级别着色（INFO 白色、WARN 黄色、ERROR 红色、DEBUG 灰色）
- [ ] 添加级别过滤下拉（全部/INFO/WARN/ERROR）
- [ ] 添加日志搜索框
- [ ] 添加导出按钮（导出为 .txt 文件）
- [ ] 添加日志行数统计
- [ ] 优化日志区样式（仿终端风格，等宽字体）

### 10.5 设置页重构
- [ ] 左侧设置菜单（类似 hermes-webui 的 side-menu），分为：
  - API 配置（Gateway URL、Token、模型选择）
  - 工作区设置（路径选择器）
  - 外观设置（主题切换 light/dark/system、字体大小）
  - 通用设置（开机自启）
- [ ] 右侧对应内容区
- [ ] 主题切换实时生效

### 10.6 授权页重构
- [ ] 合并为更紧凑的卡片布局
- [ ] 添加授权进度动画（loading spinner）
- [ ] 诊断结果美化（分块展示，带图标）

---

## Phase 11: 功能补全

### 11.1 真正的 Agent 对话
- [ ] 主进程 `agent-manager.js` 增强：
  - 支持向渲染器发送 Agent 的流式输出
  - 支持停止生成（SIGINT）
- [ ] 新增 IPC 通道：`agent-send-message`、`agent-stop-generation`
- [ ] 渲染器 `app.js` 对话逻辑完善：
  - 发送消息后显示 loading 状态
  - 接收流式输出并追加到消息气泡
  - 支持 "停止生成" 按钮

### 11.2 会话管理
- [ ] 本地存储会话历史（localStorage 或 Electron store）
- [ ] 会话列表支持搜索过滤
- [ ] 点击历史会话加载对话内容
- [ ] 新建/删除会话

### 11.3 工作区集成
- [ ] 添加简单的文件浏览器（显示工作区目录结构）
- [ ] 支持点击文件查看内容（可选，Phase 12）

---

## 执行规则

1. **所有代码编写使用 opencode**，我不直接写代码
2. 每个子任务作为独立的 opencode 任务
3. **opencode 报错立即停止**，汇报给用户查看
4. 每个子任务完成后 git commit
5. 依赖顺序：10.1 -> 10.2 -> 10.5 -> 10.6 -> 10.3 -> 10.4 -> 11.1 -> 11.2 -> 11.3

## 参考文件

- 参考项目 UI: `/tmp/hermes-webui-ref/static/style.css`（CSS 变量、主题系统）
- 参考项目 HTML: `/tmp/hermes-webui-ref/static/index.html`（布局结构、SVG 图标）
- 参考项目 JS: `/tmp/hermes-webui-ref/static/ui.js`、`sessions.js`、`messages.js`

## 技术约束

- Electron 桌面应用，使用 preload 安全隔离
- 不能引入框架级依赖（React/Vue），保持原生 JS + HTML + CSS
- 可使用 CDN 或 vendored 的轻量库：marked.js（markdown）、highlight.js（语法高亮）
- 保持现有的 IPC 架构和主进程结构
