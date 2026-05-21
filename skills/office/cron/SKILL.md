---
name: cron
description: 使用 Hermes 内置 cron 系统创建和管理定时任务。当用户要求创建定时任务、提醒、定期报告等场景时使用此技能。
version: 1.0.0
author: Hermes
license: MIT
created_by: builtin
---

# Hermes Cron 定时任务

你是 Hermes Agent，拥有内置的定时任务系统。当用户要求你创建定时任务、提醒、定期报告等场景时，**必须使用 `cronjob` 工具**，而不是创建系统级调度任务（如 macOS launchd、crontab、Windows Task Scheduler 等）。

## 为什么使用 Hermes Cron

- **跨平台**: 不依赖操作系统特定的调度系统
- **持久化**: 任务存储在 `~/.hermes/cron/jobs.json`，重启后依然有效
- **可管理**: 通过 `cronjob` 工具随时查看、修改、暂停、恢复任务
- **自动执行**: Gateway 守护进程每 60 秒检查到期任务并自动执行
- **输出交付**: 任务执行结果可自动发送到原聊天平台

## 使用 cronjob 工具

### 创建定时任务

```
cronjob(action="create", prompt="任务内容", schedule="调度表达式", name="任务名称")
```

### 支持的调度格式

| 格式 | 示例 | 说明 |
|------|------|------|
| 一次性（相对） | `"30m"`, `"2h"`, `"1d"` | 30分钟后/2小时后/1天后执行一次 |
| 间隔重复 | `"every 30m"`, `"every 2h"`, `"every 1d"` | 每30分钟/2小时/1天重复执行 |
| Cron 表达式 | `"0 9 * * *"`, `"*/15 * * * *"` | 标准5位cron表达式 |
| 具体时间 | `"2026-06-01T09:00:00"` | 在指定时间执行一次 |

### 常用参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `prompt` | 任务执行内容（必填） | `"提醒我喝水"` |
| `schedule` | 调度表达式（必填） | `"every 1h"` |
| `name` | 任务名称（可选） | `"喝水提醒"` |
| `repeat` | 重复次数（可选，默认无限） | `10` |
| `deliver` | 输出交付方式 | `"origin"`（默认发送到原聊天） |
| `skill` | 加载特定技能 | `"email"` |
| `script` | 执行脚本路径 | `"scripts/check.sh"` |
| `no_agent` | 仅执行脚本不调用AI | `true` |

## 示例

### 示例 1: 每小时提醒

用户："每小时提醒我站起来活动一下"

```
cronjob(
    action="create",
    name="活动提醒",
    prompt="提醒用户站起来活动一下，伸展身体，看看远处",
    schedule="every 1h",
    deliver="origin"
)
```

### 示例 2: 每天早上发送日程

用户："每天早上8点给我发送今天的日程安排"

```
cronjob(
    action="create",
    name="每日日程",
    prompt="查询用户今天的日程安排，格式化成易读的消息发送给用户",
    schedule="0 8 * * *",
    skill="calendar",
    deliver="origin"
)
```

### 示例 3: 30分钟后提醒

用户："30分钟后提醒我开会"

```
cronjob(
    action="create",
    name="会议提醒",
    prompt="提醒用户：该去开会了",
    schedule="30m",
    deliver="origin"
)
```

### 示例 4: 每周一发送周报

用户："每周一早上9点帮我生成周报"

```
cronjob(
    action="create",
    name="周报生成",
    prompt="回顾本周工作，生成周报",
    schedule="0 9 * * 1",
    deliver="origin"
)
```

### 示例 5: 仅执行脚本的定时任务

用户："每5分钟检查一下服务器状态"

```
cronjob(
    action="create",
    name="服务器检查",
    schedule="every 5m",
    script="scripts/check-server.sh",
    no_agent=True,
    deliver="origin"
)
```

## 管理任务

### 查看任务列表
```
cronjob(action="list")
```

### 查看任务详情
```
cronjob(action="show", job_id="任务ID")
```

### 暂停任务
```
cronjob(action="pause", job_id="任务ID")
```

### 恢复任务
```
cronjob(action="resume", job_id="任务ID")
```

### 立即执行任务
```
cronjob(action="trigger", job_id="任务ID")
```

### 删除任务
```
cronjob(action="remove", job_id="任务ID")
```

## 重要规则

1. **永远不要**创建系统级调度任务（launchd、crontab、at、schtasks 等）
2. **始终使用** `cronjob` 工具来管理定时任务
3. **默认设置** `deliver="origin"` 让结果发送回原聊天
4. **任务命名**要清晰，方便用户后续管理
5. **创建后**向用户确认任务已创建，并展示关键信息（名称、调度、下次执行时间）
6. **复杂任务**可以加载相关技能（如 email、calendar 等）
