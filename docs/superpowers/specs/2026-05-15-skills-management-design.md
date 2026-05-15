# Skills Management Feature Design

**Date:** 2026-05-15
**Status:** Draft
**Target:** Hermes Desktop for Office

## Overview

Add a Skills management page to Hermes Desktop for Office, allowing users to browse, search, view details, and manage skills. Skills are procedural knowledge units used by Hermes Agent, stored in markdown files (SKILL.md) with frontmatter metadata.

## Requirements

### User Stories

1. **Browse all available skills** - User can see all skills from different sources (builtin, user-created, agent-generated) in one interface
2. **Search and filter skills** - User can quickly find skills by name, description, or category
3. **View skill details** - User can read full SKILL.md content, including references and scripts
4. **Manage skill lifecycle** - User can enable/disable builtin skills, create/edit/delete user skills, archive agent-generated skills
5. **Create new skills** - User can create new skills with templates (Feishu, DingTalk, Office templates)
6. **Edit skill content** - User can edit SKILL.md and supporting files (references, scripts, templates)

### Constraints

- Builtin skills (`src/hermes-agent/skills/` and `src/hermes-agent/optional-skills/`) are read-only
- User skills are fully editable and deletable
- Agent-generated skills have curator lifecycle (active → stale → archived)
- Skill enable/disable state syncs with Hermes config.yaml
- Compatible with Hermes Agent's skill_manage tool and curator system

## Architecture

### Layout: Tab + Split Panel

**Rail Button:** Add 4th button for Skills page (between Settings and Logs)

```
rail-btn[data-page="skills"]
  - Icon: Book/toolbox SVG
  - Tooltip: "Skills"
  - Keyboard shortcut: Cmd+4
```

**Main Panel Structure:**

```
page-skills
├── page-header (Title: "Skills管理")
├── skills-toolbar
│   ├── search-input (实时搜索)
│   ├── category-filter (下拉)
│   ├── status-filter (下拉)
│   └── action-buttons (新建/刷新，按tab变化)
├── skills-tabs
│   ├── tab-builtin (内置库)
│   ├── tab-user (我的Skills)
│   └── tab-agent (Agent生成)
└── skills-content (split layout)
    ├── skills-list-panel (左侧表格)
    │   └── skills-table (skill列表)
    └── skills-detail-panel (右侧详情，默认隐藏)
```

**Split Panel Behavior:**

- Initial: detail panel hidden, list panel full width
- Click skill row: detail panel slides out from right (400px width)
- Click close: detail panel slides back to hidden
- Drag resize handle: adjustable width (300px - 600px)

### Data Sources

**Three Skill Categories:**

1. **Builtin Skills** (`source: "builtin"`)
   - Path: `src/hermes-agent/skills/` (89 skills in 26 categories)
   - Path: `src/hermes-agent/optional-skills/` (optional skills)
   - Features: Read-only, can enable/disable

2. **User Skills** (`source: "user"`)
   - Path: `~/.hermes/skills/` (user-created, excluding agent-generated)
   - Path: `~/.agents/skills/` (custom directory)
   - Features: Fully editable, can create/delete

3. **Agent-generated Skills** (`source: "agent"`)
   - Path: `~/.hermes/skills/` (same as user, but marked `created_by: agent`)
   - Provenance: From `.usage.json` `created_by` field
   - Features: Curator-managed lifecycle, can view/edit/archive

### Skill Data Model

```javascript
{
  name: "dws",                    // From SKILL.md frontmatter
  description: "...",             // From frontmatter (truncated in table)
  category: "productivity",       // Directory name or frontmatter field
  path: "/path/to/skill/dir",     // Absolute path
  source: "user",                 // "builtin"|"user"|"agent"
  status: "enabled",              // "enabled"|"disabled"
  provenance: null,               // "agent" if agent-generated
  hasReferences: true,            // Has references/ subdirectory
  hasScripts: true,               // Has scripts/ subdirectory
  skillMdPath: "...",             // SKILL.md file path
  skillMdContent: "...",          // Full content (loaded on detail view)
  useCount: 0,                    // For agent skills: from .usage.json
  lastActivity: null,             // For agent skills: last_activity_at
  curatorState: "active",         // For agent skills: active|stale|archived|pinned
  created: null,                  // File mtime or .usage.json timestamp
}
```

## UI Components

### Tab 1: Builtin Library (内置库)

**Table Columns:**

| Column | Content | Interaction |
|--------|---------|-------------|
| Icon | Category icon (GitHub, Productivity, etc.) | Static |
| Name | Skill name | Click → open detail panel |
| Description | Description (truncated, hover for full) | Static |
| Category | Category name | Static |
| Status | Enable/disable toggle | Toggle button |
| Actions | "View" button | Click → open detail panel |

**Features:**
- Read-only (no edit/delete)
- Can only toggle enable/disable state
- Status synced to `~/.hermes/config.yaml` `skills.enabled`/`skills.disabled`

### Tab 2: My Skills (我的Skills)

**Table Columns:**

| Column | Content | Interaction |
|--------|---------|-------------|
| Icon | Generic skill icon | Static |
| Name | Skill name | Click → open detail panel |
| Description | Description (truncated) | Static |
| Location | Path shorthand (e.g., `~/.hermes/skills/`) | Static |
| Created | Creation time | Static |
| Status | Enable/disable toggle | Toggle button |
| Actions | View \| Edit \| Delete | Click → action |

**Features:**
- Full management: create, edit, delete
- "New Skill" button in toolbar
- Edit → open detail panel in edit mode
- Delete → confirm dialog, then remove directory

### Tab 3: Agent Generated (Agent生成)

**Table Columns:**

| Column | Content | Interaction |
|--------|---------|-------------|
| Icon | AI/agent icon | Static |
| Name | Skill name | Click → open detail panel |
| Description | Description (truncated) | Static |
| Use Count | use_count from .usage.json | Static |
| Last Activity | last_activity_at timestamp | Static |
| Curator State | active \| stale \| archived \| pinned badge | Static |
| Actions | View \| Edit \| Archive \| Unarchive | Click → action |

**Features:**
- Curator lifecycle display
- Can archive (move to `.archive/`) and unarchive (restore)
- Can view and edit SKILL.md content
- Toolbar: "Archive all stale" button (batch operation)

### Detail Panel

**Layout:**

```
skills-detail-panel
├── detail-header
│   ├── skill-name (title)
│   ├── source-badge (builtin/user/agent badge)
│   ├── status-toggle (enable/disable, for builtin only)
│   └── close-btn (× button)
├── detail-tabs
│   ├── tab-content (SKILL.md)
│   │   ├── markdown-viewer (rendered SKILL.md)
│   │   └── edit-btn (for user/agent skills)
│   └── tab-files (directory tree)
│       ├── file-tree (SKILL.md, references/, scripts/, templates/, assets/)
│       └── file-actions (new file, upload file, for user/agent skills)
└── detail-editor (edit mode, initially hidden)
    ├── code-editor (textarea or Monaco)
    ├── save-btn
    └── cancel-btn
```

**Markdown Rendering:**
- Use existing `renderMarkdown()` function from `app.js`
- Consistent styling with chat messages (code blocks, headers, tables, etc.)

**File Tree:**
- Click file → edit in inline editor
- New file → dialog for filename, create empty file
- Upload file → file picker, copy to assets/

**Edit Mode:**
- Builtin: no edit button
- User/Agent: click edit → textarea/Monaco editor, save/cancel buttons
- Save → write to SKILL.md, refresh detail view

### Toolbar

**Search Input:**
- Placeholder: "搜索skill名称或描述..."
- Real-time filtering: search name + description fields
- Clear button (×) on right

**Category Filter:**
- Dropdown with all categories (dynamically collected from data)
- Options: 全部分类 \| GitHub \| Productivity \| DevOps \| ...
- Filter table rows on selection

**Status Filter:**
- Builtin/User tabs: 全部状态 \| 已启用 \| 已禁用
- Agent tab: 全部 \| active \| stale \| archived \| pinned

**Action Buttons:**
- Builtin tab: none (read-only)
- User tab: "新建Skill" + "刷新"
- Agent tab: "刷新" + "归档所有stale"

### New Skill Dialog

**Trigger:** Click "新建Skill" button in User tab toolbar

**Dialog Structure:**

```
new-skill-dialog (modal overlay)
├── dialog-header: "创建新Skill"
├── dialog-body
│   ├── name-input (required, skill name)
│   ├── description-input (required, description)
│   ├── category-select (optional, dropdown)
│   └── template-select (optional)
│       ├── 空模板 (empty)
│       ├── 飞书模板 (Feishu CLI base)
│       ├── 钉钉模板 (DingTalk CLI base)
│       └── Office模板 (Office operations)
├── dialog-footer
│   ├── cancel-btn
│   └── create-btn
```

**Create Process:**
1. Validate name (no duplicates, valid characters)
2. Create directory `~/.hermes/skills/<name>/`
3. Generate SKILL.md from template
4. Update config.yaml `skills.enabled` list
5. Refresh table, show new skill row

## Backend Integration

### IPC Channels (preload/index.js)

Add new IPC methods to `window.api`:

```javascript
window.api = {
  // Existing channels...
  
  // Skills management
  skillsList: () => Promise<SkillsListResult>,
  skillsGetDetail: (skillPath) => Promise<SkillDetailResult>,
  skillsSetEnabled: (skillName, enabled) => Promise<void>,
  skillsCreate: (skillData) => Promise<SkillCreateResult>,
  skillsUpdate: (skillPath, content) => Promise<void>,
  skillsDelete: (skillName) => Promise<void>,
  skillsArchive: (skillName) => Promise<void>,
  skillsUnarchive: (skillName) => Promise<void>,
  skillsGetFile: (filePath) => Promise<FileContentResult>,
  skillsWriteFile: (filePath, content) => Promise<void>,
  skillsNewFile: (skillPath, fileName) => Promise<void>,
}
```

### IPC Handlers (main/ipc-handlers.js)

Implement handlers for skills IPC calls:

```javascript
// Skills list - scan all skill directories
ipcMain.handle('skills:list', async () => {
  const builtinSkills = scanBuiltinSkills();
  const userSkills = scanUserSkills();
  const agentSkills = identifyAgentSkills(userSkills);
  return { builtin: builtinSkills, user: userSkills, agent: agentSkills };
});

// Skills detail - read SKILL.md content
ipcMain.handle('skills:get-detail', async (event, skillPath) => {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const files = listSkillFiles(skillPath);
  return { skillMdContent: content, files };
});

// Skills enable/disable - update Hermes config.yaml
ipcMain.handle('skills:set-enabled', async (event, skillName, enabled) => {
  const hermesConfig = loadHermesConfig();
  if (enabled) {
    hermesConfig.skills.enabled.push(skillName);
    hermesConfig.skills.disabled = hermesConfig.skills.disabled.filter(n => n !== skillName);
  } else {
    hermesConfig.skills.disabled.push(skillName);
    hermesConfig.skills.enabled = hermesConfig.skills.enabled.filter(n => n !== skillName);
  }
  saveHermesConfig(hermesConfig);
});
```

### Skill Scanning Logic (main/skill-scanner.js)

**Scan Builtin Skills:**
```javascript
function scanBuiltinSkills() {
  const skillsDir = path.join(__dirname, '../hermes-agent/skills');
  const optionalDir = path.join(__dirname, '../hermes-agent/optional-skills');
  
  const skills = [];
  // Recursively scan directories, find SKILL.md files
  // Parse frontmatter (name, description, category)
  // Return skill objects
}
```

**Scan User Skills:**
```javascript
function scanUserSkills() {
  const hermesSkillsDir = path.join(getHermesHome(), 'skills');
  const agentsSkillsDir = path.join(getAgentsHome(), 'skills');
  
  const skills = [];
  // Scan both directories
  // Check .usage.json for provenance
  // Exclude agent-generated skills
  // Return skill objects
}
```

**Identify Agent Skills:**
```javascript
function identifyAgentSkills(userSkills) {
  const usagePath = path.join(getHermesHome(), 'skills', '.usage.json');
  const usageData = loadUsageJson(usagePath);
  
  return userSkills.filter(skill => 
    usageData[skill.name]?.created_by === 'agent'
  ).map(skill => ({
    ...skill,
    provenance: 'agent',
    useCount: usageData[skill.name]?.use_count || 0,
    lastActivity: usageData[skill.name]?.last_activity_at,
    curatorState: usageData[skill.name]?.state || 'active',
  }));
}
```

## CSS Styling

### New CSS Variables

```css
:root {
  /* Existing variables... */
  
  /* Skills page specific */
  --skills-panel-width: 400px;
  --skills-panel-min: 300px;
  --skills-panel-max: 600px;
  --skill-icon-size: 20px;
}
```

### Skills Page Styles

```css
/* Skills toolbar */
.skills-toolbar {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-xl);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.skills-search-input {
  flex: 1;
  max-width: 300px;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.skills-filter-select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* Skills tabs */
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

/* Skills content - split layout */
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

.skills-list-panel.has-detail {
  width: calc(100% - var(--skills-panel-width));
}

/* Skills table */
.skills-table {
  width: 100%;
  border-collapse: collapse;
}

.skills-table-header {
  display: grid;
  grid-template-columns: 40px 1fr 1.5fr 120px 80px 100px;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--bg-secondary);
}

.skills-table-row {
  display: grid;
  grid-template-columns: 40px 1fr 1.5fr 120px 80px 100px;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background var(--transition);
}

.skills-table-row:hover {
  background: var(--bg-hover);
}

.skills-table-row.selected {
  background: var(--accent-light);
}

/* Skills detail panel */
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
}

.detail-source-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.detail-source-badge.builtin { background: var(--accent-bg); color: var(--accent); }
.detail-source-badge.user { background: rgba(46, 155, 90, 0.15); color: var(--success); }
.detail-source-badge.agent { background: rgba(232, 165, 75, 0.15); color: var(--warning); }

.detail-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
}

.detail-tab-btn {
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.detail-tab-btn.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
}

.detail-markdown {
  /* Use existing markdown styles from chat messages */
}

.detail-editor {
  display: none;
  flex-direction: column;
  flex: 1;
}

.detail-editor.visible {
  display: flex;
}

.detail-editor textarea {
  flex: 1;
  padding: var(--space-md);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  resize: none;
}

.detail-editor-buttons {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-top: 1px solid var(--border-color);
}

/* Resize handle for detail panel */
.skills-detail-resize-handle {
  width: 4px;
  background: var(--border-color);
  cursor: ew-resize;
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
}

.skills-detail-resize-handle:hover {
  background: var(--accent);
}

/* Skills badges */
.skill-status-toggle {
  display: inline-flex;
  align-items: center;
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

/* File tree in detail panel */
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
}
```

## Implementation Checklist

### Phase 1: Basic Structure
- [ ] Add Skills button to rail (index.html)
- [ ] Create page-skills HTML structure
- [ ] Add CSS styles for skills page
- [ ] Implement page switching logic (app.js)
- [ ] Create skills state management (app.js)

### Phase 2: IPC Backend
- [ ] Add skills IPC channels to preload/index.js
- [ ] Implement skill-scanner.js (scan builtin/user/agent skills)
- [ ] Implement IPC handlers in main/ipc-handlers.js
- [ ] Add Hermes config read/write utilities

### Phase 3: Skills Table
- [ ] Load and render skills list per tab
- [ ] Implement table row click → open detail panel
- [ ] Add status toggle functionality
- [ ] Implement action buttons (view/edit/delete/archive)

### Phase 4: Detail Panel
- [ ] Implement detail panel show/hide logic
- [ ] Render SKILL.md content with markdown
- [ ] Implement file tree view
- [ ] Add edit mode for user/agent skills
- [ ] Implement resize handle for panel width

### Phase 5: Toolbar & Filters
- [ ] Implement search input (real-time filtering)
- [ ] Implement category filter dropdown
- [ ] Implement status filter dropdown
- [ ] Add "New Skill" button and dialog
- [ ] Add "Refresh" and "Archive all stale" buttons

### Phase 6: Skill Creation
- [ ] Implement new skill dialog
- [ ] Create skill templates (Feishu, DingTalk, Office)
- [ ] Implement skill creation IPC handler
- [ ] Update config.yaml with new skill

### Phase 7: Testing & Polish
- [ ] Test all three tabs with real skill data
- [ ] Test enable/disable state sync with Hermes
- [ ] Test create/edit/delete/archive operations
- [ ] Verify Hermes Agent compatibility
- [ ] Handle edge cases (missing SKILL.md, invalid frontmatter)

## Open Questions

1. **Monaco Editor vs textarea:** Should we use Monaco Editor for SKILL.md editing (syntax highlighting, autocomplete) or keep it simple with textarea?
2. **Skill templates:** Should templates include CLI-specific commands (like `dws` for DingTalk) or just generic structure?
3. **Batch operations:** Should "Archive all stale" require individual confirmation or single batch confirm?
4. **Skill icons:** Should we use category-specific icons (GitHub, Productivity, etc.) or generic icons?
5. **Usage stats for user skills:** Should user-created skills show usage statistics (like agent skills)?

## Success Criteria

- User can browse all 89+ builtin skills with categories
- User can create, edit, and delete user skills
- User can view and manage agent-generated skills (archive/unarchive)
- Skill enable/disable state syncs with Hermes config.yaml
- Search and filter work across all tabs
- Detail panel shows full SKILL.md content with proper markdown rendering
- Compatible with Hermes Agent's skill_manage tool and curator system