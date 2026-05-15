# Workspace 功能设计文档

**Date**: 2026-05-15
**Status**: Approved

## Overview

将 workspace 从静态占位符升级为真实可用的功能，支持每个会话独立的目录选择、文件浏览、文本预览和非文本文件打开。

## Layout

```
[rail] [sidebar: sessions] [main: chat] [workspace: tree + preview]
```

- **Rail**: 保留左侧导航（chat/settings/logs）
- **Sidebar**: 会话列表（当前宽度 ~240px）
- **Main**: 对话区域
- **Workspace**: 新增第四栏（默认 320px，可拖拽调整宽度）

## Workspace Panel Structure

```
┌─────────────────────────┐
│ Workspace Header        │
│ [路径选择] [刷新] [折叠] │
├─────────────────────────┤
│ Directory Tree          │
│ 📁 src/                 │
│   📄 app.js             │
│   📄 index.html         │
│ 📁 docs/                │
│   📄 README.md          │
│ ...                     │
├─────────────────────────┤
│ File Preview (Tabs)     │
│ [app.js] [README.md] [+]│
│ ─────────────────────── │
│ // 文件内容预览          │
│ import { foo } from...  │
│ ...                     │
└─────────────────────────┘
```

## Data Flow

### Configuration Storage

- **Global default path**: Stored in `config.json` as `defaultWorkspacePath`
- **Session override**: Each session object gains `workspacePath` field

### Session Data Model

```javascript
{
  id: 'session-xxx',
  title: '对话标题',
  created: 1234567890,
  workspacePath: '/path/to/workspace',  // NEW: session-level workspace
  messages: [...]
}
```

### IPC Interfaces

```javascript
// List directory contents
ipcMain.handle('workspace-list', async (_, { path, recursive = false }) => {
  // Returns file list
});

// Read file content
ipcMain.handle('workspace-read', async (_, { path }) => {
  // Returns file content
});

// Open file with system default app
ipcMain.handle('workspace-open', async (_, { path }) => {
  shell.openPath(path);
});
```

## File Handling

### Text Files (Preview Supported)
- txt, md, json, yaml, yml
- py, js, ts, tsx, jsx
- html, css, scss, xml
- sql, sh, bash, zsh
- gitignore, dockerfile, makefile
- and other common text formats

### Non-Text Files
- Click opens file with system default program via `shell.openPath()`

## Directory Tree Loading

- **Hybrid mode**: Load first level initially, load subdirectories on expand
- **Max height**: 50% of workspace panel to keep session list visible
- **Collapsible**: Directory tree can be collapsed/expanded

## File Preview

- **Multi-tab**: Support multiple open file tabs
- **Syntax highlighting**: Optional (can use basic text display initially)
- **Tab management**: Close individual tabs, close all tabs

## Implementation Phases

### Phase 1: Core Infrastructure
- Add IPC handlers for workspace operations
- Update session data model to support `workspacePath`
- Add global default workspace path to config

### Phase 2: UI Components
- Add workspace panel to HTML layout
- Implement directory tree rendering
- Implement file preview with multi-tab support
- Add resize handle between panels

### Phase 3: Integration
- Connect workspace panel to session management
- Implement workspace path selection per session
- Sync workspace state with current session

### Phase 4: Polish
- File type detection and icon display
- Syntax highlighting for text preview
- Error handling for file operations
- Keyboard shortcuts

## File Structure Changes

### Modified Files
- `src/renderer/index.html` - Add workspace panel structure
- `src/renderer/styles.css` - Add workspace panel styles, resize handles
- `src/renderer/app.js` - Add workspace logic, file preview, tab management
- `src/main/ipc-handlers.js` - Add workspace IPC handlers
- `src/preload/index.js` - Expose workspace APIs to renderer
- `src/main/config-store.js` - Add defaultWorkspacePath support

### New Files
- None (all changes in existing files)

## Constraints

1. Keep existing IDs in HTML/JS — preload API and renderer depend on them
2. Use semantic CSS variables (`--bg`, `--accent`, `--text`) — don't add hardcoded colors
3. DO NOT modify `src/hermes-agent/` — it's a submodule
4. Test in dev mode before committing: `npm run dev`
