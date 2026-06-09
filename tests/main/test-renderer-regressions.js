const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const appJs = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

describe('renderer regressions', () => {
  test('session title tooltip is cleaned when the session list re-renders', () => {
    assert.match(appJs, /function\s+hideSessionTitleTooltip\s*\(/);
    assert.match(appJs, /function\s+showSessionTitleTooltip\s*\(/);

    const renderSessionListBody = appJs.match(/function\s+renderSessionList\s*\(\)\s*\{([\s\S]*?)sessionList\.querySelectorAll\('\.session-item'\)/);
    assert.ok(renderSessionListBody, 'renderSessionList body should be findable');
    assert.match(renderSessionListBody[1], /hideSessionTitleTooltip\s*\(\s*\)/);
  });

  test('chat bubbles force long links to wrap inside the bubble', () => {
    const bubbleRule = stylesCss.match(/\.message-bubble\s*\{([\s\S]*?)\}/);
    assert.ok(bubbleRule, '.message-bubble rule should exist');
    assert.match(bubbleRule[1], /overflow-wrap\s*:\s*anywhere/);

    const linkRule = stylesCss.match(/\.message-bubble\s+a\s*\{([\s\S]*?)\}/);
    assert.ok(linkRule, '.message-bubble a rule should exist');
    assert.match(linkRule[1], /overflow-wrap\s*:\s*anywhere/);
    assert.match(linkRule[1], /word-break\s*:\s*break-word/);
  });

  test('logs page exposes filtering, search, export, and count controls', () => {
    assert.match(indexHtml, /id="log-level-filter"/);
    assert.match(indexHtml, /id="log-search"/);
    assert.match(indexHtml, /id="export-logs"/);
    assert.match(indexHtml, /id="log-counts"/);

    assert.match(appJs, /function\s+renderLogs\s*\(/);
    assert.match(appJs, /filterLogEntries\s*\(/);
    assert.match(appJs, /formatLogExport\s*\(/);

    assert.match(stylesCss, /\.log-line\.error/);
    assert.match(stylesCss, /\.log-line\.warn/);
    assert.match(stylesCss, /\.log-line\.debug/);
  });
});
