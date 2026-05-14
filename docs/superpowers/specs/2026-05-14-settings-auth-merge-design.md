# 设计文档：配置与授权页合并

## 概述

将现有的设置页（/settings）和授权页（/auth）合并为一个统一的配置页面，采用卡片堆叠式布局，并为飞书/钉钉授权卡片增加权限清单展示（含搜索和分页功能）。

## 架构变更

### 导航调整
- 侧边栏 rail 中"配置"和"授权"两个按钮合并为一个"设置"按钮
- 页面路由从 `settings` 和 `auth` 两个 page 合并为 `settings` 一个 page
- 快捷键 `Cmd+2` 对应设置页，原 `Cmd+3`（授权）移除

### 页面结构

合并后的 `#page-settings` 包含以下卡片（从上到下）：

1. **AI 模型配置卡片**
   - 推理服务商下拉选择
   - API Key 输入（带显示/隐藏切换）
   - 自定义端点 URL（仅 custom 模式显示）
   - 默认模型输入
   - 操作按钮：尝试启动 Agent、保存配置

2. **工作区设置卡片**
   - Hermes 配置目录（带浏览按钮）
   - 配置状态检查

3. **通用设置卡片**
   - 开机自启 Agent 开关

4. **飞书授权卡片**（新增权限清单）
   - 标题 + 授权状态标签
   - 元信息行：版本号 | 用户名 | 权限数量 + 搜索输入框（flex:1）
   - 权限表格（三列：权限名称 / 类型 / 状态）
   - 分页控件（上一页 / 页码 / 下一页 + 显示范围）
   - 操作按钮：开始授权 / 重新授权

5. **钉钉授权卡片**（同上结构）

6. **一键诊断卡片**
   - 运行诊断按钮 + 结果展示

## 数据流

### 权限清单数据来源
- 通过 CLI 命令获取：`lark-cli auth status --permissions` 和 `dws auth status --permissions`
- IPC 新增通道：`auth:permissions:feishu` 和 `auth:permissions:dingtalk`
- 返回格式：`{ success: boolean, permissions: [{ name, scope, status }], total, page, pageSize }`

### 前端权限管理
- 每个授权卡片维护独立的权限列表状态
- 搜索：前端过滤（数据量不大时）或后端过滤（数据量大时）
- 分页：前端分页，默认每页 5 条
- 刷新：授权完成后自动刷新权限列表

## 文件变更

### 修改文件
| 文件 | 变更 |
|------|------|
| `src/renderer/index.html` | 移除 `#page-auth`，将授权卡片移入 `#page-settings`；合并 rail 按钮 |
| `src/renderer/styles.css` | 新增权限表格样式、分页控件样式、授权卡片元信息行样式 |
| `src/renderer/app.js` | 合并设置页和授权页逻辑；新增权限列表加载/搜索/分页逻辑 |
| `src/main/ipc-handlers.js` | 新增获取权限列表的 IPC 处理 |
| `docs/tasks.md` | 标记 Phase 10.7 完成 |

### 新增 CSS 类
- `.auth-card` — 授权卡片容器
- `.auth-meta-row` — 元信息行（版本号、账号、搜索框）
- `.permissions-table` — 权限表格容器
- `.permissions-table-header` — 表头行
- `.permissions-table-row` — 数据行
- `.permissions-pagination` — 分页控件
- `.permission-status-granted` — 已授权状态样式
- `.permission-status-revoked` — 未授权状态样式

## 错误处理

- 权限列表加载失败时显示"加载失败，点击重试"
- 搜索无结果时显示"未找到匹配的权限"
- CLI 未安装时显示"CLI 未安装，无法获取权限列表"

## 后续扩展

- 权限分类筛选（通讯录/消息/日历等）
- 批量权限管理
- 权限变更历史记录
