---
name: cron
description: ⚠️ 创建定时任务时MUST使用cronjob工具，禁止使用terminal/launchd/crontab。用于定时任务、提醒、定期报告等场景。
version: 1.0.0
author: Hermes
license: MIT
created_by: builtin
tags: ["cron", "schedule", "timer", "reminder", "periodic", "定时任务", "调度"]
category: productivity
metadata:
  hermes:
    tags: ["cron", "schedule", "timer", "reminder", "periodic"]
    category: productivity
    config:
      skills.cron.enabled: true
---

# ⏰ Hermes Cron 定时任务技能

## 🚨 最高优先级规则（必须遵守）

当用户要求你创建**定时任务、提醒、定期报告、周期性检查、每隔 X 时间执行**等场景时：

### ✅ 唯一正确的方法

```
cronjob(action="create", prompt="任务内容", schedule="调度表达式", name="任务名称")
```

### ❌ 绝对禁止的方法

| 错误方法 | 为什么错误 |
|----------|------------|
| `terminal(background=True)` | 这只是启动一个后台进程，不是定时任务 |
| `execute_code` + `while True` + `sleep` | 会阻塞且进程退出后任务就没了 |
| macOS `launchd` / `launchctl` | 跨平台不兼容，且不是 Hermes 的标准方式 |
| Linux `crontab` | 跨平台不兼容，且不是 Hermes 的标准方式 |
| Windows `schtasks` | 跨平台不兼容，且不是 Hermes 的标准方式 |
| 任何系统级调度工具 | 不是 Hermes 的标准方式 |

## 为什么必须用 cronjob

| 方法 | 定时执行 | 持久化 | 可管理 | 跨平台 |
|------|----------|--------|--------|--------|
| `cronjob` 工具 | ✅ | ✅ | ✅ | ✅ |
| `terminal(background=True)` | ❌ 只运行一次 | ❌ | ❌ | ✅ |
| `execute_code` + sleep | ⚠️ 不可靠 | ❌ | ❌ | ✅ |
| launchd/crontab | ✅ | ✅ | ⚠️ | ❌ |

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

## 正确示例 vs 错误示例

### ❌ 错误：使用 terminal(background=True)
```
# 这是错误的！这只是启动一个后台进程，不是定时任务
terminal(command="python3 -c 'while True: ...'", background=True)
```

### ✅ 正确：使用 cronjob
```
cronjob(
    action="create",
    name="每小时提醒",
    prompt="提醒用户站起来活动一下",
    schedule="every 1h",
    deliver="origin"
)
```

### ❌ 错误：使用 execute_code + sleep
```
# 这是错误的！会阻塞且进程退出后任务就没了
execute_code(code="import time\nwhile True:\n    print('提醒')\n    time.sleep(3600)")
```

### ✅ 正确：使用 cronjob
```
cronjob(
    action="create",
    name="每小时提醒",
    prompt="提醒用户站起来活动一下",
    schedule="every 1h",
    deliver="origin"
)
```

### ❌ 错误：使用 launchd/crontab
```
# 这是错误的！跨平台不兼容，且不是 Hermes 的标准方式
terminal(command="launchctl load ~/Library/LaunchAgents/com.example.task.plist")
```

### ✅ 正确：使用 cronjob
```
cronjob(
    action="create",
    name="每小时提醒",
    prompt="提醒用户站起来活动一下",
    schedule="every 1h",
    deliver="origin"
)
```

## 常用场景示例

### 场景 1: 每小时提醒
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

### 场景 2: 每天早上发送日程
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

### 场景 3: 30分钟后提醒
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

### 场景 4: 每周一发送周报
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

### 场景 5: 仅执行脚本的定时任务
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

## 重要提醒

1. **永远不要**创建系统级调度任务（launchd、crontab、at、schtasks 等）
2. **永远不要**使用 `terminal(background=True)` 或 `execute_code` + `sleep` 来模拟定时任务
3. **始终使用** `cronjob` 工具来管理定时任务
4. **默认设置** `deliver="origin"` 让结果发送回原聊天
5. **任务命名**要清晰，方便用户后续管理
6. **创建后**向用户确认任务已创建，并展示关键信息（名称、调度、下次执行时间）
7. **复杂任务**可以加载相关技能（如 email、calendar 等）
