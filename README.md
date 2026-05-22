# Hermes Desktop for Office

A desktop application that bundles Hermes Agent with Feishu (Lark) CLI and DingTalk CLI, providing a unified GUI for AI-powered office automation.

## Features

- **Built-in Hermes Agent**: Powered by [hermes-agent](https://github.com/nousresearch/hermes-agent)
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

Push a tag to release:
```bash
npm version patch  # bumps version
git tag v0.3.1
git push origin main --tags
```

## Project Structure

```
hermes-desktop-office/
├── src/
│   ├── main/              # Electron main process
│   ├── renderer/          # Electron renderer (GUI)
│   ├── preload/           # Electron preload scripts
│   └── hermes-agent/      # Hermes agent source (git submodule)
├── assets/
│   ├── feishu-cli/        # lark-cli binaries per platform
│   └── dws-cli/           # dws-cli binaries per platform
├── scripts/
│   ├── download-clis.sh      # CLI binary downloader (darwin-arm64, linux-amd64, windows-amd64)
│   ├── setup-agent.sh        # Create venv + install hermes-agent deps
│   ├── bundle-agent-deps.sh  # Bundle Python deps for production
│   └── bundle-python.sh      # Bundle standalone Python 3.13
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
