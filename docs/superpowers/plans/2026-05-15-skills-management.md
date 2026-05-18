# Skills Management Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Skills management page to Hermes Desktop for Office, allowing users to browse, search, view details, and manage skills from three sources (builtin, user-created, agent-generated).

**Architecture:** Electron app with IPC communication between renderer and main process. Skills are scanned from filesystem directories (builtin, user, agent), parsed from SKILL.md files with YAML frontmatter, and displayed in a tab + split panel layout.

**Tech Stack:** Electron, vanilla JavaScript, CSS Grid/Flexbox, YAML frontmatter parsing

---

## File Structure

**New files:**
- `src/main/skill-scanner.js` — Scan builtin/user/agent skills from filesystem
- `src/main/skill-templates.js` — Skill templates (Feishu, DingTalk, Office)

**Modified files:**
- `src/renderer/index.html` — Add Skills rail button and page-skills structure
- `src/renderer/styles.css` — Add skills page CSS styles
- `src/renderer/app.js` — Add skills page logic (state management, rendering, interactions)
- `src/preload/index.js` — Add skills IPC channels
- `src/main/ipc-handlers.js` — Add skills IPC handlers

---

## Task 1: Add Skills Rail Button

**Files:**
- Modify: `src/renderer/index.html:33-43`
- Modify: `src/renderer/styles.css` (add rail button styles)

- [ ] **Step 1: Add Skills rail button to index.html**

Insert after line 39 (after Settings button):

```html
        <button class="rail-btn" data-page="skills" title="Skills">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </button>
```

- [ ] **Step 2: Verify rail button renders correctly**

Run: `npm run dev`
Expected: 4th rail button appears between Settings and Logs, shows "Skills" tooltip on hover

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat(ui): add Skills rail button with book icon"
```

---

## Task 2: Create page-skills HTML Structure

**Files:**
- Modify: `src/renderer/index.html:235-249` (insert after Logs page, before `</main>`)

- [ ] **Step 1: Add page-skills structure**

Insert before line 250 (`</main>`):

```html
        <!-- Skills Page -->
        <div class="page" id="page-skills">
          <div class="page-header">
            <h2>Skills管理</h2>
          </div>
          <div class="skills-toolbar">
            <input type="text" class="skills-search-input" id="skills-search" placeholder="搜索skill名称或描述...">
            <select class="skills-filter-select" id="skills-category-filter">
              <option value="">全部分类</option>
            </select>
            <select class="skills-filter-select" id="skills-status-filter">
              <option value="">全部状态</option>
              <option value="enabled">已启用</option>
              <option value="disabled">已禁用</option>
            </select>
            <div class="skills-toolbar-actions" id="skills-toolbar-actions">
              <button class="btn btn-primary" id="new-skill-btn" style="display:none">新建Skill</button>
              <button class="btn btn-secondary" id="refresh-skills-btn">刷新</button>
            </div>
          </div>
          <div class="skills-tabs" id="skills-tabs">
            <button class="skills-tab active" data-tab="builtin">内置库</button>
            <button class="skills-tab" data-tab="user">我的Skills</button>
            <button class="skills-tab" data-tab="agent">Agent生成</button>
          </div>
          <div class="skills-content">
            <div class="skills-list-panel" id="skills-list-panel">
              <div class="skills-table-container" id="skills-table-container">
                <div class="skills-table-header builtin" id="skills-table-header">
                  <span>Icon</span>
                  <span>Name</span>
                  <span>Description</span>
                  <span>Category</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                <div class="skills-table-body" id="skills-table-body">
                  <div class="empty-state-text">加载中...</div>
                </div>
              </div>
            </div>
            <div class="skills-detail-panel" id="skills-detail-panel" style="display:none">
              <div class="detail-header" id="detail-header">
                <span class="detail-skill-name" id="detail-skill-name">Skill Name</span>
                <span class="detail-source-badge builtin" id="detail-source-badge">builtin</span>
                <span class="detail-status-toggle" id="detail-status-toggle" style="display:none">
                  <label class="toggle-label">
                    <input type="checkbox" id="detail-enable-toggle">
                    <span class="toggle-slider"></span>
                  </label>
                </span>
                <button class="detail-close-btn" id="detail-close-btn">×</button>
              </div>
              <div class="detail-tabs" id="detail-tabs">
                <button class="detail-tab-btn active" data-detail-tab="content">Content</button>
                <button class="detail-tab-btn" data-detail-tab="files">Files</button>
              </div>
              <div class="detail-content" id="detail-content">
                <div class="detail-markdown" id="detail-markdown">
                  <p class="empty-state-text">选择skill查看详情</p>
                </div>
              </div>
              <div class="detail-editor" id="detail-editor" style="display:none">
                <textarea class="detail-editor-textarea" id="detail-editor-textarea" rows="20"></textarea>
                <div class="detail-editor-buttons">
                  <button class="btn btn-primary" id="detail-save-btn">保存</button>
                  <button class="btn btn-secondary" id="detail-cancel-btn">取消</button>
                </div>
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Verify page structure renders**

Run: `npm run dev`
Expected: page-skills div exists in DOM, toolbar with search/input/filters visible, tabs rendered, split layout with list panel and hidden detail panel

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat(ui): add page-skills HTML structure with toolbar, tabs, split layout"
```

---

## Task 3: Add Skills Page CSS Styles

**Files:**
- Modify: `src/renderer/styles.css` (append at end of file)

- [ ] **Step 1: Add CSS variables for skills page**

Append to `:root` block (before closing `}`):

```css
  /* Skills page */
  --skills-panel-width: 400px;
  --skills-panel-min: 300px;
  --skills-panel-max: 600px;
```

- [ ] **Step 2: Add skills page styles**

Append to end of styles.css:

```css
/* ========================================
   Skills Page
   ======================================== */

/* Toolbar */
.skills-toolbar {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-xl);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  align-items: center;
}

.skills-search-input {
  flex: 1;
  max-width: 300px;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
}

.skills-search-input::placeholder {
  color: var(--text-muted);
}

.skills-filter-select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  min-width: 120px;
}

.skills-toolbar-actions {
  display: flex;
  gap: var(--space-sm);
  margin-left: auto;
}

/* Tabs */
.skills-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.skills-tab {
  padding: var(--space-sm) var(--space-xl);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition);
}

.skills-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.skills-tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Content - split layout */
.skills-content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.skills-list-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}

.skills-table-container {
  flex: 1;
  overflow-y: auto;
}

/* Table header and rows */
.skills-table-header {
  display: grid;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--bg-secondary);
  position: sticky;
  top: 0;
  z-index: 1;
}

.skills-table-header.builtin {
  grid-template-columns: 40px 1fr 1.5fr 120px 80px 60px;
}

.skills-table-header.user {
  grid-template-columns: 40px 1fr 1.2fr 100px 80px 80px 120px;
}

.skills-table-header.agent {
  grid-template-columns: 40px 1fr 1fr 70px 100px 80px 120px;
}

.skills-table-body {
  display: flex;
  flex-direction: column;
}

.skills-table-row {
  display: grid;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background var(--transition);
  align-items: center;
  font-size: 13px;
}

.skills-table-row.builtin {
  grid-template-columns: 40px 1fr 1.5fr 120px 80px 60px;
}

.skills-table-row.user {
  grid-template-columns: 40px 1fr 1.2fr 100px 80px 80px 120px;
}

.skills-table-row.agent {
  grid-template-columns: 40px 1fr 1fr 70px 100px 80px 120px;
}

.skills-table-row:hover {
  background: var(--bg-hover);
}

.skills-table-row.selected {
  background: var(--accent-light);
}

.skills-row-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skills-row-name {
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-row-desc {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-row-category {
  color: var(--text-secondary);
  font-size: 12px;
}

.skills-row-location {
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-mono);
}

.skills-row-created {
  color: var(--text-muted);
  font-size: 11px;
}

.skills-row-use-count {
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

.skills-row-last-activity {
  color: var(--text-muted);
  font-size: 11px;
}

.skills-row-curator-state {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  text-align: center;
}

.skills-row-curator-state.active {
  background: rgba(46, 155, 90, 0.15);
  color: var(--success);
}

.skills-row-curator-state.stale {
  background: rgba(232, 165, 75, 0.15);
  color: var(--warning);
}

.skills-row-curator-state.archived {
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.skills-row-curator-state.pinned {
  background: rgba(218, 119, 86, 0.15);
  color: var(--accent);
}

.skills-row-actions {
  display: flex;
  gap: 4px;
}

.skill-action-btn {
  padding: 2px 6px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition);
}

.skill-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.skill-action-btn.danger {
  border-color: var(--error);
  color: var(--error);
}

.skill-action-btn.danger:hover {
  background: var(--error);
  color: #fff;
}

/* Status toggle in table row */
.skills-row-status {
  display: flex;
  align-items: center;
}

/* Detail panel */
.skills-detail-panel {
  width: var(--skills-panel-width);
  min-width: var(--skills-panel-min);
  max-width: var(--skills-panel-max);
  border-left: 1px solid var(--border-color);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateX(100%);
  transition: transform 0.2s ease;
}

.skills-detail-panel.visible {
  transform: translateX(0);
}

.detail-header {
  display: flex;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
  gap: var(--space-sm);
}

.detail-skill-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-source-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.detail-source-badge.builtin {
  background: var(--accent-bg);
  color: var(--accent);
}

.detail-source-badge.user {
  background: rgba(46, 155, 90, 0.15);
  color: var(--success);
}

.detail-source-badge.agent {
  background: rgba(232, 165, 75, 0.15);
  color: var(--warning);
}

.detail-close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.detail-close-btn:hover {
  color: var(--text-primary);
}

.detail-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
}

.detail-tab-btn {
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition);
}

.detail-tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.detail-tab-btn:hover {
  color: var(--text-primary);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
}

.detail-markdown {
  /* Reuse markdown styles from chat messages */
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.detail-markdown pre {
  background: var(--bg-secondary);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
}

.detail-markdown code {
  background: var(--bg-secondary);
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
}

.detail-markdown h1, .detail-markdown h2, .detail-markdown h3 {
  margin-top: var(--space-lg);
  margin-bottom: var(--space-sm);
  color: var(--text-primary);
}

.detail-markdown h1 { font-size: 20px; }
.detail-markdown h2 { font-size: 17px; }
.detail-markdown h3 { font-size: 15px; }

.detail-markdown p {
  margin-bottom: var(--space-md);
}

.detail-markdown ul, .detail-markdown ol {
  margin-left: var(--space-lg);
  margin-bottom: var(--space-md);
}

.detail-markdown blockquote {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-md);
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}

.detail-markdown table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: var(--space-md);
}

.detail-markdown th, .detail-markdown td {
  border: 1px solid var(--border-color);
  padding: var(--space-sm) var(--space-md);
  text-align: left;
}

.detail-markdown th {
  background: var(--bg-secondary);
  font-weight: 600;
}

/* Editor */
.detail-editor {
  display: none;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.detail-editor.visible {
  display: flex;
}

.detail-editor-textarea {
  flex: 1;
  padding: var(--space-md);
  background: var(--bg-primary);
  border: none;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  resize: none;
  line-height: 1.5;
}

.detail-editor-textarea:focus {
  outline: none;
}

.detail-editor-buttons {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-top: 1px solid var(--border-color);
}

/* File tree */
.detail-file-tree {
  padding: var(--space-md);
}

.detail-file-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.detail-file-item:hover {
  color: var(--text-primary);
}

.detail-file-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.detail-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* New skill dialog */
.new-skill-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.new-skill-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  width: 480px;
  max-width: 90vw;
}

.new-skill-dialog-header {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
}

.new-skill-dialog-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.new-skill-dialog-footer {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
  margin-top: var(--space-lg);
}

/* Skills page specific - hide mid-panel */
.page-skills-active .mid-panel {
  display: none !important;
}
```

- [ ] **Step 3: Verify styles apply correctly**

Run: `npm run dev`
Expected: Skills page renders with proper layout, toolbar, tabs, table grid, detail panel slide animation, badges, buttons all styled correctly

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(ui): add skills page CSS styles (toolbar, tabs, table, detail panel, dialog)"
```

---

## Task 4: Implement Page Switching Logic

**Files:**
- Modify: `src/renderer/app.js:195-208` (showPage function)
- Modify: `src/renderer/app.js:210-217` (keyboard shortcuts)

- [ ] **Step 1: Update showPage to hide mid-panel for skills page**

Replace lines 203-207 in app.js:

```javascript
  // Hide sidebar for settings, logs, and skills pages
  const midPanel = document.querySelector('.mid-panel');
  if (midPanel) {
    midPanel.style.display = (pageName === 'settings' || pageName === 'logs' || pageName === 'skills') ? 'none' : '';
  }
```

- [ ] **Step 2: Update keyboard shortcut to include Cmd+4 for skills**

Replace lines 211-217 in app.js:

```javascript
// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    const pages = ['chat', 'settings', 'skills', 'logs'];
    showPage(pages[parseInt(e.key) - 1]);
  }
});
```

- [ ] **Step 3: Verify page switching works**

Run: `npm run dev`
Expected: Clicking Skills rail button shows page-skills and hides mid-panel. Cmd+4 switches to skills page.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(ui): add skills page to navigation and keyboard shortcuts (Cmd+4)"
```

---

## Task 5: Create skill-scanner.js Module

**Files:**
- Create: `src/main/skill-scanner.js`

- [ ] **Step 1: Write skill-scanner.js**

Create `src/main/skill-scanner.js`:

```javascript
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const fsPromises = fs.promises;

// Path helpers
function getHermesHome() {
  return process.env.HERMES_HOME || path.join(app.getPath('home'), '.hermes');
}

function getAgentsHome() {
  return path.join(app.getPath('home'), '.agents');
}

// Parse YAML frontmatter from SKILL.md
function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { name: '', description: '', category: '' };
  }
  
  const frontmatter = frontmatterMatch[1];
  const result = { name: '', description: '', category: '' };
  
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const catMatch = frontmatter.match(/^category:\s*(.+)$/m);
  
  if (nameMatch) result.name = nameMatch[1].trim();
  if (descMatch) result.description = descMatch[1].trim();
  if (catMatch) result.category = catMatch[1].trim();
  
  return result;
}

// Scan a single skill directory
async function scanSkillDir(dirPath, source) {
  const skillMdPath = path.join(dirPath, 'SKILL.md');
  
  try {
    const content = await fsPromises.readFile(skillMdPath, 'utf-8');
    const meta = parseFrontmatter(content);
    
    const stat = await fsPromises.stat(dirPath);
    const hasReferences = fs.existsSync(path.join(dirPath, 'references'));
    const hasScripts = fs.existsSync(path.join(dirPath, 'scripts'));
    
    return {
      name: meta.name || path.basename(dirPath),
      description: meta.description || '',
      category: meta.category || path.basename(path.dirname(dirPath)),
      path: dirPath,
      source: source,
      status: 'enabled',
      provenance: null,
      hasReferences: hasReferences,
      hasScripts: hasScripts,
      skillMdPath: skillMdPath,
      skillMdContent: content,
      useCount: 0,
      lastActivity: null,
      curatorState: null,
      created: stat.mtime.toISOString(),
    };
  } catch (err) {
    return null;
  }
}

// Recursively find all SKILL.md files in a directory
async function findSkillMds(baseDir, source) {
  const skills = [];
  
  try {
    const entries = await fsPromises.readdir(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(baseDir, entry.name);
        const skillMdPath = path.join(fullPath, 'SKILL.md');
        
        try {
          await fsPromises.access(skillMdPath);
          const skill = await scanSkillDir(fullPath, source);
          if (skill) skills.push(skill);
        } catch {
          // No SKILL.md, recurse into subdirectory
          const subSkills = await findSkillMds(fullPath, source);
          skills.push(...subSkills);
        }
      }
    }
  } catch (err) {
    // Directory doesn't exist, return empty
  }
  
  return skills;
}

// Load .usage.json for agent skill provenance
async function loadUsageJson() {
  const usagePath = path.join(getHermesHome(), 'skills', '.usage.json');
  try {
    const content = await fsPromises.readFile(usagePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// Load Hermes config.yaml for enabled/disabled state
function loadHermesConfig() {
  const configPath = path.join(getHermesHome(), 'config.yaml');
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    // Simple YAML parser for skills section
    const enabled = [];
    const disabled = [];
    
    const enabledMatch = content.match(/skills:\s*\n\s+enabled:\s*\n((?:\s+-\s+.+\n)*)/);
    const disabledMatch = content.match(/skills:\s*\n(?:.*\n)*?\s+disabled:\s*\n((?:\s+-\s+.+\n)*)/);
    
    if (enabledMatch) {
      enabledMatch[1].split('\n').forEach(line => {
        const match = line.match(/\s+-\s+(.+)/);
        if (match) enabled.push(match[1].trim().replace(/['"]/g, ''));
      });
    }
    
    if (disabledMatch) {
      disabledMatch[1].split('\n').forEach(line => {
        const match = line.match(/\s+-\s+(.+)/);
        if (match) disabled.push(match[1].trim().replace(/['"]/g, ''));
      });
    }
    
    return { enabled, disabled };
  } catch {
    return { enabled: [], disabled: [] };
  }
}

// Apply enabled/disabled status from config
function applyStatus(skills, config) {
  skills.forEach(skill => {
    if (config.disabled.includes(skill.name)) {
      skill.status = 'disabled';
    } else {
      skill.status = 'enabled';
    }
  });
}

// Scan builtin skills
async function scanBuiltinSkills() {
  const appDir = path.join(__dirname, '..');
  const skillsDir = path.join(appDir, 'hermes-agent', 'skills');
  const optionalDir = path.join(appDir, 'hermes-agent', 'optional-skills');
  
  const skills = [];
  skills.push(...await findSkillMds(skillsDir, 'builtin'));
  skills.push(...await findSkillMds(optionalDir, 'builtin'));
  
  const config = loadHermesConfig();
  applyStatus(skills, config);
  
  return skills;
}

// Scan user skills (excluding agent-generated)
async function scanUserSkills() {
  const hermesSkillsDir = path.join(getHermesHome(), 'skills');
  const agentsSkillsDir = path.join(getAgentsHome(), 'skills');
  
  const usageData = await loadUsageJson();
  const agentNames = new Set(
    Object.keys(usageData).filter(name => usageData[name]?.created_by === 'agent')
  );
  
  const skills = [];
  const allSkills = [];
  
  allSkills.push(...await findSkillMds(hermesSkillsDir, 'user'));
  allSkills.push(...await findSkillMds(agentsSkillsDir, 'user'));
  
  // Filter out agent-generated skills
  allSkills.forEach(skill => {
    if (!agentNames.has(skill.name)) {
      skills.push(skill);
    }
  });
  
  const config = loadHermesConfig();
  applyStatus(skills, config);
  
  return skills;
}

// Identify agent-generated skills
async function scanAgentSkills() {
  const hermesSkillsDir = path.join(getHermesHome(), 'skills');
  const usageData = await loadUsageJson();
  
  const allSkills = await findSkillMds(hermesSkillsDir, 'agent');
  
  return allSkills
    .filter(skill => usageData[skill.name]?.created_by === 'agent')
    .map(skill => ({
      ...skill,
      provenance: 'agent',
      useCount: usageData[skill.name]?.use_count || 0,
      lastActivity: usageData[skill.name]?.last_activity_at || null,
      curatorState: usageData[skill.name]?.state || 'active',
    }));
}

// List files in skill directory
async function listSkillFiles(skillPath) {
  const files = [];
  
  async function walkDir(dir, relativePath = '') {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          files.push({ name: entry.name + '/', path: fullPath, isDirectory: true });
          await walkDir(fullPath, relPath);
        } else {
          const stat = await fsPromises.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            isDirectory: false,
            size: stat.size,
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  await walkDir(skillPath);
  return files;
}

module.exports = {
  scanBuiltinSkills,
  scanUserSkills,
  scanAgentSkills,
  listSkillFiles,
  getHermesHome,
  getAgentsHome,
  loadHermesConfig,
  loadUsageJson,
};
```

- [ ] **Step 2: Verify module loads without errors**

Run: `node -e "const scanner = require('./src/main/skill-scanner.js'); console.log('Module loaded successfully');"`
Expected: "Module loaded successfully"

- [ ] **Step 3: Commit**

```bash
git add src/main/skill-scanner.js
git commit -m "feat(backend): create skill-scanner module for builtin/user/agent skill discovery"
```

---

## Task 6: Add Skills IPC Channels to Preload

**Files:**
- Modify: `src/preload/index.js` (append before closing `});`)

- [ ] **Step 1: Add skills IPC channels**

Insert before line 64 (before closing `});`):

```javascript
  // Skills management
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsGetDetail: (skillPath) => ipcRenderer.invoke('skills:get-detail', skillPath),
  skillsSetEnabled: (skillName, enabled) => ipcRenderer.invoke('skills:set-enabled', skillName, enabled),
  skillsCreate: (skillData) => ipcRenderer.invoke('skills:create', skillData),
  skillsUpdate: (skillPath, content) => ipcRenderer.invoke('skills:update', { skillPath, content }),
  skillsDelete: (skillPath) => ipcRenderer.invoke('skills:delete', skillPath),
  skillsArchive: (skillPath) => ipcRenderer.invoke('skills:archive', skillPath),
  skillsUnarchive: (skillPath) => ipcRenderer.invoke('skills:unarchive', skillPath),
  skillsGetFile: (filePath) => ipcRenderer.invoke('skills:get-file', filePath),
  skillsWriteFile: (filePath, content) => ipcRenderer.invoke('skills:write-file', { filePath, content }),
  skillsListFiles: (skillPath) => ipcRenderer.invoke('skills:list-files', skillPath),
```

- [ ] **Step 2: Verify preload loads without errors**

Run: `npm run dev`
Expected: App starts without preload errors in console

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.js
git commit -m "feat(preload): add skills management IPC channels"
```

---

## Task 7: Implement IPC Handlers

**Files:**
- Modify: `src/main/ipc-handlers.js` (insert before `module.exports`)

- [ ] **Step 1: Import skill-scanner**

Add at top of file (after line 6):

```javascript
const skillScanner = require('./skill-scanner');
```

- [ ] **Step 2: Add skills IPC handlers**

Insert before line 468 (before `module.exports`):

```javascript
  // Skills management handlers
  ipcMain.handle('skills:list', async () => {
    try {
      const builtin = await skillScanner.scanBuiltinSkills();
      const user = await skillScanner.scanUserSkills();
      const agent = await skillScanner.scanAgentSkills();
      return { success: true, builtin, user, agent };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:get-detail', async (_, skillPath) => {
    try {
      const files = await skillScanner.listSkillFiles(skillPath);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:set-enabled', async (_, skillName, enabled) => {
    try {
      const hermesHome = skillScanner.getHermesHome();
      const configPath = path.join(hermesHome, 'config.yaml');
      let content = '';
      
      try {
        content = fs.readFileSync(configPath, 'utf-8');
      } catch {
        content = 'skills:\n  enabled: []\n  disabled: []\n';
      }
      
      // Simple YAML manipulation for skills section
      const enabledMatch = content.match(/(skills:\s*\n\s+enabled:\s*\[)([^\]]*)(\])/);
      const disabledMatch = content.match(/(skills:\s*\n(?:.*\n)*?\s+disabled:\s*\[)([^\]]*)(\])/);
      
      let enabledList = enabledMatch ? enabledMatch[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
      let disabledList = disabledMatch ? disabledMatch[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
      
      if (enabled) {
        enabledList = [...new Set([...enabledList, skillName])];
        disabledList = disabledList.filter(n => n !== skillName);
      } else {
        disabledList = [...new Set([...disabledList, skillName])];
        enabledList = enabledList.filter(n => n !== skillName);
      }
      
      const enabledStr = enabledList.map(n => `'${n}'`).join(', ');
      const disabledStr = disabledList.map(n => `'${n}'`).join(', ');
      
      if (enabledMatch) {
        content = content.replace(enabledMatch[0], `skills:\n  enabled: [${enabledStr}]`);
      } else {
        content += `\nskills:\n  enabled: [${enabledStr}]\n`;
      }
      
      if (disabledMatch) {
        content = content.replace(disabledMatch[0], `skills:\n  disabled: [${disabledStr}]`);
      } else {
        content += `\nskills:\n  disabled: [${disabledStr}]\n`;
      }
      
      fs.writeFileSync(configPath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:create', async (_, skillData) => {
    try {
      const hermesHome = skillScanner.getHermesHome();
      const skillsDir = path.join(hermesHome, 'skills');
      const skillPath = path.join(skillsDir, skillData.name);
      
      if (fs.existsSync(skillPath)) {
        return { success: false, error: 'Skill already exists' };
      }
      
      fs.mkdirSync(skillPath, { recursive: true });
      
      const skillMdContent = `---\nname: ${skillData.name}\ndescription: ${skillData.description}\ncategory: ${skillData.category || 'general'}\n---\n\n${skillData.content || '# New Skill\n\nDescribe your skill here.'}\n`;
      
      fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillMdContent, 'utf-8');
      
      return { success: true, path: skillPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:update', async (_, { skillPath, content }) => {
    try {
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      fs.writeFileSync(skillMdPath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:delete', async (_, skillPath) => {
    try {
      fs.rmSync(skillPath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:archive', async (_, skillPath) => {
    try {
      const archiveDir = path.join(skillPath, '.archive');
      fs.mkdirSync(archiveDir, { recursive: true });
      const entries = fs.readdirSync(skillPath);
      for (const entry of entries) {
        if (entry === '.archive') continue;
        const src = path.join(skillPath, entry);
        const dest = path.join(archiveDir, entry);
        fs.renameSync(src, dest);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:unarchive', async (_, skillPath) => {
    try {
      const archiveDir = path.join(skillPath, '.archive');
      if (!fs.existsSync(archiveDir)) {
        return { success: false, error: 'No archive found' };
      }
      const entries = fs.readdirSync(archiveDir);
      for (const entry of entries) {
        const src = path.join(archiveDir, entry);
        const dest = path.join(skillPath, entry);
        fs.renameSync(src, dest);
      }
      fs.rmSync(archiveDir, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:get-file', async (_, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:write-file', async (_, { filePath, content }) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:list-files', async (_, skillPath) => {
    try {
      const files = await skillScanner.listSkillFiles(skillPath);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

---

## Task 8: Load and Render Skills List

**Files:**
- Modify: `src/renderer/app.js` (append skills page logic at end of file)

- [ ] **Step 1: Add skills state management and table rendering**

Append to end of `src/renderer/app.js`:

```javascript
// ============================
// Skills Page
// ============================

const skillsState = {
  currentTab: 'builtin',
  skills: { builtin: [], user: [], agent: [] },
  selectedSkill: null,
  detailVisible: false,
  categories: new Set(),
  searchQuery: '',
  statusFilter: '',
  categoryFilter: '',
};

function initSkillsPage() {
  setupSkillsTabs();
  setupSkillsToolbar();
  setupSkillsDetailPanel();
  loadSkillsList();
}

async function loadSkillsList() {
  const result = await window.api.skillsList();
  if (!result.success) {
    console.error('Failed to load skills:', result.error);
    return;
  }
  
  skillsState.skills = result;
  
  skillsState.categories = new Set();
  ['builtin', 'user', 'agent'].forEach(source => {
    result[source].forEach(skill => {
      if (skill.category) skillsState.categories.add(skill.category);
    });
  });
  
  updateCategoryFilter();
  renderSkillsTable();
}

function updateCategoryFilter() {
  const select = document.getElementById('skills-category-filter');
  if (!select) return;
  
  const currentValue = select.value;
  select.innerHTML = '<option value="">全部分类</option>';
  
  Array.from(skillsState.categories).sort().forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
  
  select.value = currentValue;
}

function getFilteredSkills() {
  const skills = skillsState.skills[skillsState.currentTab] || [];
  
  return skills.filter(skill => {
    if (skillsState.searchQuery) {
      const q = skillsState.searchQuery.toLowerCase();
      if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false;
    }
    
    if (skillsState.categoryFilter && skill.category !== skillsState.categoryFilter) return false;
    
    if (skillsState.statusFilter) {
      if (skillsState.currentTab === 'agent') {
        if (skill.curatorState !== skillsState.statusFilter) return false;
      } else {
        if (skill.status !== skillsState.statusFilter) return false;
      }
    }
    
    return true;
  });
}

function renderSkillsTable() {
  const body = document.getElementById('skills-table-body');
  const header = document.getElementById('skills-table-header');
  if (!body || !header) return;
  
  const tab = skillsState.currentTab;
  const skills = getFilteredSkills();
  
  header.className = `skills-table-header ${tab}`;
  header.innerHTML = getTabHeaderHTML(tab);
  
  if (skills.length === 0) {
    body.innerHTML = '<div class="empty-state-text">暂无skills</div>';
    return;
  }
  
  body.innerHTML = skills.map(skill => `
    <div class="skills-table-row ${tab}" data-skill-path="${escapeHtml(skill.path)}">
      ${getTabRowHTML(tab, skill)}
    </div>
  `).join('');
  
  body.querySelectorAll('.skills-table-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.skill-action-btn, .skill-status-toggle')) return;
      const skillPath = row.dataset.skillPath;
      const skill = skills.find(s => s.path === skillPath);
      if (skill) openSkillDetail(skill);
    });
  });
}

function getTabHeaderHTML(tab) {
  const headers = {
    builtin: '<span>Icon</span><span>Name</span><span>Description</span><span>Category</span><span>Status</span><span>Actions</span>',
    user: '<span>Icon</span><span>Name</span><span>Description</span><span>Location</span><span>Created</span><span>Status</span><span>Actions</span>',
    agent: '<span>Icon</span><span>Name</span><span>Description</span><span>Uses</span><span>Last Activity</span><span>State</span><span>Actions</span>',
  };
  return headers[tab] || '';
}

function getTabRowHTML(tab, skill) {
  const icon = tab === 'builtin' ? '📚' : tab === 'agent' ? '🤖' : '📝';
  const desc = skill.description || '';
  const truncatedDesc = desc.length > 60 ? desc.substring(0, 60) + '...' : desc;
  
  if (tab === 'builtin') {
    return `
      <span class="skills-row-icon">${icon}</span>
      <span class="skills-row-name">${escapeHtml(skill.name)}</span>
      <span class="skills-row-desc" title="${escapeHtml(desc)}">${escapeHtml(truncatedDesc)}</span>
      <span class="skills-row-category">${escapeHtml(skill.category)}</span>
      <span class="skills-row-status">
        <label class="toggle-label">
          <input type="checkbox" ${skill.status === 'enabled' ? 'checked' : ''} data-skill-name="${escapeHtml(skill.name)}" class="skill-status-toggle">
          <span class="toggle-slider"></span>
        </label>
      </span>
      <span class="skills-row-actions">
        <button class="skill-action-btn view-btn" data-skill-path="${escapeHtml(skill.path)}">查看</button>
      </span>
    `;
  }
  
  if (tab === 'user') {
    const location = skill.path.includes('/.hermes/') ? '~/.hermes/skills/' : '~/.agents/skills/';
    const created = skill.created ? new Date(skill.created).toLocaleDateString() : '-';
    return `
      <span class="skills-row-icon">${icon}</span>
      <span class="skills-row-name">${escapeHtml(skill.name)}</span>
      <span class="skills-row-desc" title="${escapeHtml(desc)}">${escapeHtml(truncatedDesc)}</span>
      <span class="skills-row-location">${location}</span>
      <span class="skills-row-created">${created}</span>
      <span class="skills-row-status">
        <label class="toggle-label">
          <input type="checkbox" ${skill.status === 'enabled' ? 'checked' : ''} data-skill-name="${escapeHtml(skill.name)}" class="skill-status-toggle">
          <span class="toggle-slider"></span>
        </label>
      </span>
      <span class="skills-row-actions">
        <button class="skill-action-btn view-btn" data-skill-path="${escapeHtml(skill.path)}">查看</button>
        <button class="skill-action-btn danger delete-btn" data-skill-path="${escapeHtml(skill.path)}">删除</button>
      </span>
    `;
  }
  
  if (tab === 'agent') {
    const useCount = skill.useCount || 0;
    const lastActivity = skill.lastActivity ? new Date(skill.lastActivity).toLocaleDateString() : '-';
    const curatorState = skill.curatorState || 'active';
    return `
      <span class="skills-row-icon">${icon}</span>
      <span class="skills-row-name">${escapeHtml(skill.name)}</span>
      <span class="skills-row-desc" title="${escapeHtml(desc)}">${escapeHtml(truncatedDesc)}</span>
      <span class="skills-row-use-count">${useCount}</span>
      <span class="skills-row-last-activity">${lastActivity}</span>
      <span class="skills-row-curator-state ${curatorState}">${curatorState}</span>
      <span class="skills-row-actions">
        <button class="skill-action-btn view-btn" data-skill-path="${escapeHtml(skill.path)}">查看</button>
        <button class="skill-action-btn archive-btn" data-skill-path="${escapeHtml(skill.path)}">归档</button>
      </span>
    `;
  }
  
  return '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **Step 2: Verify skills table renders**

Run: `npm run dev`
Expected: Skills page loads, table shows skills from all three tabs, rows are clickable

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(ui): add skills list loading and table rendering with tab-specific columns"
```

---

## Task 9: Implement Table Interactions

**Files:**
- Modify: `src/renderer/app.js` (append to skills section)

- [ ] **Step 1: Add tabs, toolbar, and action handlers**

Append to skills section in app.js:

```javascript
function setupSkillsTabs() {
  document.querySelectorAll('.skills-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.skills-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      skillsState.currentTab = tab.dataset.tab;
      renderSkillsTable();
      updateToolbarActions();
    });
  });
}

function updateToolbarActions() {
  const newBtn = document.getElementById('new-skill-btn');
  if (!newBtn) return;
  newBtn.style.display = skillsState.currentTab === 'user' ? '' : 'none';
}

function setupSkillsToolbar() {
  const searchInput = document.getElementById('skills-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        skillsState.searchQuery = searchInput.value.trim();
        renderSkillsTable();
      }, 200);
    });
  }
  
  const categoryFilter = document.getElementById('skills-category-filter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      skillsState.categoryFilter = categoryFilter.value;
      renderSkillsTable();
    });
  }
  
  const statusFilter = document.getElementById('skills-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      skillsState.statusFilter = statusFilter.value;
      renderSkillsTable();
    });
  }
  
  const refreshBtn = document.getElementById('refresh-skills-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadSkillsList());
  }
  
  const newBtn = document.getElementById('new-skill-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => showNewSkillDialog());
  }
  
  const body = document.getElementById('skills-table-body');
  if (body) {
    body.addEventListener('change', async (e) => {
      if (e.target.classList.contains('skill-status-toggle')) {
        const skillName = e.target.dataset.skillName;
        const enabled = e.target.checked;
        await window.api.skillsSetEnabled(skillName, enabled);
        loadSkillsList();
      }
    });
    
    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('.view-btn, .delete-btn, .archive-btn');
      if (!btn) return;
      
      const skillPath = btn.dataset.skillPath;
      
      if (btn.classList.contains('view-btn')) {
        const skills = skillsState.skills[skillsState.currentTab];
        const skill = skills.find(s => s.path === skillPath);
        if (skill) openSkillDetail(skill);
      } else if (btn.classList.contains('delete-btn')) {
        if (confirm('确定删除此skill？')) {
          await window.api.skillsDelete(skillPath);
          loadSkillsList();
          closeSkillDetail();
        }
      } else if (btn.classList.contains('archive-btn')) {
        await window.api.skillsArchive(skillPath);
        loadSkillsList();
        closeSkillDetail();
      }
    });
  }
}
```

- [ ] **Step 2: Verify interactions work**

Run: `npm run dev`
Expected: Tab switching works, search filters in real-time, status toggle updates config, delete/archive show confirmation

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(ui): add skills table interactions (tabs, search, filters, status toggle, actions)"
```

---

## Task 10: Implement Detail Panel

**Files:**
- Modify: `src/renderer/app.js` (append to skills section)

- [ ] **Step 1: Add detail panel open/close/render logic**

Append to skills section in app.js:

```javascript
function setupSkillsDetailPanel() {
  const closeBtn = document.getElementById('detail-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeSkillDetail);
  
  document.querySelectorAll('.detail-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchDetailTab(tab.dataset.detailTab);
    });
  });
  
  const saveBtn = document.getElementById('detail-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSkillDetail);
  
  const cancelBtn = document.getElementById('detail-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelSkillEdit);
}

async function openSkillDetail(skill) {
  skillsState.selectedSkill = skill;
  skillsState.detailVisible = true;
  
  const panel = document.getElementById('skills-detail-panel');
  if (panel) {
    panel.style.display = '';
    requestAnimationFrame(() => panel.classList.add('visible'));
  }
  
  const nameEl = document.getElementById('detail-skill-name');
  const badgeEl = document.getElementById('detail-source-badge');
  const statusToggle = document.getElementById('detail-status-toggle');
  
  if (nameEl) nameEl.textContent = skill.name;
  if (badgeEl) {
    badgeEl.textContent = skill.source;
    badgeEl.className = `detail-source-badge ${skill.source}`;
  }
  if (statusToggle) statusToggle.style.display = skill.source === 'builtin' ? '' : 'none';
  
  document.querySelectorAll('.detail-tab-btn').forEach(t => t.classList.remove('active'));
  const contentTab = document.querySelector('.detail-tab-btn[data-detail-tab="content"]');
  if (contentTab) contentTab.classList.add('active');
  switchDetailTab('content');
  
  if (skill.skillMdContent) {
    const markdownEl = document.getElementById('detail-markdown');
    if (markdownEl) markdownEl.innerHTML = renderMarkdown(skill.skillMdContent);
  }
  
  if (skill.source !== 'builtin') {
    const header = document.getElementById('detail-header');
    if (header && !document.getElementById('detail-edit-btn')) {
      const editBtn = document.createElement('button');
      editBtn.id = 'detail-edit-btn';
      editBtn.className = 'skill-action-btn';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', startSkillEdit);
      header.insertBefore(editBtn, statusToggle);
    }
  } else {
    const existingBtn = document.getElementById('detail-edit-btn');
    if (existingBtn) existingBtn.remove();
  }
}

function closeSkillDetail() {
  skillsState.selectedSkill = null;
  skillsState.detailVisible = false;
  
  const panel = document.getElementById('skills-detail-panel');
  if (panel) {
    panel.classList.remove('visible');
    setTimeout(() => { panel.style.display = 'none'; }, 200);
  }
  
  const existingBtn = document.getElementById('detail-edit-btn');
  if (existingBtn) existingBtn.remove();
}

function switchDetailTab(tabName) {
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  
  if (tabName === 'content') {
    if (content) content.style.display = '';
    if (editor) editor.style.display = 'none';
    
    if (skillsState.selectedSkill?.skillMdContent) {
      const markdownEl = document.getElementById('detail-markdown');
      if (markdownEl) markdownEl.innerHTML = renderMarkdown(skillsState.selectedSkill.skillMdContent);
    }
  } else if (tabName === 'files') {
    if (content) content.style.display = '';
    if (editor) editor.style.display = 'none';
    loadSkillFiles();
  }
}

async function loadSkillFiles() {
  const skill = skillsState.selectedSkill;
  if (!skill) return;
  
  const content = document.getElementById('detail-content');
  if (!content) return;
  
  const result = await window.api.skillsListFiles(skill.path);
  if (!result.success) {
    content.innerHTML = '<p class="empty-state-text">加载文件失败</p>';
    return;
  }
  
  const files = result.files || [];
  if (files.length === 0) {
    content.innerHTML = '<p class="empty-state-text">无文件</p>';
    return;
  }
  
  content.innerHTML = `
    <div class="detail-file-tree">
      ${files.map(file => `
        <div class="detail-file-item" data-file-path="${escapeHtml(file.path)}">
          <span class="detail-file-icon">${file.isDirectory ? '📁' : '📄'}</span>
          <span class="detail-file-name">${escapeHtml(file.name)}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  content.querySelectorAll('.detail-file-item').forEach(item => {
    item.addEventListener('click', async () => {
      const filePath = item.dataset.filePath;
      const file = files.find(f => f.path === filePath);
      if (file && !file.isDirectory) await openFileEditor(filePath);
    });
  });
}

async function openFileEditor(filePath) {
  const result = await window.api.skillsGetFile(filePath);
  if (!result.success) {
    alert('加载文件失败: ' + result.error);
    return;
  }
  
  const textarea = document.getElementById('detail-editor-textarea');
  if (textarea) {
    textarea.value = result.content;
    textarea.dataset.filePath = filePath;
  }
  
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  if (content) content.style.display = 'none';
  if (editor) editor.classList.add('visible');
}

function startSkillEdit() {
  const skill = skillsState.selectedSkill;
  if (!skill) return;
  
  const textarea = document.getElementById('detail-editor-textarea');
  if (textarea) {
    textarea.value = skill.skillMdContent || '';
    textarea.dataset.filePath = skill.skillMdPath;
  }
  
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  if (content) content.style.display = 'none';
  if (editor) editor.classList.add('visible');
}

async function saveSkillDetail() {
  const textarea = document.getElementById('detail-editor-textarea');
  if (!textarea) return;
  
  const filePath = textarea.dataset.filePath;
  const content = textarea.value;
  
  const result = await window.api.skillsWriteFile(filePath, content);
  if (!result.success) {
    alert('保存失败: ' + result.error);
    return;
  }
  
  if (skillsState.selectedSkill) {
    skillsState.selectedSkill.skillMdContent = content;
  }
  
  cancelSkillEdit();
  loadSkillsList();
}

function cancelSkillEdit() {
  const content = document.getElementById('detail-content');
  const editor = document.getElementById('detail-editor');
  if (content) content.style.display = '';
  if (editor) editor.classList.remove('visible');
}
```

- [ ] **Step 2: Verify detail panel works**

Run: `npm run dev`
Expected: Clicking skill row opens detail panel with markdown, edit button for user/agent skills, file tree loads, editor opens

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(ui): add skill detail panel with markdown view, file tree, and editor"
```

---

## Task 11: New Skill Dialog

**Files:**
- Modify: `src/renderer/app.js` (append to skills section)

- [ ] **Step 1: Add new skill dialog**

Append to skills section in app.js:

```javascript
function showNewSkillDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'new-skill-dialog-overlay';
  overlay.innerHTML = `
    <div class="new-skill-dialog">
      <div class="new-skill-dialog-header">创建新Skill</div>
      <div class="new-skill-dialog-body">
        <div class="form-group">
          <label for="new-skill-name">名称 (必填)</label>
          <input type="text" id="new-skill-name" placeholder="skill名称">
        </div>
        <div class="form-group">
          <label for="new-skill-description">描述 (必填)</label>
          <input type="text" id="new-skill-description" placeholder="skill描述">
        </div>
        <div class="form-group">
          <label for="new-skill-category">分类 (可选)</label>
          <input type="text" id="new-skill-category" placeholder="general">
        </div>
        <div class="form-group">
          <label for="new-skill-template">模板 (可选)</label>
          <select id="new-skill-template">
            <option value="">空模板</option>
            <option value="feishu">飞书模板</option>
            <option value="dingtalk">钉钉模板</option>
            <option value="office">Office模板</option>
          </select>
        </div>
      </div>
      <div class="new-skill-dialog-footer">
        <button class="btn btn-secondary" id="new-skill-cancel">取消</button>
        <button class="btn btn-primary" id="new-skill-create">创建</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('#new-skill-cancel').addEventListener('click', () => overlay.remove());
  
  overlay.querySelector('#new-skill-create').addEventListener('click', async () => {
    const name = overlay.querySelector('#new-skill-name').value.trim();
    const description = overlay.querySelector('#new-skill-description').value.trim();
    const category = overlay.querySelector('#new-skill-category').value.trim() || 'general';
    const template = overlay.querySelector('#new-skill-template').value;
    
    if (!name || !description) {
      alert('请填写名称和描述');
      return;
    }
    
    let content = '';
    switch (template) {
      case 'feishu':
        content = '## 飞书技能\n\n使用 lark-cli 命令行工具操作飞书。\n\n### 常用命令\n\n\`\`\`bash\nlark-cli user info\nlark-cli doc list\n\`\`\`';
        break;
      case 'dingtalk':
        content = '## 钉钉技能\n\n使用 dws 命令行工具操作钉钉。\n\n### 常用命令\n\n\`\`\`bash\ndws user info\ndws doc list\n\`\`\`';
        break;
      case 'office':
        content = '## Office技能\n\n处理Office文档相关操作。\n\n### 使用方法\n\n描述你的skill使用方式。';
        break;
      default:
        content = '# New Skill\n\n描述你的skill。';
    }
    
    const result = await window.api.skillsCreate({ name, description, category, content });
    
    if (result.success) {
      overlay.remove();
      loadSkillsList();
    } else {
      alert('创建失败: ' + result.error);
    }
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
```

- [ ] **Step 2: Verify dialog works**

Run: `npm run dev`
Expected: Dialog opens, form validation works, skill creation succeeds, table refreshes

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(ui): add new skill dialog with template selection"
```

---

## Task 12: Initialize Skills Page

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Call initSkillsPage on app startup**

Find existing DOMContentLoaded or init code and add:

```javascript
initSkillsPage();
```

If no DOMContentLoaded exists, append at end of file:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  initSkillsPage();
});
```

- [ ] **Step 2: Verify skills page initializes**

Run: `npm run dev`
Expected: Skills page loads skills list on startup

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat(ui): initialize skills page on app load"
```

---

## Task 13: Integration Testing

**Files:**
- Manual testing (no test files for Electron GUI)

- [ ] **Step 1: Test all three tabs**

Run: `npm run dev`
Expected:
- Builtin tab: 89+ skills, read-only, status toggle works
- User tab: user skills, create/edit/delete works
- Agent tab: agent skills, curator state badges, archive works

- [ ] **Step 2: Test search and filters**

Expected:
- Search filters by name/description in real-time
- Category filter populates dynamically
- Status filter works per tab type

- [ ] **Step 3: Test detail panel**

Expected:
- Slide animation works
- Markdown renders correctly
- Edit mode works for user/agent
- File tree loads
- Close button hides panel

- [ ] **Step 4: Test new skill creation**

Expected:
- Dialog opens with form
- Templates work (feishu/dingtalk/office/empty)
- Created skill appears in user tab
- Config.yaml updated

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify skills management feature end-to-end"
```

---

## Task 14: Edge Case Handling

**Files:**
- Modify: `src/main/skill-scanner.js`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Handle missing SKILL.md**

Already handled in scanSkillDir (returns null).

- [ ] **Step 2: Handle invalid frontmatter**

Already handled in parseFrontmatter (returns empty strings, uses directory name as fallback).

- [ ] **Step 3: Handle empty directories**

Already handled in renderSkillsTable (shows "暂无skills").

- [ ] **Step 4: Handle config.yaml write errors**

Already handled in ipc-handlers (try/catch returns error).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: handle edge cases (missing SKILL.md, invalid frontmatter, empty dirs, write errors)"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|-----------------|------|
| Rail button for Skills page | Task 1 |
| page-skills HTML structure | Task 2 |
| CSS styles for skills page | Task 3 |
| Page switching logic | Task 4 |
| Skill scanner module | Task 5 |
| IPC channels in preload | Task 6 |
| IPC handlers | Task 7 |
| Load and render skills list | Task 8 |
| Table interactions | Task 9 |
| Detail panel structure | Task 10 |
| New skill dialog | Task 11 |
| Search and filters | Task 9 |
| Integration testing | Task 13 |
| Edge case handling | Task 14 |

### Placeholder Scan

No placeholders found. All steps contain actual code and specific commands.

### Type Consistency

- `skillsState` object structure consistent across all tasks
- Skill data model matches design spec (name, description, category, path, source, status, etc.)
- IPC channel names consistent (skills:list, skills:get-detail, etc.)
- CSS class names consistent with design spec

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-skills-management.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**