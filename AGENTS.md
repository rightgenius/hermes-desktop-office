# Hermes Desktop for Office — Agent Guide

AI coding assistant instructions for working on this project.

## Project Overview

Electron desktop application bundling Hermes Agent with Feishu (Lark) CLI and DingTalk CLI tools.

## Architecture

```
hermes-desktop-office/
├── src/
│   ├── main/
│   │   ├── index.js              # Electron entry, window lifecycle, graceful shutdown
│   │   ├── ipc-handlers.js       # IPC channels (config, auth, agent, CLI tools, API test)
│   │   ├── agent-manager.js      # Spawn/stop Hermes Agent via bridge.py
│   │   ├── agent-bridge.py       # JSON stdin/stdout bridge for GUI ↔ Agent communication
│   │   └── config-store.js       # JSON config read/write (Electron userData)
│   ├── preload/
│   │   └── index.js              # contextBridge exposing typed API to renderer
│   └── renderer/
│       ├── index.html            # Three-column layout: rail + sidebar + main
│       ├── styles.css            # Dark theme CSS with semantic variables
│       └── app.js                # Frontend logic (nav, settings, auth, chat, logs, wizard)
├── assets/
│   ├── feishu-cli/darwin-arm64/  # lark-cli binary
│   └── dws-cli/darwin-arm64/     # dws binary
├── src/hermes-agent/             # Git submodule — Hermes Agent (DO NOT modify)
├── scripts/
│   ├── setup-agent.sh            # Create venv + install hermes-agent deps
│   └── download-clis.sh          # Download CLI binaries for all platforms
└── docs/
    ├── tasks.md                  # Development task checklist (Phases 1-10)
    └── phase-10-ui-plan.md       # UI redesign plan
```

## Key Patterns

### Configuration
- GUI config: `~/Library/Application Support/hermes-desktop-office/config.json`
- TUI config: `~/.hermes/config.yaml` + `~/.hermes/.env` (completely separate)
- Agent launched with env vars: `OPENAI_API_KEY`, `OPENROUTER_BASE_URL`, `HERMES_INFERENCE_PROVIDER`, `HERMES_INFERENCE_MODEL`

### Agent Communication
- `agent-bridge.py` runs as subprocess, reads JSON from stdin, writes JSON to stdout
- Protocol: `{type: "ready"|"start"|"chunk"|"done"|"error"|"stopped"}`
- Input message format: `{type: "message", content: "user text", history: [{role: "user|assistant", content: "..."}]}`
- Bridge converts `history` to context text and passes to `agent.chat()` with streaming callback
- Never modify `src/hermes-agent/` — it's a git submodule from NousResearch

### Chat Rendering
- `app.js` has a lightweight `renderMarkdown()` function for agent messages (no external deps)
- Supports: code blocks, inline code, tables, headers (h1-h3), bold/italic, links, lists, blockquotes, horizontal rules
- User messages use `escapeHtml()` (plain text); agent messages use `renderMarkdown()` (HTML)
- Streaming messages accumulate raw text in `bubble._rawText` and re-render on each chunk
- Markdown CSS uses semantic variables (`--bg-primary`, `--accent`, `--border-color`)

### Layout
- Top titlebar: logo + status dots
- Left rail: 3 SVG icon buttons (chat/settings/logs) — auth merged into settings page
- Middle sidebar: page-specific panels (session list + workspace tree)
- Main area: page content
- Settings page: card-stacked layout with workspace config + Feishu/DingTalk auth cards

### Session Management
- **Session list**: Horizontal layout with title/time on left, three-dot menu (⋮) on right
- **Menu actions**: 重命名 (custom dialog), 导出 Markdown (native save dialog), 删除 (confirmation)
- **Title tooltip**: Hover over truncated titles shows full text via JS tooltip
- **State sync**: Input area (send/stop buttons) syncs with session streaming state on tab switch
- **Storage**: Sessions stored in localStorage under `hermes-chat-sessions` key

### CLI Auth & Permissions
- **Feishu (lark-cli)**: Device flow auth. `--no-wait` gets device_code, `--device-code` polls (single process, restart invalidates code). JSON output goes to **stderr**. Token stored in `~/.lark-cli/`. Auth status uses `scope` (space-separated string).
- **DingTalk (dws)**: Device flow auth via `--device` flag. URL output to stderr. Token stored in `~/.lark-cli/` (shared config dir). No granular permissions — only `authenticated` status with `corp_id`.
- **Permissions table**: 3 columns (name/description/status). Feishu has 100+ scoped permissions with Chinese descriptions mapped in `app.js`. DingTalk shows single "认证访问" entry.
- **CLI versions**: Displayed via `--version` flag (e.g., `v1.0.26`). Fetched at startup and after auth.
- **download-clis.sh**: Archive extraction uses `find` to locate binary by name (`lark-cli` or `dws`), skipping documentation files (CHANGELOG.md, LICENSE, etc.)

### Build
- `npm run dev` — development with DevTools
- `npm run build:mac` — prebuild installs venv, then electron-builder
- venv bundled in `extraResources`, unpacked to `Resources/hermes-agent/venv/`
- CLI binaries in `assets/` are gitignored, downloaded during build

## Rules

1. **DO NOT modify `src/hermes-agent/`** — it's a submodule. Use `agent-bridge.py` in `src/main/` for GUI integration.
2. Keep existing IDs in HTML/JS — preload API and renderer depend on them.
3. Use semantic CSS variables (`--bg`, `--accent`, `--text`) — don't add hardcoded colors.
4. Test in dev mode before committing: `npm run dev`
5. Each commit = one logical change with descriptive message.

## Setup

```bash
# First time (proxy needed for GitHub submodule)
export https_proxy=socks5://127.0.0.1:7897
git submodule update --init --recursive

# Install dependencies
npm install

# Setup hermes-agent venv
bash scripts/setup-agent.sh

# Download CLI binaries (proxy needed for GitHub releases)
all_proxy=socks5://127.0.0.1:7897 bash scripts/download-clis.sh

# Run
npm run dev
```
