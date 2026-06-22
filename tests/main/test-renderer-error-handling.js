/**
 * Unit tests for renderer error handling and retry logic.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Mock browser globals for testing
const mockStreamingSessions = {};
const mockChatMessages = {
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 500,
    querySelector: (selector) => null,
    appendChild: () => {},
    insertBefore: () => {},
};
let mockCurrentSessionId = null;
let mockRetryState = {
    sessionId: null,
    messageText: null,
    retryCount: 0,
    isRetrying: false,
    timeoutId: null,
};

const pendingRenders = new Map();
const RENDER_DEBOUNCE_MS = 100;
const MAX_MESSAGES_PER_SESSION = 100;
const MAX_TOTAL_STORAGE_MB = 4;

// Error categories config
const ERROR_CATEGORIES = {
    'auth_failed': { icon: '🔑', color: '#ef4444' },
    'rate_limit': { icon: '⏳', color: '#f97316' },
    'timeout': { icon: '🌐', color: '#3b82f6' },
    'service_unavailable': { icon: '⚠️', color: '#eab308' },
    'insufficient_quota': { icon: '💰', color: '#ec4899' },
    'default': { icon: '❌', color: '#6b7280' },
};

const RETRYABLE_CATEGORIES = new Set([
    'rate_limit', 'timeout', 'connection', 'network', 'proxy',
    'service_unavailable', 'service_overloaded', 'gateway_error', 'gateway_timeout',
]);

const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterPercent: 0.2,
};

// Helper functions (copied from app.js logic)
function isRetryableError(errorInfo) {
    if (!errorInfo) return false;
    const category = errorInfo.category || '';
    if (RETRYABLE_CATEGORIES.has(category)) return true;
    const title = errorInfo.title || '';
    return ['限流', '超时', '服务', '过载', '网络', '网关'].some(kw => title.includes(kw));
}

function calculateDelay(attempt) {
    let delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
    const jitter = delay * RETRY_CONFIG.jitterPercent;
    delay += (Math.random() * 2 - 1) * jitter;
    return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

function formatDelay(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
}

function trimSessionMessages(session) {
    if (!session || !session.messages) return session;
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
        session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    }
    return session;
}

function hasComplexMarkdown(text) {
    return /```[\s\S]*?```|\*\*|#{1,3}\s|\[.*?\]\(.*?\)|^\|/m.test(text);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getErrorStyle(errorInfo) {
    const category = errorInfo?.category || 'default';
    return ERROR_CATEGORIES[category] || ERROR_CATEGORIES['default'];
}

// Tests
describe('Error Classification', () => {
    test('rate_limit error should be retryable', () => {
        const error = { category: 'rate_limit', title: '请求过于频繁' };
        assert.strictEqual(isRetryableError(error), true);
    });

    test('timeout error should be retryable', () => {
        const error = { category: 'timeout', title: '请求超时' };
        assert.strictEqual(isRetryableError(error), true);
    });

    test('auth_failed error should NOT be retryable', () => {
        const error = { category: 'auth_failed', title: '认证失败' };
        assert.strictEqual(isRetryableError(error), false);
    });

    test('insufficient_quota error should NOT be retryable', () => {
        const error = { category: 'insufficient_quota', title: '余额不足' };
        assert.strictEqual(isRetryableError(error), false);
    });

    test('context_length error should NOT be retryable', () => {
        const error = { category: 'context_length', title: '对话过长' };
        assert.strictEqual(isRetryableError(error), false);
    });

    test('service_unavailable error should be retryable', () => {
        const error = { category: 'service_unavailable', title: '服务不可用' };
        assert.strictEqual(isRetryableError(error), true);
    });

    test('error with retryable title should be retryable', () => {
        const error = { category: 'unknown', title: '请求超时，请稍后重试' };
        assert.strictEqual(isRetryableError(error), true);
    });

    test('null error should not be retryable', () => {
        assert.strictEqual(isRetryableError(null), false);
        assert.strictEqual(isRetryableError(undefined), false);
    });
});

describe('Retry Delay Calculation', () => {
    test('first retry should use initial delay', () => {
        const delay = calculateDelay(0);
        // Should be around 2000ms ± 20% = 1600-2400ms
        assert.ok(delay >= 1600 && delay <= 2400, `Expected 1600-2400, got ${delay}`);
    });

    test('second retry should use exponential backoff', () => {
        const delay = calculateDelay(1);
        // Should be around 4000ms ± 20% = 3200-4800ms
        assert.ok(delay >= 3200 && delay <= 4800, `Expected 3200-4800, got ${delay}`);
    });

    test('third retry should use exponential backoff', () => {
        const delay = calculateDelay(2);
        // Should be around 8000ms ± 20% = 6400-9600ms
        assert.ok(delay >= 6400 && delay <= 9600, `Expected 6400-9600, got ${delay}`);
    });

    test('delay should not exceed max', () => {
        const delay = calculateDelay(10); // Very high attempt
        assert.ok(delay <= RETRY_CONFIG.maxDelayMs, `Expected <= ${RETRY_CONFIG.maxDelayMs}, got ${delay}`);
    });
});

describe('Delay Formatting', () => {
    test('format milliseconds', () => {
        assert.strictEqual(formatDelay(500), '500ms');
        assert.strictEqual(formatDelay(999), '999ms');
    });

    test('format seconds', () => {
        assert.strictEqual(formatDelay(1000), '1秒');
        assert.strictEqual(formatDelay(30000), '30秒');
    });

    test('format minutes', () => {
        assert.strictEqual(formatDelay(60000), '1分0秒');
        assert.strictEqual(formatDelay(90000), '1分30秒');
        assert.strictEqual(formatDelay(120000), '2分0秒');
    });
});

describe('Message Trimming', () => {
    test('should trim messages exceeding MAX_MESSAGES_PER_SESSION', () => {
        const session = {
            id: 'test',
            messages: Array.from({ length: 150 }, (_, i) => ({ text: `msg ${i}` }))
        };
        
        const trimmed = trimSessionMessages(session);
        
        assert.strictEqual(trimmed.messages.length, MAX_MESSAGES_PER_SESSION);
        // Should keep the most recent messages
        assert.strictEqual(trimmed.messages[0].text, 'msg 50');
        assert.strictEqual(trimmed.messages[99].text, 'msg 149');
    });

    test('should not trim messages under limit', () => {
        const session = {
            id: 'test',
            messages: Array.from({ length: 50 }, (_, i) => ({ text: `msg ${i}` }))
        };
        
        const trimmed = trimSessionMessages(session);
        
        assert.strictEqual(trimmed.messages.length, 50);
    });

    test('should handle empty session', () => {
        const session = { id: 'test', messages: [] };
        const trimmed = trimSessionMessages(session);
        assert.deepStrictEqual(trimmed, session);
    });

    test('should handle null session', () => {
        const trimmed = trimSessionMessages(null);
        assert.strictEqual(trimmed, null);
    });
});

describe('Markdown Complexity Detection', () => {
    test('should detect code blocks', () => {
        assert.strictEqual(hasComplexMarkdown('```js\nconsole.log()\n```'), true);
    });

    test('should detect headers', () => {
        assert.strictEqual(hasComplexMarkdown('## Hello World'), true);
        assert.strictEqual(hasComplexMarkdown('### Subtitle'), true);
    });

    test('should detect bold text', () => {
        assert.strictEqual(hasComplexMarkdown('**bold text**'), true);
    });

    test('should detect links', () => {
        assert.strictEqual(hasComplexMarkdown('[link](http://example.com)'), true);
    });

    test('should detect tables', () => {
        assert.strictEqual(hasComplexMarkdown('| col1 | col2 |\n|------|------|'), true);
    });

    test('should not flag simple text', () => {
        assert.strictEqual(hasComplexMarkdown('hello world'), false);
        assert.strictEqual(hasComplexMarkdown('just some plain text'), false);
    });
});

describe('HTML Escaping', () => {
    test('should escape HTML special characters', () => {
        assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
        assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
        assert.strictEqual(escapeHtml('"quotes"'), '&quot;quotes&quot;');
    });

    test('should handle empty and null', () => {
        assert.strictEqual(escapeHtml(''), '');
        assert.strictEqual(escapeHtml(null), '');
        assert.strictEqual(escapeHtml(undefined), '');
    });
});

describe('Error Style Resolution', () => {
    test('should return correct style for rate_limit', () => {
        const style = getErrorStyle({ category: 'rate_limit' });
        assert.strictEqual(style.icon, '⏳');
        assert.strictEqual(style.color, '#f97316');
    });

    test('should return correct style for auth_failed', () => {
        const style = getErrorStyle({ category: 'auth_failed' });
        assert.strictEqual(style.icon, '🔑');
        assert.strictEqual(style.color, '#ef4444');
    });

    test('should return default style for unknown category', () => {
        const style = getErrorStyle({ category: 'unknown' });
        assert.strictEqual(style.icon, '❌');
    });

    test('should return default style for null', () => {
        const style = getErrorStyle(null);
        assert.strictEqual(style.icon, '❌');
    });
});

describe('Retry Configuration', () => {
    test('max retries should be 3', () => {
        assert.strictEqual(RETRY_CONFIG.maxRetries, 3);
    });

    test('initial delay should be 2 seconds', () => {
        assert.strictEqual(RETRY_CONFIG.initialDelayMs, 2000);
    });

    test('backoff multiplier should be 2', () => {
        assert.strictEqual(RETRY_CONFIG.backoffMultiplier, 2);
    });

    test('max delay should be 30 seconds', () => {
        assert.strictEqual(RETRY_CONFIG.maxDelayMs, 30000);
    });
});

describe('Retryable Categories', () => {
    test('should include rate_limit', () => {
        assert.ok(RETRYABLE_CATEGORIES.has('rate_limit'));
    });

    test('should include timeout', () => {
        assert.ok(RETRYABLE_CATEGORIES.has('timeout'));
    });

    test('should include connection errors', () => {
        assert.ok(RETRYABLE_CATEGORIES.has('connection'));
    });

    test('should include service errors', () => {
        assert.ok(RETRYABLE_CATEGORIES.has('service_unavailable'));
        assert.ok(RETRYABLE_CATEGORIES.has('service_overloaded'));
    });

    test('should include gateway errors', () => {
        assert.ok(RETRYABLE_CATEGORIES.has('gateway_error'));
        assert.ok(RETRYABLE_CATEGORIES.has('gateway_timeout'));
    });

    test('should NOT include auth errors', () => {
        assert.ok(!RETRYABLE_CATEGORIES.has('auth_failed'));
    });

    test('should NOT include quota errors', () => {
        assert.ok(!RETRYABLE_CATEGORIES.has('insufficient_quota'));
    });
});

console.log('Running error handling unit tests...');
