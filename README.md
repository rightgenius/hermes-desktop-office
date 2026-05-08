# Hermes Desktop for Office

A desktop application that bundles Hermes Agent with Feishu (Lark) CLI and DingTalk CLI, providing a unified GUI for AI-powered office automation.

## Features

- **Built-in Hermes Agent**: Powered by [hermes-agent](https://github.com/nousresearch/hermes-agent)
- **Feishu CLI bundled**: One-click browser authorization
- **DingTalk CLI bundled**: One-click browser authorization
- **Simple API Token configuration**: Configure your AI provider in the GUI
- **Cross-platform**: macOS and Windows support

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
| lark-cli | `assets/feishu-cli/` | Prebuilt binary (v1.0.24) |
| dws | `assets/dws-cli/` | Prebuilt binary (v1.0.21) |

## Development

```bash
# Install deps
npm install

# Download CLI binaries
npm run download-clis

# Run in development
npm run dev

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win
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
│   └── download-clis.sh   # CLI binary downloader
├── docs/
│   └── development-plan.md
└── package.json
```

## License

MIT License — see [LICENSE](LICENSE) for details.
