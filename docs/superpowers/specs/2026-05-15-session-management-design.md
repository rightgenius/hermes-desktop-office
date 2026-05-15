# Session Management Features Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Overview

Add delete, rename, and export capabilities to each session item in the sidebar, triggered via a three-dot menu (⋮).

## Features

### 1. Three-Dot Menu (⋮)

- Each session item shows a ⋮ icon on the right side
- Clicking opens a dropdown menu with three options:
  - **重命名** (Rename)
  - **导出 Markdown** (Export Markdown)
  - **删除** (Delete)
- Menu closes when clicking outside or selecting an option
- Only one menu open at a time

### 2. Rename (Dialog/Prompt)

- Clicking "重命名" opens a native `prompt()` dialog
- Pre-filled with current session title
- Enter to confirm, Escape to cancel
- Updates session title in localStorage and re-renders session list
- Empty names are rejected (shows alert)

### 3. Export Markdown

- Clicking "导出 Markdown" generates a `.md` file from session messages
- Format:
  ```markdown
  # Session Title
  Created: 2024-01-01 12:00

  ## User
  Hello world

  ## Assistant
  Hi there! How can I help you?
  ```
- Uses Electron's `dialog.showSaveDialog()` via IPC to let user choose save location
- Falls back to browser download (Blob + URL.createObjectURL) if IPC unavailable
- Exports all messages in order: user messages as `## User`, agent messages as `## Assistant`
- Includes reasoning content if present (as blockquote)
- Includes tool call results if present (as code block)

### 4. Delete (Confirmation Dialog)

- Clicking "删除" shows a confirmation dialog using `confirm()`
- Message: "确定要删除此会话吗？此操作无法撤销。"
- Only deletes if user confirms
- If deleting the currently active session:
  - Clears chat messages area
  - Resets `currentSessionId` to null
  - Shows empty state
- Removes session from localStorage and re-renders session list

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/app.js` | Add menu rendering, event handlers, export logic, delete/rename functions |
| `src/renderer/styles.css` | Add dropdown menu styles, menu button hover states |
| `src/preload/index.js` | Expose `sessionExport` IPC channel |
| `src/main/ipc-handlers.js` | Add IPC handler for save dialog |

### Data Flow

1. Menu rendered as part of `renderSessionList()` template
2. Event delegation on session list container for menu button clicks
3. Dropdown positioned absolutely relative to session item
4. All operations update localStorage via `saveSessions()`
5. Export uses IPC to main process for native save dialog

### Session Data Model (Unchanged)

```javascript
{
  id: 'session-1234567890',
  messages: [
    { text, sender, timestamp, reasoning, toolCalls }
  ],
  created: 1234567890,
  title: 'Session title'
}
```

### New Functions to Add

| Function | Purpose |
|----------|---------|
| `renderSessionMenu(sessionId)` | Returns HTML for the three-dot menu |
| `openSessionMenu(sessionId, event)` | Shows dropdown menu at click position |
| `closeSessionMenu()` | Closes any open menu |
| `renameSession(sessionId)` | Prompts for new name, updates session |
| `exportSessionMarkdown(sessionId)` | Generates markdown and triggers save |
| `deleteSession(sessionId)` | Confirms and deletes session |
| `formatSessionMarkdown(session)` | Converts session data to markdown string |

### CSS Additions

```css
.session-menu-btn {
  /* Three-dot button styling */
}

.session-menu-dropdown {
  /* Dropdown positioning and styling */
  position: absolute;
  right: 8px;
  top: 24px;
  z-index: 100;
}

.session-menu-item {
  /* Menu item styling */
}

.session-menu-item:hover {
  /* Hover state */
}
```

## Testing Plan

1. **Rename**: Rename session, verify title updates, verify empty name rejected
2. **Export**: Export session with text/reasoning/tools, verify markdown format, verify file saved
3. **Delete**: Delete non-active session (verify list updates), delete active session (verify chat clears)
4. **Menu**: Open menu, click outside to close, open another menu (previous closes)
5. **Edge cases**: Delete last session, export empty session, rename to same name

## Out of Scope

- Import sessions from file
- Bulk operations (delete multiple sessions)
- Session search/filter
- Session pinning/favorites
- Session tags/categories
