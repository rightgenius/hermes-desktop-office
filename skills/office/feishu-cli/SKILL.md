---
name: feishu-cli
description: Install, configure, and use the Lark/Feishu CLI tool for document management, messaging, calendar, and more.
version: 1.0.0
author: Assistant
license: MIT
metadata:
  hermes:
    tags: [Feishu, Lark, CLI, Document, Calendar, IM, Productivity]
    related_skills: []
---

# Feishu CLI (Lark CLI)

飞书 CLI 是 Lark/Feishu 官方命令行工具，支持文档、消息、日历、多维表格等 200+ 命令。

## Installation

### Method 1: NPM (Recommended - Works on all platforms)

```bash
npm install -g @larksuite/cli@latest
```

Verify installation:
```bash
lark-cli --version
```

**Note:** If you see TLS certificate warnings, the installation may still succeed. Verify with `lark-cli --version`.

### Method 2: Homebrew (macOS only, requires Git credentials)

Homebrew tap may fail without Git credentials configured. Prefer NPM method.

```bash
# May fail if Git credentials not configured
brew tap larksuite/tap
brew install lark-cli
```

### Method 3: Manual Download from GitHub

If NPM is unavailable, download from GitHub releases:

1. Visit: https://github.com/larksuite/cli/releases
2. Download the appropriate binary for your platform:
   - macOS ARM64: `lark-cli-X.X.X-darwin-arm64.tar.gz`
   - macOS AMD64: `lark-cli-X.X.X-darwin-amd64.tar.gz`
   - Linux AMD64: `lark-cli-X.X.X-linux-amd64.tar.gz`
3. Extract and move to PATH:
```bash
tar -xzf lark-cli-*.tar.gz
sudo mv lark-cli /usr/local/bin/
```

## Configuration

### Step 1: Initialize Configuration

First-time setup requires creating a new app:

```bash
lark-cli config init --new
```

This will:
1. Display a QR code
2. Provide a verification URL (e.g., https://open.feishu.cn/page/cli?user_code=XXXX)
3. Open the URL in browser to complete app creation
4. Return App ID and App Secret upon success

**Note:** This command blocks until browser authorization completes. Run it in terminal and follow the browser prompts.

### Step 2: User Authorization (Optional but Recommended)

To access personal data (messages, calendar, docs), authorize specific scopes.

**For interactive terminal use:**
```bash
# Authorize recommended permissions
lark-cli auth login --recommend

# Or authorize specific domains
lark-cli auth login --domain calendar,task

# Or authorize all domains
lark-cli auth login --domain all

# Authorize specific scope (e.g., for OKR access)
lark-cli auth login --scope "okr:okr.period:readonly"
```

Follow the link to authorize in your browser.

**For AI agent / non-interactive environments (reliable pattern):**

When running in an agent environment where commands may timeout, use the two-step device code flow:

Step 1 -- Get device code and verification URL:
```bash
lark-cli auth login --recommend --no-wait --json
```
This returns JSON with `device_code` and `verification_url`. Do NOT re-run this command -- each call invalidates the previous device code.

Step 2 -- Present the `verification_url` to the user and start background polling:
```bash
lark-cli auth login --device-code "<device_code_from_step_1>"
```
Run this in background mode. It blocks until the user completes authorization in their browser, or times out (600s).

After the user confirms they've completed authorization, verify with:
```bash
lark-cli doctor
# or
lark-cli auth status
```

**Pitfall**: Never run `lark-cli auth login` (without `--no-wait`) in an agent environment with a short timeout -- the command blocks for up to 10 minutes waiting for browser auth, and the agent's default timeout (60s) will kill it. Even worse, re-running the command invalidates the previous device code, causing the user's browser authorization to fail silently.

### Step 3: Verify Setup

```bash
lark-cli doctor
```

Check for any missing scopes if commands fail with `missing_scope` errors.

## Common Commands

### OKR

```bash
# List OKR cycles
lark-cli okr +cycle-list --user-id "USER_ID"

# Get OKR details for a cycle
lark-cli okr +cycle-detail --cycle-id "CYCLE_ID"

# Note: Requires okr:okr.period:readonly scope
```

### Document Management

```bash
# List documents
lark-cli docs list

# Read a document
lark-cli docs get DOC_TOKEN

# Create a document
lark-cli docs create --title "My Document" --content "Hello World"

# Add comment to document
lark-cli docs comment add DOC_TOKEN --content "This is a comment"
```

### Messaging (IM)

```bash
# Send message to user (requires im:message.send_as_user scope)
lark-cli im +messages-send --user-id "USER_OPEN_ID" --text "Hello"

# Send message to group (requires im:message.send_as_user scope)
lark-cli im +messages-send --chat-id "CHAT_ID" --text "Hello everyone"

# List recent messages in a chat
lark-cli im +chat-messages-list --chat-id "CHAT_ID" --format pretty

# Search for chats you are in
lark-cli im +chat-search --member-ids "YOUR_OPEN_ID"
```

**Note:** The `+messages-send` command requires `im:message.send_as_user` scope. If you get `missing_scope` error, authorize it first:
```bash
lark-cli auth login --scope "im:message.send_as_user"
```

**Finding Chat IDs:**
1. Use `lark-cli im +chat-search --member-ids "YOUR_OPEN_ID"` to list all chats
2. Look for the `chat_id` field (starts with `oc_`)
3. Use that ID with `--chat-id` flag

**Finding Your Open ID:**
```bash
lark-cli contact +get-user
# Look for "open_id" field (starts with ou_)
```

### Calendar

```bash
# View upcoming events
lark-cli calendar +agenda

# List events
lark-cli calendar events instance_view --params '{"calendar_id":"primary","start_time":"1700000000","end_time":"1700086400"}'

# Create event
lark-cli calendar events create --params '{"summary":"Meeting","start_time":"1700000000","end_time":"1700003600"}'
```

### Sheets (多维表格)

```bash
# List spreadsheets
lark-cli sheets list

# Read sheet data
lark-cli sheets get SHEET_TOKEN "Sheet1!A1:D10"

# Update cells
lark-cli sheets update SHEET_TOKEN "Sheet1!A1" --values '[["Header1","Header2"]]'
```

### Base (多维表格)

```bash
# List bases
lark-cli base list

# Query records
lark-cli base records list BASE_TOKEN --table TABLE_ID

# Create record
lark-cli base records create BASE_TOKEN --table TABLE_ID --fields '{"Name":"Test"}'
```

### Wiki

```bash
# List wiki spaces
lark-cli wiki space list

# List nodes in space
lark-cli wiki node list SPACE_ID
```

## AI Agent Bidirectional Chat Workflow

To enable two-way chat between an AI agent and Feishu:

### 1. Initial Setup (one-time)
```bash
# Install and configure CLI
npm install -g @larksuite/cli@latest
lark-cli config init --new
# Follow browser prompts to complete authorization

# Authorize messaging scope
lark-cli auth login --scope "im:message.send_as_user"
# Open the provided URL in browser to complete
```

### 2. Get Your IDs
```bash
# Get your Open ID
lark-cli contact +get-user
# Note the "open_id" field (ou_xxxx)

# Find the chat with the bot
lark-cli im +chat-search --member-ids "YOUR_OPEN_ID"
# Look for chat_id (oc_xxxx) - this is your conversation with the bot
```

### 3. Send and Receive Messages
```bash
# Send a message to the bot
lark-cli im +messages-send --chat-id "CHAT_ID" --text "Hello bot!"

# Read latest messages (poll for new messages)
lark-cli im +chat-messages-list --chat-id "CHAT_ID" --format json
```

**Note:** This is a polling-based approach. The CLI checks messages on-demand, not real-time push. For webhook-based real-time messaging, configure Feishu event subscriptions separately.

## AI Agent Skills

飞书 CLI 支持 AI Agent Skills，可在 Claude Code 等工具中使用：

```bash
# Install all skills
npx skills add larksuite/cli -g -y

# Install specific skills
npx skills add larksuite/cli -s lark-calendar -y
npx skills add larksuite/cli -s lark-im -y
npx skills add larksuite/cli -s lark-docs -y
```

## Output Formats

Use `--format` flag to control output:

```bash
--format json      # JSON output (default)
--format table     # Table format
--format csv       # CSV format
--format pretty    # Pretty printed JSON
```

## Profiles

Manage multiple configurations:

```bash
# Create new profile
lark-cli profile create mycompany

# Switch profile
lark-cli profile use mycompany

# List profiles
lark-cli profile list
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `command not found` | Ensure npm global bin is in PATH: `export PATH="$PATH:$(npm config get prefix)/bin"` |
| `authentication required` | Run `lark-cli auth login --recommend --no-wait --json` for agent env, or `lark-cli auth login --recommend` interactively |
| `token expired` / `no user logged in` | User token or refresh token expired. Re-authorize: `lark-cli auth login --recommend --no-wait --json` then poll with `--device-code` |
| `doctor` passes but user commands fail | `lark-cli doctor` only checks config file existence, not token validity. Use `lark-cli auth status` to see actual token state (`tokenStatus`, `expiresAt`, `identity`) |
| `permission denied` | Check app permissions in Feishu Developer Console |
| `missing_scope` error | Re-authorize with required scope: `lark-cli auth login --scope "SCOPE_NAME"` |
| `missing_scope: im:message.send_as_user` | Run `lark-cli auth login --scope "im:message.send_as_user"` then open browser link to authorize |
| API errors | Use `--dry-run` to preview request without executing |
| Homebrew tap fails | Use NPM install instead: `npm install -g @larksuite/cli@latest` |
| Cannot find chat with bot | Use `lark-cli im +chat-search --member-ids "YOUR_OPEN_ID"` to find all chats including bot conversations |
| Tool installed locally but not found in agent environment | See "Cross-Environment Tool Access" section below |
| `doctor` shows `token_exists: fail` but user says they're logged in in their shell | Likely a **workspace mismatch**. lark-cli isolates configs per workspace: `local` workspace uses `~/.lark-cli/config.json` (global), `hermes` workspace uses `~/.lark-cli/hermes/config.json`. Check `lark-cli doctor` output for `"workspace"` field. Fix: copy the config (`cp ~/.lark-cli/config.json ~/.lark-cli/hermes/config.json`) or re-authorize in the correct workspace |
| Multiple `lark-cli auth login` calls causing browser auth to fail | Each call generates a new device code and invalidates the previous one. Only call `--no-wait --json` ONCE, then poll with the returned `--device-code`. Never re-run auth login while user is in the middle of browser authorization |

### Workspace Isolation

lark-cli supports multiple workspaces with isolated configurations. Each workspace has its own config file and user tokens:

- `local` workspace → `~/.lark-cli/config.json` (global default, used by user's zsh)
- `<name>` workspace → `~/.lark-cli/<name>/config.json` (agent uses `hermes` by default)

When auth works in the user's shell but fails in the agent, check:
```bash
lark-cli doctor | grep workspace  # Shows which workspace is active
```

If workspaces differ, sync the config:
```bash
cp ~/.lark-cli/config.json ~/.lark-cli/hermes/config.json
```

Then verify:
```bash
lark-cli doctor  # Should show "workspace": "hermes" and "token_exists": "pass"
```

### Cross-Environment Tool Access

**Problem**: You have `lark-cli` installed in your local shell (e.g., zsh with Homebrew or npm), but the AI agent running in a container or different shell environment cannot find it.

**Root Cause**: Different shell environments (zsh vs bash) or container isolation means PATH configurations and installed tools may not be shared.

**Solutions**:

1. **Find the tool location in your local environment**:
   ```bash
   # In your local terminal (zsh)
   which lark-cli
   # Example output: /opt/homebrew/bin/lark-cli or /Users/you/.npm-global/bin/lark-cli
   ```

2. **Option A: Use full path in agent commands**:
   ```bash
   # Instead of
   lark-cli docs get DOC_TOKEN
   # Use the full path
   /opt/homebrew/bin/lark-cli docs get DOC_TOKEN
   ```

3. **Option B: Export document content locally first**:
   ```bash
   # In your local terminal, export the content
   lark-cli docs get DOC_TOKEN > /tmp/doc_content.txt
   # Then share the file with the agent
   ```

4. **Option C: Use Python SDK (lark-oapi) as fallback**:
   ```python
   from lark_oapi.api.docx.v1 import *
   # Requires App ID and App Secret from lark-cli config
   ```

**Best Practice**: When working with Feishu documents across environments, consider using the webhook approach for one-way notifications, or export document templates to a shared location that both environments can access.

## Getting User ID

Many commands require your User ID (Open ID). Get it with:

```bash
lark-cli contact +get-user
# or search by name
lark-cli contact +search-user --query "Your Name"
```

Your Open ID starts with `ou_` and is needed for:
- Sending direct messages (`--user-id`)
- Searching for your chats (`--member-ids`)

## Feishu Custom Bot Webhook (Alternative to CLI)

For simple message pushing without CLI setup, use a custom bot webhook:

### Creating a Custom Bot

1. In a Feishu group, go to **Settings** → **Group Bots** → **Add Bot**
2. Select **Custom Bot**
3. Set name, avatar, and description
4. **Important**: Enable "Signature Verification" for security
5. Save the **Webhook URL** and **Secret**

### Sending Messages via Webhook (Python)

```python
import json
import requests
import base64
import hashlib
import time
import hmac

def gen_sign(timestamp, secret):
    """Generate Feishu webhook signature"""
    # Format: timestamp + "\n" + secret
    string_to_sign = f"{timestamp}\n{secret}"
    # HMAC-SHA256 with string_to_sign as key
    hmac_code = hmac.new(
        string_to_sign.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()
    sign = base64.b64encode(hmac_code).decode('utf-8')
    return sign

def send_webhook_message(webhook_url, secret, text):
    timestamp = int(time.time())
    sign = gen_sign(timestamp, secret)
    
    message = {
        "timestamp": str(timestamp),
        "sign": sign,
        "msg_type": "text",
        "content": {"text": text}
    }
    
    response = requests.post(webhook_url, json=message, timeout=30)
    return response.json()

# Usage
WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"
SECRET = "your_secret_here"

result = send_webhook_message(
    WEBHOOK_URL,
    SECRET,
    "Hello from webhook!"
)
```

**Important**: The signature algorithm uses `string_to_sign` (timestamp + "\n" + secret) as the HMAC **key**, not as the message. This is a common pitfall.

### Webhook vs CLI Comparison

| Feature | Custom Bot Webhook | Feishu CLI |
|---------|-------------------|------------|
| Setup | Simple (just webhook URL) | Requires app creation & auth |
| Send messages | ✅ Yes | ✅ Yes |
| Receive messages | ❌ No (passive only) | ✅ Yes (polling) |
| Read chat history | ❌ No | ✅ Yes |
| Access user info | ❌ No | ✅ Yes |
| Best for | Notifications, alerts | Interactive chat, automation |

### Limitations of Custom Bots

- Can only be used in the group where created
- Cannot receive @mentions via webhook (webhook is one-way)
- No access to group member list or user data
- Rate limit: 100 messages/minute, 5 messages/second

## Hybrid Approach: CLI + Webhook for Bidirectional Chat

For a complete two-way chat experience, combine Feishu CLI (for reading) with Custom Bot Webhook (for sending):

### Architecture
```
User sends message in Feishu group
         ↓
CLI polls for new messages (lark-cli im +chat-messages-list)
         ↓
AI processes the message
         ↓
Webhook sends reply back to group
```

### Python Bridge Script

Save as `~/.hermes/scripts/feishu_bridge.py`:

```python
#!/usr/bin/env python3
"""Feishu Hybrid Bridge: CLI for reading, Webhook for sending"""
import json
import subprocess
import requests
import base64
import hashlib
import time
import hmac

WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"
SECRET = "your_secret_here"
CHAT_ID = "oc_xxxxxxxx"  # Your group chat ID

def gen_sign(timestamp, secret):
    """Generate Feishu webhook signature"""
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(
        string_to_sign.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()
    return base64.b64encode(hmac_code).decode('utf-8')

def send_message(text):
    """Send message via webhook"""
    timestamp = int(time.time())
    sign = gen_sign(timestamp, SECRET)
    message = {
        "timestamp": str(timestamp),
        "sign": sign,
        "msg_type": "text",
        "content": {"text": text}
    }
    response = requests.post(WEBHOOK_URL, json=message, timeout=30)
    return response.json()

def get_messages(limit=20):
    """Get messages via CLI"""
    result = subprocess.run(
        ["lark-cli", "im", "+chat-messages-list", 
         "--chat-id", CHAT_ID, "--format", "json"],
        capture_output=True, text=True, timeout=30
    )
    data = json.loads(result.stdout)
    if data.get("ok"):
        return data.get("data", {}).get("messages", [])[:limit]
    return []

def get_recent_conversation(limit=10):
    """Get recent conversation context"""
    messages = get_messages(limit)
    conversation = []
    for msg in reversed(messages):
        sender = msg.get("sender", {})
        conversation.append({
            "sender": sender.get("name", "Bot"),
            "content": msg.get("content", ""),
            "time": msg.get("create_time", "")
        })
    return conversation

# Usage examples
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python feishu_bridge.py <send|read|context> [args]")
        sys.exit(1)
    
    cmd = sys.argv[1]
    if cmd == "send":
        result = send_message(" ".join(sys.argv[2:]))
        print(json.dumps(result, indent=2))
    elif cmd == "read":
        for msg in get_messages():
            print(f"[{msg['sender'].get('name', 'Bot')}] {msg['content'][:50]}...")
    elif cmd == "context":
        for msg in get_recent_conversation():
            print(f"[{msg['sender']}] {msg['content'][:100]}")
```

### Usage Workflow

```bash
# 1. User sends message in Feishu group
# 2. AI reads latest messages
python ~/.hermes/scripts/feishu_bridge.py read

# 3. AI processes and sends reply
python ~/.hermes/scripts/feishu_bridge.py send "Reply message here"
```

### Finding Your Chat ID

```bash
# Get your Open ID first
lark-cli contact +get-user
# Note the "open_id" (ou_xxxx)

# Search for chats you're in
lark-cli im +chat-search --member-ids "YOUR_OPEN_ID"
# Look for "chat_id" (oc_xxxx) of the group with your bot
```

### Limitations

- **Not real-time**: Requires polling (run `read` command periodically)
- **Rate limits**: Webhook 100/min, CLI has its own limits
- **No push notifications**: User must tell AI to check messages, or AI must poll

### Real-time Alternative: Event Subscription

For true real-time messaging, use `lark-cli event +subscribe`:

```bash
# Subscribe to all events via WebSocket
lark-cli event +subscribe

# Subscribe to specific event types
lark-cli event +subscribe --event-types "im.message.receive_v1"

# Filter and route events to different directories
lark-cli event +subscribe \
  --route "^im\\.=dir:./im/" \
  --route "^contact\\.=dir:./contacts/"
```

**Note**: Event subscription requires additional OAuth scopes:
```bash
lark-cli auth login --scope "event:message:readonly"
```

## Useful Links

- GitHub: https://github.com/larksuite/cli
- Documentation: https://open.feishu.cn/document/
- Issues: https://github.com/larksuite/cli/issues
- Custom Bot Guide: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
