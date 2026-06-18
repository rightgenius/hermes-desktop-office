# Hermes Desktop 性能优化与 API 错误处理改进方案

## 1. 背景与目标

### 问题描述
1. **对话轮数增多后界面卡顿**：无虚拟列表，每次渲染全量 Markdown
2. **API 错误无友好提示**：错误信息直接追加到消息气泡中，用户难以区分正常回复和错误
3. **localStorage 持续膨胀**：历史消息无限累积

### 改进目标
- 消息数量多时仍保持流畅滚动
- API 错误及时显示，且格式友好
- 避免界面卡死，增强错误可感知性

---

## 2. 核心改动

### 2.1 API 错误处理（高优先级）

#### 现状分析
- `agent-bridge.py` 会 emit `{"type": "error", "session_id": "xxx", "message": "..."}`
- `app.js` 的 `onAgentResponse` 收到 `error` 事件后调用 `finalizeStreamingMessage(sessionId, data.data)`
- `finalizeStreamingMessage` 将错误文本直接作为普通消息渲染，没有视觉区分

#### 改进方案

**① 添加错误类型分类**

在 `agent-bridge.py` 中丰富错误信息结构：

```python
# agent-bridge.py
def _classify_error(e):
    """分类 API 错误并返回友好的用户提示"""
    msg = str(e)
    error_type_map = {
        # 认证类
        "401": ("认证失败", "请检查 API Key 是否正确，或是否已过期"),
        "invalid api key": ("认证失败", "API Key 无效，请到设置中更新"),
        "unauthorized": ("认证失败", "未授权访问，请检查 API Key 配置"),
        # 限流类
        "429": ("请求过于频繁", "已触发限流，请稍后重试"),
        "rate_limit": ("请求过于频繁", "已触发限流，请稍后重试"),
        "too many requests": ("请求过于频繁", "已触发限流，请稍后重试"),
        # 上下文超限
        "context_length": ("对话过长", "上下文超出模型限制，建议开启新对话"),
        "max_tokens": ("回复过长", "单次回复超出限制，请减少请求内容"),
        # 网络类
        "timeout": ("请求超时", "网络连接超时，请检查网络或代理设置"),
        "connection": ("网络错误", "无法连接服务器，请检查网络或代理设置"),
        "proxy": ("代理错误", "代理连接失败，请检查代理配置"),
        # 服务类
        "503": ("服务不可用", "服务器暂时过载，请稍后重试"),
        "service_unavailable": ("服务不可用", "服务器暂时过载，请稍后重试"),
        "overloaded": ("服务过载", "服务器过载，请稍后重试"),
        "model overloaded": ("服务过载", "服务器过载，请稍后重试"),
        # 余额类
        "402": ("余额不足", "账户余额不足，请充值"),
        "insufficient": ("余额不足", "账户余额不足，请充值"),
        "quota": ("配额耗尽", "API 配额已用尽，请等待重置或升级套餐"),
        # 通用
        "500": ("服务器错误", "服务器内部错误，请稍后重试"),
        "502": ("网关错误", "网关错误，请稍后重试"),
        "504": ("网关超时", "网关超时，请稍后重试"),
    }
    
    msg_lower = msg.lower()
    for key, (title, detail) in error_type_map.items():
        if key in msg_lower:
            return {
                "type": "api_error",
                "category": key,
                "title": title,
                "detail": detail,
                "original_message": msg
            }
    
    return {
        "type": "api_error",
        "category": "unknown",
        "title": "请求失败",
        "detail": "发生未知错误，请查看详情或重试",
        "original_message": msg
    }

# 修改错误 emit
except Exception as e:
    error_info = _classify_error(e)
    error_info["session_id"] = session_id
    _emit(error_info)  # 发送结构化错误而非纯文本
```

**② 修改 renderer 端错误渲染**

```javascript
// app.js

// 错误分类显示的图标和颜色
const ERROR_CATEGORIES = {
  '401': { icon: '🔑', color: '#ef4444', bg: '#fef2f2' },
  '认证失败': { icon: '🔑', color: '#ef4444', bg: '#fef2f2' },
  '429': { icon: '⏳', color: '#f97316', bg: '#fff7ed' },
  '请求过于频繁': { icon: '⏳', color: '#f97316', bg: '#fff7ed' },
  'context_length': { icon: '📝', color: '#8b5cf6', bg: '#f5f3ff' },
  '对话过长': { icon: '📝', color: '#8b5cf6', bg: '#f5f3ff' },
  'timeout': { icon: '🌐', color: '#3b82f6', bg: '#eff6ff' },
  '网络错误': { icon: '🌐', color: '#3b82f6', bg: '#eff6ff' },
  '503': { icon: '⚠️', color: '#eab308', bg: '#fefce8' },
  '服务不可用': { icon: '⚠️', color: '#eab308', bg: '#fefce8' },
  '402': { icon: '💰', color: '#ec4899', bg: '#fdf2f8' },
  '余额不足': { icon: '💰', color: '#ec4899', bg: '#fdf2f8' },
  'default': { icon: '❌', color: '#6b7280', bg: '#f9fafb' }
};

function renderErrorMessage(errorInfo) {
  const category = errorInfo.category || 'default';
  const style = ERROR_CATEGORIES[category] || ERROR_CATEGORIES['default'];
  
  return `
    <div class="message-error" style="background: ${style.bg}; border-left: 3px solid ${style.color};">
      <div class="message-error-header">
        <span class="message-error-icon">${style.icon}</span>
        <span class="message-error-title" style="color: ${style.color};">${errorInfo.title || '请求失败'}</span>
      </div>
      <div class="message-error-detail">${errorInfo.detail || ''}</div>
      ${errorInfo.original_message && errorInfo.original_message !== errorInfo.detail ? 
        `<details class="message-error-raw">
          <summary>原始错误信息</summary>
          <pre>${escapeHtml(errorInfo.original_message)}</pre>
        </details>` : ''}
      <div class="message-error-actions">
        <button class="btn-retry" onclick="retryLastMessage()">重试</button>
      </div>
    </div>
  `;
}

// 修改 finalizeStreamingMessage
function finalizeStreamingMessage(sessionId, errorData = null) {
  if (!sessionId) return;
  
  const msg = getStreamingMessageEl(sessionId);
  if (!msg) {
    delete streamingSessions[sessionId];
    return;
  }
  
  msg.classList.remove('streaming');
  hideReasoning(sessionId);
  const bubble = msg.querySelector('.message-bubble');
  
  if (errorData && typeof errorData === 'object' && errorData.type === 'api_error') {
    // 结构化错误渲染
    bubble.innerHTML = renderErrorMessage(errorData);
    // 保存错误信息到 session
    addMessageToSession('', 'agent', '', {}, sessionId); // 空消息占位
    // 更新刚添加的消息内容
    const sessions = loadSessions();
    const session = sessions[sessionId];
    if (session && session.messages.length > 0) {
      const lastMsg = session.messages[session.messages.length - 1];
      lastMsg.error = errorData; // 保存错误信息用于重试
      saveSessions(sessions);
    }
  } else {
    // 普通文本错误
    const text = errorData || bubble._rawText || bubble.textContent;
    const reasoning = bubble._rawReasoning || '';
    const toolCalls = bubble._toolCalls || {};
    addMessageToSession(text, 'agent', reasoning, toolCalls, sessionId);
  }
  
  delete streamingSessions[sessionId];
  
  if (sessionId === currentSessionId) {
    currentAgentMessageEl = null;
  }
}

// 重试功能
let lastFailedSessionId = null;
let lastFailedMessage = null;

function retryLastMessage() {
  if (lastFailedSessionId && lastFailedMessage) {
    switchToSession(lastFailedSessionId);
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = lastFailedMessage;
      input.focus();
      // 触发发送
      setTimeout(() => sendMessage(), 100);
    }
  }
}

// 保存失败的消息用于重试
window.api.onAgentResponse((data) => {
  if (data.event === 'error') {
    const sessionId = data.sessionId || currentSessionId;
    lastFailedSessionId = sessionId;
    // 从 UI 获取用户消息
    const sessions = loadSessions();
    if (sessions[sessionId]) {
      const msgs = sessions[sessionId].messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].sender === 'user') {
          lastFailedMessage = msgs[i].text;
          break;
        }
      }
    }
  }
});
```

**③ 添加 CSS 样式**

```css
/* styles.css */

.message-error {
  padding: 12px 16px;
  border-radius: 8px;
  margin: 8px 0;
}

.message-error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.message-error-icon {
  font-size: 18px;
}

.message-error-title {
  font-weight: 600;
  font-size: 14px;
}

.message-error-detail {
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 8px;
}

.message-error-raw {
  margin: 8px 0;
  font-size: 12px;
}

.message-error-raw summary {
  cursor: pointer;
  color: #6b7280;
}

.message-error-raw pre {
  background: #f3f4f6;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin-top: 4px;
  font-size: 11px;
}

.message-error-actions {
  margin-top: 12px;
}

.btn-retry {
  padding: 6px 16px;
  background: var(--accent, #3b82f6);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: opacity 0.2s;
}

.btn-retry:hover {
  opacity: 0.9;
}
```

---

### 2.2 Markdown 渲染优化（中优先级）

#### 问题
每次收到 chunk 都调用 `renderMarkdown()` 全量重解析，效率低。

#### 改进方案：增量渲染 + Debounce

```javascript
// app.js

// 添加 debounce 工具函数
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// 增量渲染器
const pendingRenders = new Map(); // sessionId -> timeoutId

function scheduleRenderMarkdown(sessionId) {
  // 取消之前的渲染任务
  if (pendingRenders.has(sessionId)) {
    clearTimeout(pendingRenders.get(sessionId));
  }
  
  // 100ms 后执行渲染
  const timeoutId = setTimeout(() => {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const bubble = msg.querySelector('.message-bubble');
      if (bubble && bubble._rawText !== undefined) {
        bubble.innerHTML = renderMarkdownIncremental(bubble._rawText);
        
        // 保持工具调用位置
        const toolCallsContainer = bubble.querySelector('.message-tool-calls');
        if (toolCallsContainer) {
          bubble.insertBefore(toolCallsContainer, bubble.firstChild);
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
    pendingRenders.delete(sessionId);
  }, 100);
  
  pendingRenders.set(sessionId, timeoutId);
}

// 修改 updateStreamingMessage
function updateStreamingMessage(sessionId, chunk) {
  // 更新内存状态
  if (sessionId) {
    if (!streamingSessions[sessionId]) {
      streamingSessions[sessionId] = { text: '', reasoning: '', toolCalls: {} };
    }
    streamingSessions[sessionId].text += chunk;
  }

  // 更新 DOM 状态
  if (sessionId === currentSessionId) {
    const msg = getStreamingMessageEl(sessionId);
    if (msg) {
      const bubble = msg.querySelector('.message-bubble');
      bubble._rawText = (bubble._rawText || '') + chunk;
      
      // 增量更新：只追加新文本
      // 对于普通文本，直接追加 span
      if (!chunk.includes('```') && !chunk.includes('**') && !chunk.includes('##')) {
        // 普通文本增量追加
        const textSpan = bubble.querySelector('.streaming-text');
        if (textSpan) {
          textSpan.textContent = bubble._rawText;
        } else {
          const span = document.createElement('span');
          span.className = 'streaming-text';
          span.textContent = bubble._rawText;
          bubble.appendChild(span);
        }
      } else {
        // 复杂 Markdown 调度完整渲染
        bubble.innerHTML = '';
        bubble._needsFullRender = true;
        scheduleRenderMarkdown(sessionId);
      }
      
      chatMessages.scrollTop = chatMessages.scrollHeight;
      currentAgentMessageEl = msg;
    }
  }
}
```

---

### 2.3 消息数量限制（高优先级）

#### 问题
localStorage 无限存储消息，导致：
- localStorage 膨胀（5MB+ 性能下降）
- 加载慢
- 渲染慢

#### 改进方案：限制保留消息数量

```javascript
// app.js

const MAX_MESSAGES_PER_SESSION = 100;  // 每个 session 最多保留 100 条消息
const MAX_TOTAL_STORAGE_MB = 4;        // localStorage 上限 4MB

function trimSessionMessages(session) {
  if (!session || !session.messages) return session;
  
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    // 保留最新的消息
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  
  return session;
}

function checkStorageLimit() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY) || '{}';
    const sizeBytes = new Blob([raw]).size;
    const sizeMB = sizeBytes / (1024 * 1024);
    
    if (sizeMB > MAX_TOTAL_STORAGE_MB) {
      console.warn(`localStorage size (${sizeMB.toFixed(2)}MB) exceeds limit`);
      // 清理最旧的 session
      const sessions = loadSessions();
      const sorted = Object.values(sessions)
        .sort((a, b) => (b.messages?.length || 0) - (a.messages?.length || 0));
      
      // 优先清理消息最多的旧 session
      while (sizeMB > MAX_TOTAL_STORAGE_MB * 0.8 && sorted.length > 3) {
        const oldest = sorted.pop();
        delete sessions[oldest.id];
        const raw = JSON.stringify(sessions);
        const newSizeBytes = new Blob([raw]).size;
        sizeMB = newSizeBytes / (1024 * 1024);
      }
      saveSessions(sessions);
    }
  } catch (e) {
    console.error('Storage limit check failed:', e);
    // 紧急清理
    const sessions = loadSessions();
    Object.keys(sessions).forEach(id => {
      if (id !== currentSessionId) {
        delete sessions[id];
      }
    });
    saveSessions(sessions);
  }
}

// 修改 saveSessions
function saveSessions(sessions) {
  try {
    // 先检查并清理
    checkStorageLimit();
    
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      // 强制清理
      const fresh = { [currentSessionId]: sessions[currentSessionId] };
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(fresh));
    }
  }
}

// 修改 addMessageToSessionById：自动截断
function addMessageToSessionById(sessionId, text, sender, reasoning = '', toolCalls = {}) {
  if (!sessionId) return;
  const sessions = loadSessions();
  if (sessions[sessionId]) {
    sessions[sessionId].messages.push({
      text, 
      sender, 
      timestamp: Date.now(),
      reasoning,
      toolCalls: Object.entries(toolCalls).map(([id, tc]) => ({
        toolId: id,
        ...tc
      }))
    });
    
    // 自动截断超长会话
    sessions[sessionId] = trimSessionMessages(sessions[sessionId]);
    
    if (sender === 'user' && sessions[sessionId].messages.length <= 2) {
      sessions[sessionId].title = text.slice(0, 30);
    }
    saveSessions(sessions);
    renderSessionList();
    return sessions[sessionId].messages.length - 1;
  }
}
```

---

### 2.4 历史消息懒加载（可选，中优先级）

#### 方案
打开 session 时只加载最近 30 条消息，向上滚动时按需加载更多。

```javascript
// app.js

const MESSAGES_INITIAL_LOAD = 30;
const MESSAGES_PAGE_SIZE = 20;

function loadSession(sessionId, loadAll = false) {
  currentSessionId = sessionId;
  const sessions = loadSessions();
  const session = sessions[sessionId];
  chatMessages.innerHTML = '';
  
  if (!session) {
    restoreChatEmptyState();
    return;
  }
  
  const messages = session.messages || [];
  
  if (loadAll || messages.length <= MESSAGES_INITIAL_LOAD) {
    // 全部加载
    messages.forEach((m, index) => addMessage(m.text, m.sender, false, m.reasoning || '', m.toolCalls || [], '', index));
  } else {
    // 只加载最近的 N 条
    const startIndex = messages.length - MESSAGES_INITIAL_LOAD;
    for (let i = startIndex; i < messages.length; i++) {
      addMessage(messages[i].text, messages[i].sender, false, messages[i].reasoning || '', messages[i].toolCalls || [], '', i);
    }
    
    // 添加"加载更多"按钮
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-messages';
    loadMoreBtn.textContent = `加载更多消息 (${startIndex} 条)`;
    loadMoreBtn.onclick = () => loadMoreMessages(sessionId, startIndex);
    chatMessages.insertBefore(loadMoreBtn, chatMessages.firstChild);
  }
  
  if (messages.length === 0) restoreChatEmptyState();
  
  restoreStreamingState();
  syncInputAreaState(sessionId);
  syncWorkspacePath(session.workspacePath);
  renderSessionList();
}

function loadMoreMessages(sessionId, fromIndex) {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return;
  
  const messages = session.messages || [];
  const loadCount = Math.min(MESSAGES_PAGE_SIZE, fromIndex);
  const startIndex = fromIndex - loadCount;
  
  // 在"加载更多"按钮前插入消息
  const loadMoreBtn = chatMessages.querySelector('.load-more-messages');
  
  for (let i = startIndex; i < fromIndex; i++) {
    const msgEl = addMessage(messages[i].text, messages[i].sender, false, messages[i].reasoning || '', messages[i].toolCalls || [], '', i);
    chatMessages.insertBefore(msgEl, loadMoreBtn);
  }
  
  // 更新或移除"加载更多"按钮
  if (startIndex <= 0) {
    loadMoreBtn?.remove();
  } else {
    loadMoreBtn.textContent = `加载更多消息 (${startIndex} 条)`;
  }
}
```

---

## 3. 改动文件清单

| 文件 | 改动内容 |
|------|---------|
| `src/main/agent-bridge.py` | 增强错误分类，发送结构化错误信息 |
| `src/renderer/app.js` | 错误渲染、debounce 渲染、消息限制、懒加载 |
| `src/renderer/styles.css` | 添加错误消息样式 |

---

## 4. 测试计划

### 功能测试
1. 发送消息，触发 401 错误 → 验证错误显示格式
2. 发送消息，触发 429 限流 → 验证限流提示
3. 发送超长消息触发 context_length → 验证超长提示
4. 点击"重试"按钮 → 验证重试功能
5. 消息数量超过 100 条 → 验证自动截断
6. localStorage 接近 5MB → 验证自动清理

### 性能测试
1. 模拟 50 条消息加载 → 验证加载时间 < 1s
2. 模拟 100 条消息滚动 → 验证滚动流畅
3. 模拟长回复（5000+ 字符）streaming → 验证渲染无卡顿

### 边界测试
1. 网络断开时发送消息 → 验证网络错误提示
2. API Key 错误 → 验证认证错误提示
3. 余额耗尽 → 验证余额不足提示

---

## 5. 风险与回滚

| 风险 | 缓解措施 |
|------|---------|
| 错误分类不准确 | 保留原始错误信息在 details 中可展开 |
| debounce 影响响应速度 | 保持快速响应的同时减少渲染次数 |
| 消息截断丢失重要上下文 | 只在超限时截断，并保留最近 100 条 |
| localStorage 清理影响用户数据 | 保留当前 session，只清理旧的 |

---

## 6. 实施顺序

1. **Phase 1**: API 错误友好提示（影响最小，收益最大）
2. **Phase 2**: 消息数量限制（防止 localStorage 膨胀）
3. **Phase 3**: Markdown 渲染优化（可选，提升长回复体验）
4. **Phase 4**: 历史消息懒加载（可选，大幅提升加载速度）

---

## 7. 自动重试机制

### 7.1 重试策略设计

#### 重试条件
以下错误类型支持自动重试：

| 错误类型 | 可重试 | 重试理由 |
|---------|-------|---------|
| 429 (限流) | ✅ | 限流是临时性的，等待后通常可恢复 |
| 503 (服务不可用) | ✅ | 服务可能短暂不可用 |
| timeout (超时) | ✅ | 网络波动可能导致超时 |
| connection (连接错误) | ✅ | 网络不稳定时的临时问题 |
| 502/504 (网关错误) | ✅ | 网关问题通常是短暂的 |
| 401 (认证) | ❌ | API Key 错误，重试无意义 |
| 402 (余额不足) | ❌ | 余额问题不会随时间改善 |
| context_length (上下文超限) | ❌ | 需要用户干预开启新对话 |

#### 重试参数

```javascript
const RETRY_CONFIG = {
  maxRetries: 3,              // 最大重试次数
  initialDelayMs: 2000,        // 初始等待时间 (2秒)
  maxDelayMs: 30000,          // 最大等待时间 (30秒)
  backoffMultiplier: 2,        // 退避倍数 (2s → 4s → 8s)
  jitterPercent: 0.2,          // 抖动百分比 ±20%，避免惊群效应
};
```

#### 指数退避 + 抖动

```
延迟 = min(initialDelay * (backoffMultiplier ^ attempt) + random * jitter, maxDelayMs)
```

示例：
- 第1次重试：2s + ±0.4s = 1.6s ~ 2.4s
- 第2次重试：4s + ±0.8s = 3.2s ~ 4.8s  
- 第3次重试：8s + ±1.6s = 6.4s ~ 9.6s

### 7.2 实现方案

#### ① 修改 agent-bridge.py

```python
# agent-bridge.py

# 定义可重试的错误类型
RETRYABLE_ERROR_PATTERNS = [
    "429",
    "rate_limit",
    "too many requests",
    "503",
    "service_unavailable",
    "overloaded",
    "timeout",
    "connection",
    "connection refused",
    "connection reset",
    "502",
    "504",
    "gateway timeout",
]

RETRYABLE_HTTP_CODES = {429, 502, 503, 504}

def _is_retryable_error(error_msg: str, http_code: int = None) -> bool:
    """判断错误是否可重试"""
    # 检查 HTTP 状态码
    if http_code in RETRYABLE_HTTP_CODES:
        return True
    
    # 检查错误信息
    error_lower = str(error_msg).lower()
    for pattern in RETRYABLE_ERROR_PATTERNS:
        if pattern in error_lower:
            return True
    
    return False

def _classify_error(e, http_code=None):
    """增强错误分类，返回是否可重试"""
    error_info = _classify_error_original(e)  # 原有逻辑
    
    # 添加重试相关信息
    error_info["retryable"] = _is_retryable_error(str(e), http_code)
    error_info["http_code"] = http_code
    
    return error_info
```

#### ② 修改 renderer 端：自动重试管理器

```javascript
// app.js

// ============================
// 自动重试管理器
// ============================

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 0.2,
};

// 可重试的错误类型
const RETRYABLE_CATEGORIES = new Set([
  '429', 'rate_limit', 'too many requests',
  '503', 'service_unavailable', 'overloaded', 'model overloaded',
  'timeout', 'connection', 'network', 'proxy',
  '502', '504', 'gateway'
]);

// 重试状态
let retryState = {
  sessionId: null,
  messageText: null,
  retryCount: 0,
  isRetrying: false,
  timeoutId: null,
  abortController: null,
};

function isRetryableError(errorInfo) {
  if (!errorInfo) return false;
  
  const category = errorInfo.category || '';
  if (RETRYABLE_CATEGORIES.has(category)) return true;
  
  // 检查 title 是否包含关键词
  const title = errorInfo.title || '';
  const retryableKeywords = ['限流', '超时', '服务', '过载', '网络', '网关'];
  return retryableKeywords.some(kw => title.includes(kw));
}

function calculateDelay(attempt) {
  // 指数退避
  let delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  
  // 添加抖动
  const jitter = delay * RETRY_CONFIG.jitterPercent;
  delay += (Math.random() * 2 - 1) * jitter;
  
  // 限制最大延迟
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

function formatDelay(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}

function showRetryCountdown(seconds) {
  const msg = getStreamingMessageEl(retryState.sessionId);
  if (!msg) return;
  
  const bubble = msg.querySelector('.message-bubble');
  if (!bubble) return;
  
  // 更新倒计时显示
  let countdownEl = bubble.querySelector('.retry-countdown');
  if (!countdownEl) {
    countdownEl = document.createElement('div');
    countdownEl.className = 'retry-countdown';
    bubble.appendChild(countdownEl);
  }
  
  countdownEl.innerHTML = `
    <span class="countdown-icon">⏳</span>
    <span class="countdown-text">将在 ${formatDelay(seconds)} 后自动重试...</span>
    <span class="countdown-progress"></span>
  `;
  
  // 添加进度条动画
  const progressEl = countdownEl.querySelector('.countdown-progress');
  if (progressEl) {
    progressEl.style.animation = `retry-progress ${seconds}s linear forwards`;
  }
}

function showRetryNotice(sessionId, attempt, maxRetries, delayMs) {
  const noticeEl = document.createElement('div');
  noticeEl.className = 'message notice retry-notice';
  noticeEl.innerHTML = `
    <div class="message-notice">
      <span class="notice-icon">🔄</span>
      <span class="notice-text">
        第 ${attempt}/${maxRetries} 次重试，将在 ${formatDelay(delayMs)} 后自动发送...
      </span>
      <button class="notice-cancel" title="取消重试">×</button>
    </div>
  `;
  
  noticeEl.querySelector('.notice-cancel').onclick = () => cancelRetry();
  
  chatMessages.appendChild(noticeEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  return noticeEl;
}

function cancelRetry() {
  if (retryState.timeoutId) {
    clearTimeout(retryState.timeoutId);
    retryState.timeoutId = null;
  }
  if (retryState.abortController) {
    retryState.abortController.abort();
    retryState.abortController = null;
  }
  
  // 移除重试提示
  const notices = chatMessages.querySelectorAll('.retry-notice');
  notices.forEach(n => n.remove());
  
  retryState.isRetrying = false;
  retryState.sessionId = null;
  retryState.messageText = null;
  retryState.retryCount = 0;
}

async function executeRetry() {
  const { sessionId, messageText, retryCount } = retryState;
  
  if (!sessionId || !messageText) {
    cancelRetry();
    return;
  }
  
  // 移除之前的重试提示
  const notices = chatMessages.querySelectorAll('.retry-notice');
  notices.forEach(n => n.remove());
  
  // 创建 AbortController 用于取消
  retryState.abortController = new AbortController();
  
  try {
    // 获取当前会话的历史（从内存中获取最新）
    const sessions = loadSessions();
    const session = sessions[sessionId];
    const history = extractHistoryForAPI(session);
    
    // 显示重试提示
    const noticeEl = showRetryNotice(
      sessionId,
      retryCount + 1,
      RETRY_CONFIG.maxRetries,
      0  // 立即开始
    );
    
    // 调用 API
    const result = await window.api.agentSendMessage(
      sessionId,
      messageText,
      history,
      { signal: retryState.abortController.signal }
    );
    
    // 成功，取消重试状态
    cancelRetry();
    
  } catch (error) {
    if (error.name === 'AbortError') {
      // 用户取消
      cancelRetry();
      return;
    }
    
    // 再次失败
    const errorInfo = parseErrorResponse(error);
    
    if (isRetryableError(errorInfo) && retryCount < RETRY_CONFIG.maxRetries - 1) {
      // 继续重试
      scheduleRetry(errorInfo);
    } else {
      // 重试次数用尽或不可重试的错误
      cancelRetry();
      
      // 如果是原错误，让它正常显示错误消息
      // 如果是新的错误，显示新的错误
      if (errorInfo) {
        displayErrorMessage(sessionId, errorInfo);
      }
    }
  }
}

function scheduleRetry(errorInfo) {
  const attempt = retryState.retryCount;
  const delay = calculateDelay(attempt);
  
  retryState.retryCount++;
  retryState.isRetrying = true;
  
  // 显示倒计时
  let remaining = delay;
  const countdownInterval = setInterval(() => {
    remaining -= 1000;
    if (remaining > 0) {
      showRetryCountdown(remaining);
    } else {
      clearInterval(countdownInterval);
    }
  }, 1000);
  
  // 延迟后执行重试
  retryState.timeoutId = setTimeout(() => {
    clearInterval(countdownInterval);
    executeRetry();
  }, delay);
}

function extractHistoryForAPI(session) {
  if (!session || !session.messages) return [];
  
  return session.messages.map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.text || m.error?.original_message || ''
  }));
}

function parseErrorResponse(error) {
  // 尝试从错误响应中提取结构化错误信息
  try {
    if (error.response) {
      const data = error.response.data || error.response;
      if (data.type === 'api_error') {
        return data;
      }
      // 尝试从 message 字段解析
      if (data.message) {
        return _classifyErrorFromMessage(data.message);
      }
    }
    // 从 error.message 解析
    if (error.message) {
      return _classifyErrorFromMessage(error.message);
    }
  } catch (e) {
    // 解析失败
  }
  
  return { type: 'unknown', title: '请求失败', detail: String(error) };
}

function _classifyErrorFromMessage(msg) {
  const msgLower = msg.toLowerCase();
  
  if (msgLower.includes('429') || msgLower.includes('rate_limit')) {
    return { type: 'api_error', category: '429', title: '请求过于频繁', detail: '已触发限流，将自动重试' };
  }
  if (msgLower.includes('timeout')) {
    return { type: 'api_error', category: 'timeout', title: '请求超时', detail: '请求超时，将自动重试' };
  }
  if (msgLower.includes('503') || msgLower.includes('overload')) {
    return { type: 'api_error', category: '503', title: '服务不可用', detail: '服务器过载，将自动重试' };
  }
  if (msgLower.includes('connection')) {
    return { type: 'api_error', category: 'connection', title: '网络错误', detail: '网络连接问题，将自动重试' };
  }
  if (msgLower.includes('401') || msgLower.includes('unauthorized') || msgLower.includes('api key')) {
    return { type: 'api_error', category: '401', title: '认证失败', detail: 'API Key 无效' };
  }
  if (msgLower.includes('402') || msgLower.includes('quota') || msgLower.includes('balance')) {
    return { type: 'api_error', category: '402', title: '余额不足', detail: '账户余额不足' };
  }
  if (msgLower.includes('context') || msgLower.includes('length')) {
    return { type: 'api_error', category: 'context_length', title: '对话过长', detail: '上下文超出限制' };
  }
  
  return { type: 'api_error', category: 'unknown', title: '请求失败', detail: msg };
}

function displayErrorMessage(sessionId, errorInfo) {
  const msg = getStreamingMessageEl(sessionId);
  if (!msg) return;
  
  const bubble = msg.querySelector('.message-bubble');
  if (!bubble) return;
  
  // 如果已经显示了可重试错误，替换为最终错误
  bubble.innerHTML = renderErrorMessage(errorInfo);
  
  // 保存到 session
  addMessageToSession('', 'agent', '', {}, sessionId);
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (session && session.messages.length > 0) {
    session.messages[session.messages.length - 1].error = errorInfo;
    saveSessions(sessions);
  }
}
```

#### ③ 修改 onAgentResponse 处理 error 事件

```javascript
// 在 onAgentResponse 中添加自动重试逻辑

window.api.onAgentResponse((data) => {
  const sessionId = data.sessionId || '';
  
  switch (data.event) {
    // ... 其他事件处理 ...
    
    case 'error': {
      removePromptOverlay(sessionId);
      
      // 解析错误信息
      let errorInfo;
      if (typeof data.data === 'object' && data.data.type === 'api_error') {
        errorInfo = data.data;
      } else {
        errorInfo = _classifyErrorFromMessage(String(data.data));
        errorInfo.retryable = isRetryableError(errorInfo);
      }
      
      // 检查是否应该自动重试
      if (errorInfo.retryable && !retryState.isRetrying) {
        // 获取用户发送的最后一条消息
        const sessions = loadSessions();
        const session = sessions[sessionId];
        let lastUserMessage = null;
        
        if (session && session.messages) {
          for (let i = session.messages.length - 1; i >= 0; i--) {
            if (session.messages[i].sender === 'user') {
              lastUserMessage = session.messages[i].text;
              break;
            }
          }
        }
        
        if (lastUserMessage) {
          // 启动自动重试
          retryState.sessionId = sessionId;
          retryState.messageText = lastUserMessage;
          retryState.retryCount = 0;
          
          // 显示初始错误，然后开始重试
          finalizeStreamingMessage(sessionId, errorInfo);
          scheduleRetry(errorInfo);
          return;
        }
      }
      
      // 不可重试或已达最大重试次数，正常显示错误
      finalizeStreamingMessage(sessionId, errorInfo);
      
      if (sessionId === currentSessionId) {
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
      }
      break;
    }
    
    case 'complete': {
      // 取消任何进行中的重试
      if (retryState.sessionId === sessionId) {
        cancelRetry();
      }
      
      removePromptOverlay(sessionId);
      finalizeStreamingMessage(sessionId);
      
      if (sessionId === currentSessionId) {
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
      }
      break;
    }
  }
});
```

#### ④ 发送消息时取消重试

```javascript
// 当用户发送新消息时，取消任何进行中的重试
async function sendMessage() {
  // 取消重试
  cancelRetry();
  
  // ... 原有发送逻辑 ...
}
```

### 7.3 UI 反馈

重试过程中显示以下 UI：

```
┌─────────────────────────────────────────────┐
│ 🔄 第 2/3 次重试，将在 3秒 后自动发送...     │
│    [━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░]         │
│    [取消重试]                                │
└─────────────────────────────────────────────┘
```

成功后移除提示，正常显示回复。

重试用尽后，显示最终错误：

```
┌─────────────────────────────────────────────┐
│ ⏳ 请求过于频繁                              │
│                                             │
│ 已触发限流，请稍后重试                       │
│                                             │
│ 原始错误信息：                               │
│ │ rate_limit_exceeded: ...                  │
│                                             │
│ [重试]                                      │
└─────────────────────────────────────────────┘
```

### 7.4 添加 CSS 动画

```css
/* styles.css */

.retry-notice {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 8px 0;
}

.retry-notice .notice-icon {
  font-size: 16px;
  margin-right: 8px;
}

.retry-notice .notice-text {
  color: #92400e;
  font-size: 13px;
}

.retry-notice .notice-cancel {
  float: right;
  background: none;
  border: none;
  color: #92400e;
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
}

.retry-notice .notice-cancel:hover {
  color: #78350f;
}

.retry-countdown {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  color: #666;
}

.retry-countdown .countdown-icon {
  font-size: 14px;
}

@keyframes retry-progress {
  from { width: 100%; }
  to { width: 0%; }
}

.retry-countdown .countdown-progress {
  height: 4px;
  background: #3b82f6;
  border-radius: 2px;
  flex: 1;
}
```

### 7.5 注意事项

1. **用户取消**：用户可以随时点击"取消重试"终止自动重试
2. **新消息取消**：用户发送新消息时，自动取消之前的重试
3. **切换 Session**：切换到其他 Session 时，取消当前 Session 的重试
4. **Session 隔离**：每个 Session 独立管理重试状态
5. **最大重试保护**：最多重试 3 次，避免无限循环
6. **日志记录**：重试开始、成功、失败时记录日志

