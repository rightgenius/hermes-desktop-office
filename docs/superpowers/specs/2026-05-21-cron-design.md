# Cron (定时任务) 功能设计

**日期**: 2026-05-21
**状态**: 待审核

## 概述

在 Hermes Desktop for Office 客户端中添加定时任务管理功能，能够识别、创建和执行 Hermes 创建的定时任务，确保在 Agent 运行时定时任务可以顺利执行。

## 架构

### 组件

```
hermes-desktop-office/
├── src/main/
│   ├── cron-manager.js       # 新增：定时任务管理器（tick loop, 执行, CRUD）
│   └── ipc-handlers.js       # 修改：添加 cron IPC handlers
├── src/preload/
│   └── index.js              # 修改：暴露 cron API
└── src/renderer/
    ├── index.html             # 修改：添加 cron rail 按钮和页面
    ├── styles.css             # 修改：添加 cron 页面样式
    └── app.js                 # 修改：添加 cron 页面逻辑
```

### 数据流

```
Renderer (UI) ←IPC→ Main (cron-manager.js) ←读写→ ~/.hermes/cron/jobs.json
                                                      ↓ 执行
                                              agent-bridge.py → Hermes Agent
                                                      ↓ 保存输出
                                        ~/.hermes/cron/output/{job_id}/{timestamp}.md
```

## 执行机制（混合模式）

1. **Gateway 优先**: 检测 Gateway 是否运行，如果运行则由 Gateway 执行（标准方式）
2. **桌面应用接管**: Gateway 未运行但 Agent 可用时，桌面应用启动 tick loop
   - 每 60 秒检查 `~/.hermes/cron/jobs.json`
   - 到期任务通过 agent-bridge.py 执行
   - 输出保存到 `~/.hermes/cron/output/`
3. **状态同步**: 两种方式读写同一个 jobs.json，天然同步

## UI 设计

### 左侧 Rail
- 新增时钟图标按钮，`data-page="cron"`
- tooltip: "定时任务"

### 定时任务页面
- 页面头部：标题 + 新建按钮 + 刷新按钮
- 任务列表：详细卡片布局
  - 卡片内容：名称、状态徽章、调度表达式、下次执行时间、上次执行状态
  - 卡片操作：暂停/恢复、立即执行、编辑、删除
- 空状态：无任务时显示引导文案

### 新建/编辑任务表单
- 任务名称（可选）
- 调度方式：
  - 间隔执行：下拉选择单位（分钟/小时/天）+ 输入数值
  - Cron 表达式：文本输入 + 常用模板选择
  - 一次性执行：时间选择器或快速选项（30分钟后、1小时后、明天）
- 提示词（必填，textarea）
- 技能选择（可选，多选下拉）
- 重复次数（可选，数字输入，空=无限）
- 工作目录（可选，路径选择）
- 脚本路径（可选）

## 技术细节

### cron-manager.js

```javascript
class CronManager {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.tickInterval = null;
    this.isRunning = false;
  }

  // 启动 tick loop
  start() { /* 每60秒检查到期任务 */ }
  
  // 停止 tick loop
  stop() { /* 清理定时器 */ }
  
  // 检查并执行到期任务
  async tick() { /* 读取 jobs.json, 过滤到期任务, 执行 */ }
  
  // 执行单个任务
  async runJob(job) { /* 通过 agent-bridge.py 执行, 保存输出 */ }
  
  // CRUD 操作 (直接操作 jobs.json)
  async listJobs() { /* 读取所有任务 */ }
  async createJob(data) { /* 创建任务 */ }
  async updateJob(id, updates) { /* 更新任务 */ }
  async deleteJob(id) { /* 删除任务 */ }
  async pauseJob(id) { /* 暂停 */ }
  async resumeJob(id) { /* 恢复 */ }
  async triggerJob(id) { /* 立即执行 */ }
  
  // 检测 Gateway 状态
  async isGatewayRunning() { /* 检测 gateway 进程 */ }
}
```

### IPC Channels

- `cron:list` - 获取任务列表
- `cron:create` - 创建任务
- `cron:update` - 更新任务
- `cron:delete` - 删除任务
- `cron:pause` - 暂停任务
- `cron:resume` - 恢复任务
- `cron:trigger` - 立即执行
- `cron:status` - 获取 cron 管理器状态
- `cron:start` - 启动 tick loop
- `cron:stop` - 停止 tick loop
- `cron:skills` - 获取可用技能列表（用于表单技能选择）

### 调度格式兼容

完全兼容 Hermes cron 格式：
- 间隔: `"30m"`, `"2h"`, `"1d"`, `"every 30m"`, `"every 2h"`
- Cron: `"0 9 * * *"`
- 一次性: `"2026-06-01T09:00:00"`

### 任务执行

```python
# 通过 agent-bridge.py 执行
{
  "type": "start",
  "content": "prompt内容",
  "session_id": "cron_{job_id}_{timestamp}"
}
```

## 错误处理

1. **Agent 未启动**: 显示提示，不允许执行
2. **任务执行失败**: 记录错误到 job.last_error, UI 显示错误状态
3. **输出保存失败**: 记录日志，任务标记为部分成功
4. **jobs.json 损坏**: 尝试修复，失败则返回空列表

## 生命周期

- **App 启动**: 如果 Agent 已启动且 Gateway 未运行，自动启动 cron tick loop
- **Agent 启动/停止**: 同步启动/停止 cron tick loop
- **App 退出**: 停止 tick loop, 清理资源
