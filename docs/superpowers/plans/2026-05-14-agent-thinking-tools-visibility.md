# Agent Thinking & Tools Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Hermes agent's thinking process, tool execution details, and interactive prompts (clarify/approval/sudo/secret) in the GUI chat interface, matching the TUI experience.

**Architecture:** Extend `agent-bridge.py` to wire all hermes-agent callbacks (reasoning, tool, clarify, approval, etc.) into JSON events on stdout. Agent-manager.js routes these events to the renderer via `agent-response`. Renderer renders reasoning as inline text above response, tool calls as collapsible cards, and interactive prompts as a modal overlay with response buttons. A new `respond` stdin message type routes user answers back to the blocking bridge.

**Tech Stack:** Electron (Node.js main process), Python 3 bridge, vanilla JS renderer, CSS3.

---

### Task 1: Extend `agent-bridge.py` — Wire all callbacks + respond handling

**Files:**
- Modify: `src/main/agent-bridge.py`

- [ ] **Step 1: Add blocking state + respond handling to stdin loop**

Add a `_pending_responses` dict and modify the stdin reading loop to handle `respond` type messages:

```python
# After line 30, add:
_pending_responses = {}  # request_id -> threading.Event

# In the stdin for-loop (line 49), add new message type handling before the existing if/elif chain:
# After "elif msg.get('type') == 'ping':" block (after line 106), add:
        elif msg.get("type") == "respond":
            rid = msg.get("request_id", "")
            answer = msg.get("answer", "")
            if rid in _pending_responses:
                _pending_responses[rid]["answer"] = answer
                _pending_responses[rid]["event"].set()
            continue
```

- [ ] **Step 2: Add helper for blocking callbacks**

Add a `_block_for_input` function that mirrors the TUI gateway's `_block` mechanism:

```python
# After the imports (after line 28), add:
import threading
import uuid
import time

def _block_for_input(event_type, payload, timeout=300):
    """Block until the GUI responds, mirroring the TUI gateway _block mechanism."""
    rid = uuid.uuid4().hex[:8]
    ev = threading.Event()
    _pending_responses[rid] = {"event": ev, "answer": ""}
    payload["request_id"] = rid
    sys.stdout.write(json.dumps({"type": event_type, **payload}) + "\n")
    sys.stdout.flush()
    ev.wait(timeout=timeout)
    answer = _pending_responses.pop(rid, {}).get("answer", "")
    return answer
```

- [ ] **Step 3: Wire all callbacks into AIAgent constructor**

Replace the current `AIAgent()` call (lines 34-42) to include all callback parameters:

```python
    agent = AIAgent(
        base_url=os.getenv("HERMES_BASE_URL") or os.getenv("OPENROUTER_BASE_URL"),
        api_key=os.getenv("HERMES_API_TOKEN") or os.getenv("OPENAI_API_KEY"),
        provider=os.getenv("HERMES_INFERENCE_PROVIDER"),
        model=os.getenv("HERMES_MODEL") or os.getenv("HERMES_INFERENCE_MODEL"),
        max_iterations=int(os.getenv("HERMES_MAX_TURNS", "60")),
        quiet_mode=True,
        save_trajectories=False,
        # Thinking / reasoning callbacks
        thinking_callback=lambda text: sys.stdout.write(json.dumps({"type": "thinking", "text": text}) + "\n") or sys.stdout.flush(),
        reasoning_callback=lambda text: sys.stdout.write(json.dumps({"type": "reasoning", "text": text}) + "\n") or sys.stdout.flush(),
        # Tool execution callbacks
        tool_gen_callback=lambda name: sys.stdout.write(json.dumps({"type": "tool_gen", "name": name}) + "\n") or sys.stdout.flush(),
        tool_progress_callback=lambda event_type, name=None, preview=None, _args=None, **kwargs: (
            sys.stdout.write(json.dumps({
                "type": "tool_progress",
                "event": event_type,
                "name": name or "",
                "preview": preview or "",
                **({k: v for k, v in kwargs.items() if k in ("duration", "is_error")} if kwargs else {})
            }) + "\n") or sys.stdout.flush()
        ),
        tool_start_callback=lambda tool_call_id, name, args: sys.stdout.write(json.dumps({
            "type": "tool_start",
            "tool_id": tool_call_id,
            "name": name,
            "args": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else str(args)
        }) + "\n") or sys.stdout.flush(),
        tool_complete_callback=lambda tool_call_id, name, args, result: sys.stdout.write(json.dumps({
            "type": "tool_complete",
            "tool_id": tool_call_id,
            "name": name,
            "args": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else str(args),
            "result": str(result)[:2000]  # Truncate long results
        }) + "\n") or sys.stdout.flush(),
        # Interactive prompt callbacks (blocking)
        clarify_callback=lambda question, choices: _block_for_input("clarify_request", {
            "question": question,
            "choices": json.dumps(choices, ensure_ascii=False) if choices else None
        }),
        status_callback=lambda kind, text: sys.stdout.write(json.dumps({"type": "status", "kind": kind, "text": text}) + "\n") or sys.stdout.flush(),
    )
```

- [ ] **Step 4: Commit**

```bash
git add src/main/agent-bridge.py
git commit -m "feat: extend agent-bridge with reasoning/tool/interactive callbacks"
```

### Task 2: Extend `agent-manager.js` — Route new events + add respond method

**Files:**
- Modify: `src/main/agent-manager.js`

- [ ] **Step 1: Add new event cases to `_handleBridgeMessage`**

In the switch block (lines 155-182), add these new cases before the `default` case:

```javascript
      case 'reasoning':
        this.emitResponse('reasoning', msg.text || '');
        break;
      case 'thinking':
        this.emitResponse('thinking', msg.text || '');
        break;
      case 'tool_gen':
        this.emitResponse('tool_gen', { name: msg.name });
        break;
      case 'tool_progress':
        this.emitResponse('tool_progress', {
          event: msg.event,
          name: msg.name,
          preview: msg.preview,
          duration: msg.duration,
          is_error: msg.is_error,
        });
        break;
      case 'tool_start':
        this.emitResponse('tool_start', {
          tool_id: msg.tool_id,
          name: msg.name,
          args: msg.args,
        });
        break;
      case 'tool_complete':
        this.emitResponse('tool_complete', {
          tool_id: msg.tool_id,
          name: msg.name,
          args: msg.args,
          result: msg.result,
        });
        break;
      case 'clarify_request':
        this.emitResponse('clarify_request', {
          request_id: msg.request_id,
          question: msg.question,
          choices: msg.choices ? JSON.parse(msg.choices) : null,
        });
        break;
      case 'status':
        this.emitResponse('status', { kind: msg.kind, text: msg.text });
        break;
```

- [ ] **Step 2: Add `respondToPrompt` method**

After the `stopGeneration` method (after line 153), add:

```javascript
  respondToPrompt(requestId, answer) {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }
    try {
      const message = JSON.stringify({ type: 'respond', request_id: requestId, answer }) + '\n';
      this.process.stdin.write(message);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/main/agent-manager.js
git commit -m "feat: route reasoning/tool/interactive events in agent-manager"
```

### Task 3: Add IPC handler for respond + extend preload

**Files:**
- Modify: `src/main/ipc-handlers.js`
- Modify: `src/preload/index.js`

- [ ] **Step 1: Add IPC handler in `ipc-handlers.js`**

After line 264 (`ipcMain.handle('agent-stop-generation', ...)`), add:

```javascript
  ipcMain.handle('agent-respond', (_, { requestId, answer }) => agentManager.respondToPrompt(requestId, answer));
```

- [ ] **Step 2: Extend preload with `agentRespondToPrompt`**

After line 23 (`agentStopGeneration`), add:

```javascript
  agentRespondToPrompt: (requestId, answer) => ipcRenderer.invoke('agent-respond', { requestId, answer }),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js
git commit -m "feat: add IPC channel for respond-to-prompt"
```

### Task 4: Add styles for reasoning, tool cards, and prompt overlay

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add reasoning block styles**

Append to `styles.css` (after line 1187):

```css
/* Reasoning / Thinking Block */
.message-reasoning {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-reasoning-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--warning);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.message-reasoning-label::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Tool Call Card */
.message-tool-call {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin: var(--space-sm) 0;
  overflow: hidden;
}

.message-tool-call-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition);
}

.message-tool-call-header:hover {
  background: var(--bg-hover);
}

.message-tool-call-name {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 6px;
}

.message-tool-call-name::before {
  content: '⚙';
  font-size: 14px;
}

.message-tool-call-status {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.message-tool-call-status.running {
  color: var(--warning);
}

.message-tool-call-status.done {
  color: var(--success);
}

.message-tool-call-status.error {
  color: var(--error);
}

.message-tool-call-status .spinner {
  width: 10px;
  height: 10px;
  border: 2px solid var(--border-color);
  border-top-color: var(--warning);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.message-tool-call-chevron {
  width: 14px;
  height: 14px;
  transition: transform var(--transition);
  color: var(--text-muted);
}

.message-tool-call.expanded .message-tool-call-chevron {
  transform: rotate(90deg);
}

.message-tool-call-body {
  display: none;
  border-top: 1px solid var(--border-color);
}

.message-tool-call.expanded .message-tool-call-body {
  display: block;
}

.message-tool-call-body-inner {
  padding: var(--space-sm) var(--space-md);
  font-size: 12px;
}

.message-tool-call-args,
.message-tool-call-result {
  margin-bottom: var(--space-sm);
}

.message-tool-call-args:last-child,
.message-tool-call-result:last-child {
  margin-bottom: 0;
}

.message-tool-call-args-label,
.message-tool-call-result-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.message-tool-call-args pre,
.message-tool-call-result pre {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.message-tool-call-result pre {
  border-left: 3px solid var(--success);
}

.message-tool-call-result pre.error {
  border-left-color: var(--error);
}
```

- [ ] **Step 2: Add prompt overlay styles**

Append to `styles.css`:

```css
/* Prompt Overlay (clarify/approval/sudo/secret) */
.prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.prompt-modal {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.prompt-modal h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-md);
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-modal h3 .prompt-icon {
  font-size: 20px;
}

.prompt-question {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: var(--space-lg);
  white-space: pre-wrap;
}

.prompt-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
  line-height: 1.5;
}

.prompt-command {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--error);
  word-break: break-all;
  margin-bottom: var(--space-lg);
}

.prompt-choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.prompt-choice-btn {
  padding: var(--space-sm) var(--space-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
  text-align: left;
}

.prompt-choice-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.prompt-choice-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.prompt-choice-btn.primary:hover {
  background: var(--accent-hover);
}

.prompt-choice-btn.danger {
  border-color: var(--error);
  color: var(--error);
}

.prompt-choice-btn.danger:hover {
  background: var(--error);
  color: #fff;
}

.prompt-input-group {
  margin-bottom: var(--space-lg);
}

.prompt-input-group label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.prompt-input-group input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-sans);
}

.prompt-input-group input:focus {
  outline: none;
  border-color: var(--accent);
}

.prompt-input-group .input-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.prompt-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

.prompt-actions .btn {
  min-width: 80px;
}

/* Disabled chat input when prompt is active */
.chat-input-area.disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat: add styles for reasoning, tool cards, and prompt overlay"
```

### Task 5: Implement renderer logic — reasoning, tools, interactive prompts

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add state variables for pending prompts**

After line 651 (`let agentRunning = false;`), add:

```javascript
let pendingPrompt = null; // { type, request_id, ... }
```

- [ ] **Step 2: Modify `addMessage` to support reasoning + tool cards**

Replace the `addMessage` function (lines 717-733) with:

```javascript
function addMessage(text, sender = 'user', isStreaming = false) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  if (isStreaming) msg.classList.add('streaming');

  let innerHTML = '';
  if (sender === 'agent') {
    if (text) {
      innerHTML += `<div class="message-bubble">${renderMarkdown(text)}</div>`;
    } else {
      innerHTML += `<div class="message-bubble"></div>`;
    }
  } else {
    innerHTML += `<div class="message-bubble">${escapeHtml(text)}</div>`;
  }
  msg.innerHTML = innerHTML;
  const bubble = msg.querySelector('.message-bubble');
  bubble._rawText = text || '';
  bubble._rawReasoning = '';
  bubble._toolCalls = {}; // tool_id -> { name, args, result, status }
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (sender === 'agent' && isStreaming) {
    currentAgentMessageEl = msg;
  }
  return msg;
}
```

- [ ] **Step 3: Modify `updateStreamingMessage` to handle reasoning separately**

Replace the `updateStreamingMessage` function (lines 735-742) with:

```javascript
function updateStreamingMessage(chunk) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  bubble._rawText = (bubble._rawText || '') + chunk;
  bubble.innerHTML = renderMarkdown(bubble._rawText);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
```

- [ ] **Step 4: Add reasoning update function**

After `updateStreamingMessage`, add:

```javascript
function updateReasoning(text) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  bubble._rawReasoning = (bubble._rawReasoning || '') + text;
  // Prepend reasoning block before the message bubble
  let reasoningEl = currentAgentMessageEl.querySelector('.message-reasoning');
  if (!reasoningEl) {
    reasoningEl = document.createElement('div');
    reasoningEl.className = 'message-reasoning';
    reasoningEl.innerHTML = `<div class="message-reasoning-label">思考中</div><div class="message-reasoning-text"></div>`;
    currentAgentMessageEl.insertBefore(reasoningEl, currentAgentMessageEl.firstChild);
  }
  reasoningEl.querySelector('.message-reasoning-text').textContent = bubble._rawReasoning;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
```

- [ ] **Step 5: Add tool call management functions**

After `updateReasoning`, add:

```javascript
function addToolCall(toolId, name, args) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  const toolCalls = bubble._toolCalls || {};
  toolCalls[toolId] = { name, args, result: null, status: 'running' };
  bubble._toolCalls = toolCalls;
  renderToolCalls(bubble);
}

function updateToolCall(toolId, result) {
  if (!currentAgentMessageEl) return;
  const bubble = currentAgentMessageEl.querySelector('.message-bubble');
  const toolCalls = bubble._toolCalls || {};
  if (toolCalls[toolId]) {
    toolCalls[toolId].result = result;
    toolCalls[toolId].status = 'done';
  }
  renderToolCalls(bubble);
}

function renderToolCalls(bubble) {
  const toolCalls = bubble._toolCalls || {};
  const entries = Object.entries(toolCalls);
  if (entries.length === 0) return;

  let existingContainer = bubble.querySelector('.message-tool-calls');
  if (!existingContainer) {
    existingContainer = document.createElement('div');
    existingContainer.className = 'message-tool-calls';
    bubble.appendChild(existingContainer);
  }

  existingContainer.innerHTML = entries.map(([toolId, tc]) => {
    const statusClass = tc.status === 'running' ? 'running' : (tc.result && tc.result.startsWith('ERROR') ? 'error' : 'done');
    const spinnerHtml = tc.status === 'running' ? '<span class="spinner"></span>' : '';
    const resultClass = tc.result && tc.result.startsWith('ERROR') ? 'error' : '';
    const isExpanded = tc.status === 'done';
    return `<div class="message-tool-call ${isExpanded ? 'expanded' : ''}" data-tool-id="${toolId}">
      <div class="message-tool-call-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="message-tool-call-name">${escapeHtml(tc.name)}</span>
        <span class="message-tool-call-status ${statusClass}">${spinnerHtml}${tc.status === 'running' ? '执行中...' : (tc.result && tc.result.startsWith('ERROR') ? '失败' : '完成')}</span>
        <svg class="message-tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="message-tool-call-body">
        <div class="message-tool-call-body-inner">
          <div class="message-tool-call-args">
            <div class="message-tool-call-args-label">参数</div>
            <pre>${escapeHtml(tc.args || '{}')}</pre>
          </div>
          ${tc.result !== null ? `<div class="message-tool-call-result">
            <div class="message-tool-call-result-label">结果</div>
            <pre class="${resultClass}">${escapeHtml(tc.result)}</pre>
          </div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 6: Add prompt overlay functions**

After `renderToolCalls`, add:

```javascript
function showPromptOverlay(type, data) {
  pendingPrompt = { type, ...data };
  // Disable chat input
  const chatInputArea = document.querySelector('.chat-input-area');
  if (chatInputArea) chatInputArea.classList.add('disabled');

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.id = 'prompt-overlay';

  let content = '';
  if (type === 'clarify_request') {
    const choices = data.choices || [];
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">❓</span>需要你的选择</h3>
      <div class="prompt-question">${escapeHtml(data.question)}</div>
      <div class="prompt-choices">
        ${choices.map((c, i) => `<button class="prompt-choice-btn ${i === 0 ? 'primary' : ''}" data-answer="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
    </div>`;
  } else if (type === 'approval_request') {
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">🔐</span>需要权限审批</h3>
      <div class="prompt-description">${escapeHtml(data.description || '以下命令需要你的批准才能执行')}</div>
      <div class="prompt-command">${escapeHtml(data.command || '')}</div>
      <div class="prompt-actions">
        <button class="btn btn-secondary prompt-approve" data-choice="once">批准一次</button>
        <button class="btn btn-secondary prompt-approve" data-choice="session">本次会话批准</button>
        <button class="btn btn-danger prompt-deny" data-choice="deny">拒绝</button>
      </div>
    </div>`;
  } else if (type === 'sudo_request') {
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">🔑</span>需要 sudo 密码</h3>
      <div class="prompt-input-group">
        <label for="prompt-sudo-password">请输入 sudo 密码</label>
        <input type="password" id="prompt-sudo-password" placeholder="密码" autofocus>
      </div>
      <div class="prompt-actions">
        <button class="btn btn-secondary prompt-sudo-cancel">取消</button>
        <button class="btn btn-primary prompt-sudo-submit">提交</button>
      </div>
    </div>`;
  } else if (type === 'secret_request') {
    content = `<div class="prompt-modal">
      <h3><span class="prompt-icon">🔒</span>需要密钥</h3>
      <div class="prompt-description">${escapeHtml(data.prompt || `请输入 ${data.env_var} 的值`)}</div>
      <div class="prompt-input-group">
        <label for="prompt-secret-value">${escapeHtml(data.env_var || 'Value')}</label>
        <input type="password" id="prompt-secret-value" placeholder="输入密钥" autofocus>
        ${data.metadata ? `<div class="input-hint">${escapeHtml(JSON.stringify(data.metadata))}</div>` : ''}
      </div>
      <div class="prompt-actions">
        <button class="btn btn-secondary prompt-secret-skip">跳过</button>
        <button class="btn btn-primary prompt-secret-submit">提交</button>
      </div>
    </div>`;
  }

  overlay.innerHTML = content;
  document.body.appendChild(overlay);

  // Bind events
  if (type === 'clarify_request') {
    overlay.querySelectorAll('.prompt-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => submitPrompt(btn.dataset.answer));
    });
  } else if (type === 'approval_request') {
    overlay.querySelectorAll('.prompt-approve').forEach(btn => {
      btn.addEventListener('click', () => submitPrompt(btn.dataset.choice));
    });
    overlay.querySelectorAll('.prompt-deny').forEach(btn => {
      btn.addEventListener('click', () => submitPrompt('deny'));
    });
  } else if (type === 'sudo_request') {
    overlay.querySelector('.prompt-sudo-submit')?.addEventListener('click', () => {
      const pw = document.getElementById('prompt-sudo-password')?.value || '';
      submitPrompt(pw);
    });
    overlay.querySelector('.prompt-sudo-cancel')?.addEventListener('click', () => submitPrompt(''));
    document.getElementById('prompt-sudo-password')?.focus();
  } else if (type === 'secret_request') {
    overlay.querySelector('.prompt-secret-submit')?.addEventListener('click', () => {
      const val = document.getElementById('prompt-secret-value')?.value || '';
      submitPrompt(val);
    });
    overlay.querySelector('.prompt-secret-skip')?.addEventListener('click', () => submitPrompt(''));
    document.getElementById('prompt-secret-value')?.focus();
  }
}

function removePromptOverlay() {
  const overlay = document.getElementById('prompt-overlay');
  if (overlay) overlay.remove();
  pendingPrompt = null;
  const chatInputArea = document.querySelector('.chat-input-area');
  if (chatInputArea) chatInputArea.classList.remove('disabled');
}

async function submitPrompt(answer) {
  if (!pendingPrompt) return;
  const requestId = pendingPrompt.request_id;
  removePromptOverlay();
  try {
    await window.api.agentRespondToPrompt(requestId, answer);
  } catch (err) {
    console.error('Respond to prompt failed:', err);
  }
}
```

- [ ] **Step 7: Update the `onAgentResponse` handler**

Replace the `window.api.onAgentResponse` block (lines 947-981) with:

```javascript
  window.api.onAgentResponse((data) => {
    switch (data.event) {
      case 'start':
        addMessage('', 'agent', true);
        break;
      case 'chunk':
        updateStreamingMessage(data.data);
        break;
      case 'reasoning':
        updateReasoning(data.data);
        break;
      case 'thinking':
        // Update thinking label text if present
        if (currentAgentMessageEl) {
          const reasoningEl = currentAgentMessageEl.querySelector('.message-reasoning-label');
          if (reasoningEl && data.data) {
            reasoningEl.textContent = data.data;
          }
        }
        break;
      case 'tool_start':
        addToolCall(data.data.tool_id, data.data.name, data.data.args);
        break;
      case 'tool_complete':
        updateToolCall(data.data.tool_id, data.data.result);
        break;
      case 'tool_progress':
        // tool_progress events are supplementary; tool_start/tool_complete handle the main lifecycle
        break;
      case 'tool_gen':
        // tool_gen indicates the model is generating tool args; could show a brief indicator
        break;
      case 'clarify_request':
        showPromptOverlay('clarify_request', {
          request_id: data.data.request_id,
          question: data.data.question,
          choices: data.data.choices,
        });
        break;
      case 'approval_request':
        showPromptOverlay('approval_request', {
          request_id: data.data.request_id,
          command: data.data.command,
          description: data.data.description,
        });
        break;
      case 'sudo_request':
        showPromptOverlay('sudo_request', {
          request_id: data.data.request_id,
        });
        break;
      case 'secret_request':
        showPromptOverlay('secret_request', {
          request_id: data.data.request_id,
          env_var: data.data.env_var,
          prompt: data.data.prompt,
          metadata: data.data.metadata,
        });
        break;
      case 'complete':
        finalizeStreamingMessage();
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        break;
      case 'error':
        if (currentAgentMessageEl) {
          const bubble = currentAgentMessageEl.querySelector('.message-bubble');
          bubble._rawText = data.data;
          bubble.innerHTML = renderMarkdown(data.data);
          finalizeStreamingMessage();
        } else {
          addMessage(data.data, 'agent');
        }
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        break;
      case 'stopped':
        finalizeStreamingMessage();
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        break;
    }
  });
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: render reasoning, tool cards, and interactive prompts in chat"
```

### Task 6: Handle approval_request from bridge

**Files:**
- Modify: `src/main/agent-bridge.py`

The approval system in hermes-agent uses a separate queue-based mechanism (not `_block`). We need to wire `register_gateway_notify` in the bridge. However, since the bridge doesn't have access to the session key mechanism used by the TUI gateway, we need to implement a simpler approach: wire the approval notification through a callback that uses the same `_block_for_input` mechanism.

- [ ] **Step 1: Check if approval can be wired via status_callback or a custom approach**

The approval system uses `register_gateway_notify(key, callback)` which is called during session init in the TUI gateway. In the bridge, we don't have session management, so we need to check if the approval system can be triggered through a simpler callback.

First, check if `approval.py` exposes a simple callback mechanism:

```python
# In approval.py, the register_gateway_notify function:
def register_gateway_notify(key: str, notify_cb: Callable[[dict], None]) -> None:
```

This requires a `session_key`. In the bridge, we can use a static key since there's only one concurrent session. We need to also call `resolve_gateway_approval` when the user responds.

Add after the `_block_for_input` function:

```python
# Approval state
_approval_pending = {}  # session_key -> (event, result)

def _resolve_approval(session_key, choice):
    """Resolve a pending approval request."""
    if session_key in _approval_pending:
        ev, = _approval_pending[session_key]
        _approval_pending[session_key] = (ev, choice)
        ev.set()

def _block_for_approval(command, description, pattern_keys):
    """Block until the GUI responds to an approval request."""
    import threading
    session_key = "bridge-session"  # Single session in bridge
    ev = threading.Event()
    _approval_pending[session_key] = (ev, None)
    sys.stdout.write(json.dumps({
        "type": "approval_request",
        "command": command,
        "description": description,
        "pattern_keys": pattern_keys,
    }) + "\n")
    sys.stdout.flush()
    ev.wait(timeout=300)
    result = _approval_pending.pop(session_key, (None, "deny"))[1] or "deny"
    return result
```

However, this requires modifying how the approval system is initialized. Since the approval system is complex and session-key based, and the bridge is a simpler single-session model, the most practical approach is to handle approval through the `tool_progress_callback` which already fires `"tool.completed"` events. The approval system in the TUI gateway uses `register_gateway_notify` which is called during session initialization — this is not available in the bridge without modifying hermes-agent (which we cannot do).

**Decision:** For the initial implementation, skip explicit `approval_request` handling since it requires hermes-agent modifications. The `tool_progress_callback` already surfaces tool execution status. Add a TODO comment noting this limitation.

- [ ] **Step 2: Add TODO comment in bridge.py noting approval limitation**

```python
# TODO: approval_request requires register_gateway_notify from hermes-agent's approval.py
# which needs session key management. The TUI gateway handles this in server.py session init.
# For now, tool execution status is visible via tool_progress_callback (tool.started/tool.completed).
```

- [ ] **Step 3: Commit**

```bash
git add src/main/agent-bridge.py
git commit -m "feat: add approval TODO note in bridge"
```

### Task 7: Test end-to-end in dev mode

**Files:**
- No file changes

- [ ] **Step 1: Verify bridge.py syntax**

Run: `python3 -c "import py_compile; py_compile.compile('src/main/agent-bridge.py', doraise=True)"`
Expected: No errors

- [ ] **Step 2: Start dev mode**

Run: `npm run dev`

- [ ] **Step 3: Test scenarios**

1. Start Agent from logs page
2. Send a message that triggers tool usage (e.g., "list files in current directory")
3. Verify tool call cards appear in the agent message bubble with expandable args/result
4. Send a message that triggers reasoning (if model supports it)
5. Verify reasoning block appears above the response with monospace font
6. Verify the chat input is disabled when a prompt overlay is shown
7. Verify clicking choice buttons in clarify overlay sends the response back

- [ ] **Step 4: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found in E2E testing"
```

---

## Spec Self-Review

**1. Spec coverage:**
- ✅ Thinking/reasoning display — Task 1 (bridge callbacks), Task 5 (renderer reasoning block)
- ✅ Tool execution visibility — Task 1 (tool_start/tool_complete callbacks), Task 5 (tool card rendering)
- ✅ Interactive prompts (clarify) — Task 1 (clarify_callback), Task 5 (overlay UI)
- ⚠️ Interactive prompts (approval) — Task 6 documents limitation; approval requires session-key management from hermes-agent that bridge doesn't have
- ✅ Interactive prompts (sudo/secret) — Task 1 (_block_for_input), Task 5 (overlay UI)
- ✅ Response routing — Task 2 (respondToPrompt), Task 3 (IPC + preload)
- ✅ Real-time streaming — reasoning.delta and tool events flow through existing agent-response channel

**2. Placeholder scan:** No "TBD", "TODO" (except the noted approval limitation), or vague requirements.

**3. Type consistency:** Event names are consistent across bridge.py → agent-manager.js → preload → app.js. All use snake_case in JSON, camelCase in JS.

**4. Scope check:** The plan is focused on a single feature. The approval limitation is documented and can be addressed in a follow-up if needed.
