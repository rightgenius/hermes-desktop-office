const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf-8');
const stylesCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf-8');
const appJs = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf-8');

describe('Cron modal — UI structure (cron-schedule-editing-spec)', () => {
  test('modal width is fluid to fit long prompts', () => {
    // min(860px, calc(100vw - 48px)) — wide on desktop, no overflow on narrow.
    assert.match(stylesCss, /\.cron-modal\s*\{[^}]*width:\s*min\(860px,\s*calc\(100vw\s*-\s*48px\)\)/);
    // max-height keeps the modal on-screen; body scrolls.
    assert.match(stylesCss, /\.cron-modal\s*\{[^}]*max-height:/);
  });

  test('modal body grows, footer stays visible (flex layout)', () => {
    assert.match(stylesCss, /\.cron-modal\s+\.modal-body\s*\{[^}]*flex:\s*1 1 auto/);
    assert.match(stylesCss, /\.cron-modal\s+\.modal-body\s*\{[^}]*min-height:\s*0/);
    assert.match(stylesCss, /\.cron-modal\s+\.modal-footer\s*\{[^}]*flex:\s*0 0 auto/);
  });

  test('prompt textarea fills modal width and has min-height', () => {
    assert.match(stylesCss, /#cron-prompt\s*\{[^}]*width:\s*100%/);
    assert.match(stylesCss, /#cron-prompt\s*\{[^}]*box-sizing:\s*border-box/);
    assert.match(stylesCss, /#cron-prompt\s*\{[^}]*min-height:\s*220px/);
    assert.match(stylesCss, /#cron-prompt\s*\{[^}]*resize:\s*vertical/);
  });

  test('prompt textarea uses dark theme variables, no system white', () => {
    // The textarea should be styled with --bg-secondary / --text-primary,
    // not a browser-default white background.
    const promptRule = stylesCss.match(/#cron-prompt\s*\{([^}]*)\}/);
    assert.ok(promptRule, '#cron-prompt rule must exist');
    assert.match(promptRule[1], /background:\s*var\(--bg-secondary/);
    assert.match(promptRule[1], /color:\s*var\(--text-primary/);
  });

  test('schedule type radios render on one line at desktop width', () => {
    assert.match(stylesCss, /\.cron-schedule-type\s*\{[^}]*display:\s*flex/);
    assert.match(stylesCss, /\.cron-schedule-type\s*\{[^}]*flex-wrap:\s*nowrap/);
  });

  test('schedule type labels do not wrap mid-text', () => {
    assert.match(stylesCss, /\.cron-schedule-type\s+label\s*\{[^}]*white-space:\s*nowrap/);
  });

  test('schedule type narrow-window fallback allows wrap', () => {
    // @media (max-width: 720px) — .cron-schedule-type { flex-wrap: wrap; }
    assert.match(stylesCss, /@media\s*\(max-width:\s*720px\)/);
    assert.match(
      stylesCss,
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.cron-schedule-type\s*\{[^}]*flex-wrap:\s*wrap/,
    );
  });

  test('auto-authorize renders as 3-column grid at desktop', () => {
    assert.match(
      stylesCss,
      /\.cron-auto-authorize\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
  });

  test('auto-authorize cards: full clickable area + clear selected state', () => {
    // The label wraps the input AND the description text — a single clickable
    // block. Selected state is highlighted via :has(:checked) + --accent.
    assert.match(
      stylesCss,
      /\.cron-auto-authorize\s+label:has\(input\[type="radio"\]:checked\)\s*\{[^}]*border-color:\s*var\(--accent\)/,
    );
    assert.match(
      stylesCss,
      /\.cron-auto-authorize\s+label:has\(input\[type="radio"\]:checked\)\s*\{[^}]*background:\s*var\(--accent-soft/,
    );
  });

  test('auto-authorize cards collapse to single column on narrow viewports', () => {
    assert.match(
      stylesCss,
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.cron-auto-authorize\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
  });

  test('auto-authorize HTML uses .cron-auth-desc wrapper for descriptions', () => {
    // We refactored the labels so the description is a separate span, allowing
    // the card layout to control its typography.
    assert.match(indexHtml, /class="cron-auth-desc"/);
  });

  test('recurring checkbox label is inline with the text', () => {
    // Old: text and checkbox were in different lines on narrow widths.
    // New: .cron-recurring-label { display: inline-flex; gap; ... }
    const rule = stylesCss.match(/\.cron-recurring-label\s*\{([^}]*)\}/);
    assert.ok(rule);
    assert.match(rule[1], /display:\s*inline-flex/);
    assert.match(rule[1], /align-items:\s*center/);
  });
});

describe('Cron modal — renderer logic (cron-schedule-editing-spec)', () => {
  test('editCronJob calls prefillCronScheduleForm to fill schedule controls', () => {
    assert.match(
      appJs,
      /function\s+editCronJob\([^)]*\)\s*\{[\s\S]*?prefillCronScheduleForm\(/,
      'editCronJob must prefill schedule controls BEFORE opening the modal',
    );
  });

  test('prefillCronScheduleForm handles all three schedule kinds', () => {
    assert.match(appJs, /function\s+prefillCronScheduleForm\([^)]*\)\s*\{/);
    assert.match(appJs, /prefillCronScheduleForm[\s\S]*?sched\.kind\s*===\s*['"]interval['"]/);
    assert.match(appJs, /prefillCronScheduleForm[\s\S]*?sched\.kind\s*===\s*['"]cron['"]/);
    assert.match(appJs, /prefillCronScheduleForm[\s\S]*?sched\.kind\s*===\s*['"]once['"]/);
  });

  test('prefillCronScheduleForm handles legacy string schedule (e.g. "every 10m")', () => {
    const fn = appJs.match(/function\s+prefillCronScheduleForm[\s\S]*?\n\}/);
    assert.ok(fn);
    assert.match(fn[0], /typeof\s+sched\s*===\s*['"]string['"]/);
  });

  test('saveCronJob always reads the schedule from the form (which is pre-filled on edit)', () => {
    // spec: "保存编辑时, 表单控件已经由 prefillCronScheduleForm() 回填了原值;
    //        用户改动表单后保存, 必须把新值提交给 main process, 不能绕过表单
    //        透传旧值 (历史 bug: 编辑改时间不生效)."
    const saveFn = appJs.match(/async\s+function\s+saveCronJob\(\)\s*\{[\s\S]*?\n\}/);
    assert.ok(saveFn);
    // Always call getCronScheduleInput() — no edit-mode branch that bypasses
    // the form by re-sending job._parsedSchedule / job.schedule.
    assert.match(saveFn[0], /getCronScheduleInput\(\)/);
    assert.doesNotMatch(
      saveFn[0],
      /job\s*&&\s*\(\s*job\._parsedSchedule\s*\|\|\s*job\.schedule\s*\)/,
      'saveCronJob must not bypass the form on edit (it discards user changes)',
    );
    // Must NOT send schedule_display anymore (the main process owns the
    // canonical display field, derived from the structured schedule).
    assert.doesNotMatch(saveFn[0], /schedule_display\s*:/);
  });

  test('getCronScheduleInput is the form-read helper (renamed from getCronSchedule)', () => {
    assert.match(appJs, /function\s+getCronScheduleInput\(\)/);
    // Legacy name should not exist anymore to avoid drift.
    assert.doesNotMatch(appJs, /function\s+getCronSchedule\(\)/);
  });

  test('closeCronModal resets the form back to "new task" defaults', () => {
    const closeFn = appJs.match(/function\s+closeCronModal\(\)\s*\{[\s\S]*?\n\}/);
    assert.ok(closeFn);
    assert.match(closeFn[0], /setCronScheduleType\(['"]interval['"]\)/);
    assert.match(closeFn[0], /scheduleValue\.value\s*=\s*30/);
  });
});
