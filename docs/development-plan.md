# 开发计划

## 第一阶段：架构设计
1. 选择桌面框架（Electron / Tauri）
2. 设计进程架构（主进程管理 Hermes Agent、CLI 工具、GUI 窗口）
3. 确定 Hermes Agent 在桌面端的运行模式（内置 Gateway / 直接本地进程）
4. 设计配置存储方案（密钥安全存储、CLI auth token 隔离存储）

## 第二阶段：核心打包与集成
5. Hermes Agent 核心代码打包（依赖、技能目录、工作空间模板）
6. 内置 lark-cli 和 dws CLI 到安装包
7. 实现 GUI 调用 CLI 的中间层（封装 auth login、doctor、业务命令）
8. 实现 Hermes Agent 与 GUI 的通信层（WebSocket / IPC / 本地 API）

## 第三阶段：GUI 开发
9. API Token 配置页面（Hermes gateway 模型配置）
10. CLI 授权页面（飞书/钉钉一键授权按钮，打开浏览器完成 OAuth）
11. 授权状态展示页面（doctor / auth status 可视化）
12. Agent 运行状态监控页面（进程状态、日志查看、错误提示）

## 第四阶段：平台适配与打包
13. macOS 应用打包（.app / .dmg），集成代码签名
14. Windows 应用打包（.exe / .msi）
15. 安装流程设计（路径选择、环境变量、开机自启选项）
16. 内置 CLI 的跨平台路径管理和版本升级机制

## 第五阶段：用户体验与收尾
17. 首次启动向导（引导配置 API Token → 授权飞书 → 授权钉钉）
18. CLI 工具版本检查和 GUI 内一键升级
19. 日志和错误反馈通道
20. 测试与发布准备
