---
name: dingtalk-cli-messaging
description: Send messages to DingTalk groups and DMs using the dws CLI. Covers group search, at-mention syntax, bot vs user sending, and common pitfalls.
version: 1.0.0
author: Assistant
---

# DingTalk CLI Messaging

Send messages to DingTalk groups and direct messages using the `dws` CLI.

## Sending Messages

### Send to a group (as current user)

```bash
# Basic text message
dws chat message send --group "<openConversationId>" --text "Hello everyone"

# With title (optional, recommended for visibility)
dws chat message send --group "<openConversationId>" --title "通知" --text "Hello"

# At-mention a user
dws chat message send --group "<openConversationId>" --text "李总好 <@639232817>" --at-users 639232817

# At-mention multiple users
dws chat message send --group "<openConversationId>" --text "请确认 <@uid1> <@uid2>" --at-users "uid1,uid2"

# At-mention all
dws chat message send --group "<openConversationId>" --text "通知所有人 <@all>" --at-all
```

### Send to a DM (as current user)

```bash
# By userId
dws chat message send --user "<userId>" --text "Hello"

# By openDingTalkId (when userId is unavailable)
dws chat message send --open-dingtalk-id "<openDingTalkId>" --text "Hello"
```

## Finding Chat IDs

### Search by group name

```bash
dws chat search --query "群名关键词" --format json
```

Returns `openConversationId` (e.g., `cid3Hbh3pCskeqFbkn/VTUKrg==`).

### Find your own userId

```bash
dws contact user search --query "你的名字" --format json
```

Returns `userId` (e.g., `639232817`) and `openDingTalkId`.

## Command Reference

```
dws chat message send [flags]
  --group              群会话 openConversationId (群聊必填)
  --user               接收人 userId (单聊)
  --open-dingtalk-id   接收人 openDingTalkId (单聊备选)
  --text               消息内容，支持 Markdown
  --title              消息标题 (可选但推荐)
  --at-all             @所有人
  --at-users           按 userId @ 指定成员，逗号分隔
  --at-mobiles         按手机号 @ 指定成员，逗号分隔
```

## Pitfalls

1. **`--group`, `--user`, `--open-dingtalk-id` are mutually exclusive** — you can only use one at a time. Using multiple causes an error.
2. **`--title` is optional but recommended** — group messages render better with a title. If omitted, the message may appear without a header in some clients.
3. **At-mention requires TWO parts** — you must include both `--at-users <uid>` flag AND `<@uid>` placeholder in the `--text` content. Omitting either means the @ won't render in the DingTalk client.
4. **Group name search may return multiple results** — check the `title` field in the JSON output to pick the right group.
5. **`send-by-bot` requires `--robot-code`** — bot-sent messages need a registered robot code, which most users don't have. Prefer `send` (user identity) for general use.
6. **`send-by-webhook` needs a custom bot URL** — requires setting up a custom bot in the group first. Use `send` for simpler workflows.
7. **`dws contact search` doesn't work directly** — use `dws contact user search --query` instead.