# Hermes Desktop for Office — Agent Guide

AI coding assistant instructions for working on this project.

## Project Overview

Electron desktop application bundling Hermes Agent with Feishu (Lark) CLI, DingTalk CLI tools, and Office document skills (docx/pptx/xlsx).

## Architecture

```
hermes-desktop-office/
├── src/
│   ├── main/
│   │   ├── index.js              # Electron entry, window lifecycle, graceful shutdown
│   │   ├── ipc-handlers.js       # IPC channels (config, auth, agent, CLI tools, skills, API test)
│   │   ├── agent-manager.js      # Spawn/stop Hermes Agent via bridge.py + runtime deps install
│   │   ├── agent-bridge.py       # JSON stdin/stdout bridge for GUI ↔ Agent communication
│   │   ├── config-store.js       # JSON config read/write (Electron userData)
│   │   └── skill-scanner.js      # Scan builtin/user/agent skills with production path resolution
│   ├── preload/
│   │   └── index.js              # contextBridge exposing typed API to renderer
│   └── renderer/
│       ├── index.html            # Three-column layout: rail + sidebar + main
│       ├── styles.css            # Dark theme CSS with semantic variables
│       └── app.js                # Frontend logic (nav, settings, auth, chat, logs, skills, wizard)
├── assets/
│   ├── feishu-cli/darwin-arm64/  # lark-cli binary (gitignored, downloaded during build)
│   ├── dws-cli/darwin-arm64/     # dws binary (gitignored, downloaded during build)
│   ├── icon.png                  # App icon (warm gold #FFE6CC)
│   ├── logo.svg                  # SVG logo source
│   └── python-runtime/           # Standalone Python 3.13 (gitignored, downloaded during build)
├── skills/office/                # Office document skills (version controlled)
│   ├── docx/                     # Word document skill (from anthropics/skills)
│   ├── pptx/                     # PowerPoint skill (from anthropics/skills)
│   ├── xlsx/                     # Excel skill (from anthropics/skills)
│   ├── feishu-cli/               # Feishu CLI skill
│   ├── dingtalk-cli-messaging/   # DingTalk messaging skill
│   └── dws/                      # DingTalk full skill with references + scripts
├── src/hermes-agent/             # Git submodule — Hermes Agent (DO NOT modify)
├── scripts/
│   ├── setup-agent.sh            # Create venv + install hermes-agent deps
│   ├── download-clis.sh          # Download CLI binaries for all platforms (lark-cli + dws-cli)
│   ├── bundle-agent-deps.sh      # Bundle Python deps to hermes-agent/deps/ (incl. office deps)
│   └── bundle-python.sh          # Download standalone Python 3.13 from python-build-standalone
└── docs/
    ├── tasks.md                  # Development task checklist (Phases 1-10)
    └── phase-10-ui-plan.md       # UI redesign plan
```

## Key Patterns

### Configuration
- GUI config: `~/Library/Application Support/hermes-desktop-office/config.json`
- TUI config  config: `~/.hermes/config.yaml` + `~/.hermes/.env` (completely separate)
- Agent launched with env vars: `OPENAI_API_KEY`, `OPENROUTER_BASE_URL`, `HERMES_INFERENCE_PROVIDER`, `HERMES_INFERENCE_MODEL`

### Agent Communication
- `agent-bridge.py` runs as subprocess, reads JSON from stdin, writes JSON to stdout
- Protocol: `{type: "ready"|"start"|"chunk"|"done"|"error"|"stopped"}`
- Input message format: `{type: "message", content: "user text", history: [{role: "user|assistant", content: "..."}]}`
- Bridge converts `history` to context text and passes to `agent.chat()` with streaming callback
- Never modify `src/hermes-agent/` — it's a git submodule from NousResearch

### Python Runtime (Production)
- **Bundled Python**: Standalone Python 3.13.13 from `python-build-standalone` (not system Python 3.9)
- **Bundled deps**: `Resources/hermes-agent/deps/` — 197 packages including hermes-agent + office deps (markitdown, Pillow, openpyxl, pandas)
- **User deps**: `~/.hermes/skills-deps/` — user-writable directory for runtime-installed packages
- **PYTHONPATH priority**: user-deps → bundled-deps → hermes-agent
- **Runtime install**: `agentManager.installSkillDeps(['package1', 'package2'])` installs to user-deps via bundled pip
- **Path resolution**: `agent-manager.js` checks dev path (`src/hermes-agent`) first, then production path (`process.resourcesPath/hermes-agent`)

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

### Skills Management
- **Three tabs**: 内置库 (Builtin), 我的Skills (User), Agent生成 (Agent)
- **Builtin skills**: `src/hermes-agent/skills/` + `optional-skills/` + `skills/office/`
- **User skills**: `~/.agents/skills/`
- **Agent skills**: `~/.hermes/skills/` (excluding entries from `.bundled_manifest`)
- **Path column**: All tables show skill source path with hover tooltip (custom JS tooltip, not native `title`)
- **Row click**: Opens detail panel directly (no separate view button)
- **Status sync**: Toggle switches synced to `~/.hermes/config.yaml` enabled/disabled lists
- **Production path**: `skill-scanner.js` checks multiple locations: `app.asar.unpacked/skills` → `Resources/skills` → project root `skills`

### CLI Auth & Permissions
- **Feishu (lark-cli)**: Device flow auth. `--no-wait` gets device_code, `--device-code` polls (single process, restart invalidates code). JSON output goes to **stderr**. Token stored in `~/.lark-cli/`. Auth status uses `scope` (space-separated string).
- **DingTalk (dws)**: Device flow auth via `--device` flag. URL output to stderr. Token stored in `~/.lark-cli/` (shared config dir). No granular permissions — only `authenticated` status with `corp_id`.
- **Permissions table**: 3 columns (name/description/status). Feishu has 100+ scoped permissions with Chinese descriptions mapped in `app.js`. DingTalk shows single "认证访问" entry.
- **CLI versions**: Displayed via `--version` flag (e.g., `v1.0.26`). Fetched at startup and after auth.
- **download-clis.sh**: Downloads from GitHub releases — lark-cli from `larksuite/cli`, dws-cli from `DingTalk-Real-AI/dingtalk-workspace-cli`. Archive extraction uses `find` to locate binary by name, skipping documentation files.

### Build
- `npm run dev` — development with DevTools
- `npm run build:mac` — prebuild bundles Python runtime + agent deps, then electron-builder
- **asarUnpack**: `agent-bridge.py`, CLI binaries (`lark-cli`, `dws`), and `skills/` are unpacked from asar for external process access
- **extraResources**: `hermes-agent/` (from submodule), `python-runtime/` (standalone Python 3.13)
- CLI binaries and python-runtime are gitignored, downloaded during build
- Office skills (`skills/office/`) are version controlled and bundled via `files` in package.json

## Rules

1. **DO NOT modify `src/hermes-agent/`** — it's a submodule. Use `agent-bridge.py` in `src/main/` for GUI integration.
2. Keep existing IDs in HTML/JS — preload API and renderer depend on them.
3. Use semantic CSS variables (`--bg`, `--accent`, `--text`) — don't add hardcoded colors.
4. Test in dev mode before committing: `npm run dev`
5. Each commit = one logical change with descriptive message.
6. **Python dependencies**: New skill deps should be added to `scripts/bundle-agent-deps.sh` for bundling, or installed at runtime via `agentManager.installSkillDeps()`.
7. **Skills**: Office skills from `anthropics/skills` are source-available (proprietary license). Keep them in `skills/office/` under version control.

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
