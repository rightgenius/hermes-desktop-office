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
- Left rail: 4 SVG icon buttons (chat/settings/auth/logs)
- Middle sidebar: page-specific panels (session list + workspace tree)
- Main area: page content

### Build
- `npm run dev` — development with DevTools
- `npm run build:mac` — prebuild installs venv, then electron-builder
- venv bundled in `extraResources`, unpacked to `Resources/hermes-agent/venv/`

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
