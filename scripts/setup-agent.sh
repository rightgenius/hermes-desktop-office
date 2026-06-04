#!/bin/bash
# ============================================================================
# Hermes Agent Setup Script
# ============================================================================
# Creates a Python venv and installs dependencies for the hermes-agent
# submodule. This script should be run during development or as part of
# the build process BEFORE the app is packaged.
#
# Usage: bash scripts/setup-agent.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HERMES_DIR="$PROJECT_DIR/src/hermes-agent"

if [ ! -f "$HERMES_DIR/cli.py" ]; then
  echo "❌ hermes-agent submodule not found. Run:"
  echo "   git submodule update --init --recursive"
  exit 1
fi

cd "$HERMES_DIR"

# Check for uv
if ! command -v uv &> /dev/null; then
  echo "⚠️  uv not found. Install it first:"
  echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

# Check if venv already exists (clear if broken)
for VENV_DIR in "venv" ".venv"; do
  if [ -d "$VENV_DIR" ]; then
    # Platform-specific python binary check
    PYTHON_BIN=""
    if [ -f "$VENV_DIR/bin/python3" ]; then
      PYTHON_BIN="$VENV_DIR/bin/python3"
    elif [ -f "$VENV_DIR/Scripts/python.exe" ]; then
      PYTHON_BIN="$VENV_DIR/Scripts/python.exe"
    fi

    if [ -n "$PYTHON_BIN" ]; then
      echo "✅ Checking existing $VENV_DIR..."
      # Verify both core deps AND the messaging platform adapters. Missing
      # adapters makes the gateway start but never connect to DingTalk/Feishu
      # (the user-facing bug this guards against).
      if "$PYTHON_BIN" -c "import yaml, dingtalk_stream, lark_oapi" 2>/dev/null; then
        echo "✅ Dependencies verified. Agent is ready."
        exit 0
      else
        echo "⚠️  $VENV_DIR exists but dependencies incomplete. Clearing..."
        rm -rf "$VENV_DIR"
        break
      fi
    fi
  fi
done

echo "→ Creating Python venv with uv..."
uv venv

echo "→ Installing hermes-agent dependencies (this may take a few minutes)..."
# Install with [dingtalk,feishu] extras so the GUI's spawned gateway can
# actually load the DingTalk/Feishu adapters. Without these, the gateway
# starts but prints "DINGTALK_CLIENT_ID/SECRET not set" / "lark-oapi not
# installed" warnings and never connects to the messaging platforms — the
# UI shows "running" but messages get no response.
uv pip install ".[dingtalk,feishu]" || {
  echo ""
  echo "⚠️  Base install failed. Try manual install:"
  echo "   cd src/hermes-agent && uv venv && uv pip install '.[dingtalk,feishu]'"
  exit 1
}

echo ""
echo "✅ Hermes Agent setup complete!"
echo "   venv: src/hermes-agent/venv"
echo ""
echo "To verify:"
# Platform-specific verification command
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  echo "   src/hermes-agent/venv/Scripts/python.exe -c 'import yaml; print(\"OK\")'"
else
  echo "   src/hermes-agent/venv/bin/python3 -c 'import yaml; print(\"OK\")'"
fi
