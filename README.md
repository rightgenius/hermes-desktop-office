# Hermes Desktop for Office

A desktop application that bundles Hermes Agent with Feishu (Lark) CLI and DingTalk CLI, providing a unified GUI for AI-powered office automation.

**Mirror**: [GitHub](https://github.com/rightgenius/hermes-desktop-office) | [Gitee](https://gitee.com/nius/hermes-desktop-office)

## Features

- **Built-in Hermes Agent**: Powered by [hermes-agent](https://github.com/nousresearch/hermes-agent)
- **Gateway Management**: GUI for DingTalk/Feishu messaging platforms — auto-detect external Gateway, QR auth, channel list, live logs
- **Feishu CLI bundled**: One-click browser authorization
- **DingTalk CLI bundled**: One-click browser authorization
- **Simple API Token configuration**: Configure your AI provider in the GUI
- **Cross-platform**: macOS (Apple Silicon), Windows, and Linux

## Architecture

```
┌─────────────────────────────────────────┐
│               Electron GUI              │
│  ┌───────────┐ ┌───────────┐ ┌───────┐ │
│  │  API Key  │ │ CLI Auth  │ │ Agent │ │
│  │  Config   │ │  Status   │ │ Log   │ │
│  └───────────┘ └───────────┘ └───────┘ │
│  ┌───────────────────────────────────┐ │
│  │         Gateway Manager           │ │
│  │  Detect │ Start │ Config │ Channels│ │
│  └───────────────────────────────────┘ │
└──────────────┬──────────────────────────┘
               │ IPC
┌──────────────▼──────────────────────────┐
│           Electron Main Process          │
│  ┌────────────┐ ┌──────┐ ┌──────────┐  │
│  │ Hermes CLI │ │lark- │ │   dws    │  │
│  │  (Python)  │ │ cli  │ │   cli    │  │
│  └────────────┘ └──────┘ └──────────┘  │
└─────────────────────────────────────────┘
```

## Bundled Dependencies

| Component | Source | Method |
|-----------|--------|--------|
| Hermes Agent | `src/hermes-agent` (git submodule) | Source code |
| lark-cli | `assets/feishu-cli/` | Prebuilt binary (v1.0.26) |
| dws | `assets/dws-cli/` | Prebuilt binary (v1.0.29) |

## Development

```bash
# Install deps
npm install

# Setup hermes-agent venv
bash scripts/setup-agent.sh

# Download CLI binaries (darwin-arm64, linux-amd64, windows-amd64)
bash scripts/download-clis.sh

# Run in development
npm run dev

# Run unit tests
npx mocha tests/main/test-gateway-manager.js --timeout 10000

# Run E2E tests
npm run test:e2e:gateway

# Build for macOS (Apple Silicon)
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | `push: main` + PRs | Build + test all platforms, upload artifacts |
| `release.yml` | `push: tag (v*)` | Build + test + publish GitHub Release |

This repo is dual-published to **GitHub** and **Gitee** (code mirror). Git remotes are configured with dual push URLs — `git push` sends to both platforms at once.

### Release workflow

```bash
# 1. Bump version and tag
npm version patch
git push origin --follow-tags

# 2. GitHub Actions builds and publishes to GitHub Release
# 3. Sync release notes to Gitee Release (Gitee has 100MB asset limit, so installers link to GitHub)
GITEE_TOKEN=your_gitee_access_token npm run sync:release v0.4.0
```

See [Release Sync Script](scripts/sync-release-to-gitee.sh) for details.

> **Note**: Gitee Release assets are limited to 100MB per file. All installers (140~364MB) link to GitHub; Gitee auto-attaches source archive only.

### Gitee Remote Setup

```bash
# Verify remotes (origin has dual push, github/gitee for single-repo ops)
git remote -v
# origin  git@github.com:rightgenius/hermes-desktop-office.git (fetch)
# origin  git@github.com:rightgenius/hermes-desktop-office.git (push)
# origin  git@gitee.com:nius/hermes-desktop-office.git (push)
# github  git@github.com:rightgenius/hermes-desktop-office.git (fetch/push)
# gitee   git@gitee.com:nius/hermes-desktop-office.git (fetch/push)
```

## Project Structure

```
hermes-desktop-office/
├── src/
│   ├── main/              # Electron main process
│   │   ├── gateway-manager.js  # Gateway lifecycle, config, QR auth, channels
│   │   ├── agent-manager.js    # Agent subprocess management
│   │   └── ipc-handlers.js     # All IPC channel handlers
│   ├── renderer/          # Electron renderer (GUI)
│   ├── preload/           # Electron preload scripts
│   └── hermes-agent/      # Hermes agent source (git submodule)
├── assets/
│   ├── feishu-cli/        # lark-cli binaries per platform
│   └── dws-cli/           # dws-cli binaries per platform
├── scripts/
│   ├── download-clis.sh             # CLI binary downloader (darwin-arm64, linux-amd64, windows-amd64)
│   ├── setup-agent.sh               # Create venv + install hermes-agent deps
│   ├── bundle-agent-deps.sh         # Bundle Python deps for production
│   ├── bundle-python.sh             # Bundle standalone Python 3.13
│   └── sync-release-to-gitee.sh     # Sync GitHub Release notes to Gitee Release
├── tests/
│   ├── main/              # Unit tests (GatewayManager, etc.)
│   └── e2e/               # E2E tests (Playwright + Electron)
├── .github/workflows/
│   ├── ci.yml                # CI on main branch + PRs
│   └── release.yml           # Release on tag push
├── docs/
│   ├── tasks.md
│   └── phase-10-ui-plan.md
└── package.json
```

## License

MIT License — see [LICENSE](LICENSE) for details.
