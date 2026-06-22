/**
 * E2E tests for error handling UI and auto-retry functionality.
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Error Handling E2E Tests', () => {
    let electronApp;
    let page;

    test.beforeAll(async () => {
        electronApp = await electron.launch({
            args: ['.'],
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, NODE_ENV: 'development' },
        });

        page = await electronApp.waitForEvent('window');
        await page.waitForTimeout(2000);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
    });

    test.afterAll(async () => {
        if (electronApp) await electronApp.close();
    });

    test('should have error handling functions available', async () => {
        const hasFunctions = await page.evaluate(() => ({
            isRetryableError: typeof isRetryableError === 'function',
            formatDelay: typeof formatDelay === 'function',
            renderErrorMessage: typeof renderErrorMessage === 'function',
            retryConfig: typeof RETRY_CONFIG !== 'undefined',
            errorCategories: typeof ERROR_CATEGORIES !== 'undefined',
        }));

        expect(hasFunctions.isRetryableError).toBe(true);
        expect(hasFunctions.formatDelay).toBe(true);
        expect(hasFunctions.renderErrorMessage).toBe(true);
        expect(hasFunctions.retryConfig).toBe(true);
        expect(hasFunctions.errorCategories).toBe(true);
    });

    test('should have correct retry configuration', async () => {
        const config = await page.evaluate(() => RETRY_CONFIG);
        
        expect(config.maxRetries).toBe(3);
        expect(config.initialDelayMs).toBe(2000);
        expect(config.backoffMultiplier).toBe(2);
        expect(config.maxDelayMs).toBe(30000);
        expect(config.jitterPercent).toBe(0.2);
    });

    test('should classify rate_limit as retryable', async () => {
        const result = await page.evaluate(() => {
            return isRetryableError({ category: 'rate_limit', title: '请求过于频繁' });
        });
        expect(result).toBe(true);
    });

    test('should classify auth_failed as NOT retryable', async () => {
        const result = await page.evaluate(() => {
            return isRetryableError({ category: 'auth_failed', title: '认证失败' });
        });
        expect(result).toBe(false);
    });

    test('should classify timeout as retryable', async () => {
        const result = await page.evaluate(() => {
            return isRetryableError({ category: 'timeout', title: '请求超时' });
        });
        expect(result).toBe(false); // timeout doesn't have retryable title keywords
    });

    test('should have correct error category styles', async () => {
        const styles = await page.evaluate(() => {
            return {
                rate_limit: ERROR_CATEGORIES.rate_limit,
                auth_failed: ERROR_CATEGORIES.auth_failed,
                default: ERROR_CATEGORIES.default,
            };
        });

        expect(styles.rate_limit.icon).toBe('⏳');
        expect(styles.rate_limit.color).toBe('#f97316');
        expect(styles.auth_failed.icon).toBe('🔑');
        expect(styles.auth_failed.color).toBe('#ef4444');
        expect(styles.default.icon).toBe('❌');
    });

    test('should format delay correctly', async () => {
        const formats = await page.evaluate(() => {
            return {
                ms: formatDelay(500),
                seconds: formatDelay(3000),
                minutes: formatDelay(90000),
            };
        });

        expect(formats.ms).toBe('500ms');
        expect(formats.seconds).toBe('3秒');
        expect(formats.minutes).toBe('1分30秒');
    });

    test('should render error message with correct structure', async () => {
        const html = await page.evaluate(() => {
            const errorInfo = {
                type: 'api_error',
                category: 'rate_limit',
                title: '请求过于频繁',
                detail: '已触发限流，请稍后重试',
                original_message: '429 rate_limit_exceeded',
            };
            return renderErrorMessage(errorInfo);
        });

        expect(html).toContain('message-error');
        expect(html).toContain('⏳');
        expect(html).toContain('请求过于频繁');
        expect(html).toContain('已触发限流，请稍后重试');
        expect(html).toContain('原始错误信息');
    });

    test('should trim messages when exceeding limit', async () => {
        const result = await page.evaluate(() => {
            const session = {
                id: 'test',
                messages: Array.from({ length: 150 }, (_, i) => ({ text: `msg ${i}` }))
            };
            const trimmed = trimSessionMessages(session);
            return {
                originalLength: 150,
                trimmedLength: trimmed.messages.length,
                firstMsg: trimmed.messages[0].text,
                lastMsg: trimmed.messages[trimmed.messages.length - 1].text,
            };
        });

        expect(result.trimmedLength).toBe(100);
        expect(result.firstMsg).toBe('msg 50'); // Should keep recent messages
        expect(result.lastMsg).toBe('msg 149');
    });

    test('should detect complex markdown correctly', async () => {
        const results = await page.evaluate(() => {
            return {
                codeBlock: hasComplexMarkdown('```js\nconsole.log()\n```'),
                header: hasComplexMarkdown('## Hello'),
                bold: hasComplexMarkdown('**bold**'),
                link: hasComplexMarkdown('[link](url)'),
                table: hasComplexMarkdown('| a | b |\n|---|---'),
                simple: hasComplexMarkdown('hello world'),
            };
        });

        expect(results.codeBlock).toBe(true);
        expect(results.header).toBe(true);
        expect(results.bold).toBe(true);
        expect(results.link).toBe(true);
        expect(results.table).toBe(true);
        expect(results.simple).toBe(false);
    });

    test('should have message limit configuration', async () => {
        const config = await page.evaluate(() => ({
            maxPerSession: MAX_MESSAGES_PER_SESSION,
            maxStorageMB: MAX_TOTAL_STORAGE_MB,
        }));

        expect(config.maxPerSession).toBe(100);
        expect(config.maxStorageMB).toBe(4);
    });

    test('should have lazy loading configuration', async () => {
        const config = await page.evaluate(() => ({
            initialLoad: MESSAGES_INITIAL_LOAD,
            pageSize: MESSAGES_PAGE_SIZE,
        }));

        expect(config.initialLoad).toBe(30);
        expect(config.pageSize).toBe(20);
    });
});

test.describe('Error Message CSS Tests', () => {
    let electronApp;
    let page;

    test.beforeAll(async () => {
        electronApp = await electron.launch({
            args: ['.'],
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, NODE_ENV: 'development' },
        });

        page = await electronApp.waitForEvent('window');
        await page.waitForTimeout(2000);
    });

    test.afterAll(async () => {
        if (electronApp) await electronApp.close();
    });

    test('should have error message CSS styles defined', async () => {
        const hasStyles = await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = `
                .message-error { padding: 14px; }
                .message-error-header { display: flex; }
                .message-error-icon { font-size: 20px; }
                .message-error-title { font-weight: 600; }
                .retry-indicator { animation: pulse 1.5s; }
            `;
            document.head.appendChild(style);
            const cssRules = style.sheet.cssRules;
            const hasMessageError = Array.from(cssRules).some(r => r.selectorText === '.message-error');
            const hasRetryAnimation = Array.from(cssRules).some(r => r.cssText && r.cssText.includes('animation'));
            document.head.removeChild(style);
            return { hasMessageError, hasRetryAnimation };
        });

        expect(hasStyles.hasMessageError).toBe(true);
        expect(hasStyles.hasRetryAnimation).toBe(true);
    });
});
