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

# Check if venv already exists
if [ -d "venv" ] && [ -f "venv/bin/python3" ]; then
  echo "✅ venv already exists. Checking dependencies..."
  # Quick check: does yaml module exist?
  if "venv/bin/python3" -c "import yaml" 2>/dev/null; then
    echo "✅ Dependencies verified. Agent is ready."
    exit 0
  else
    echo "⚠️  venv exists but dependencies incomplete. Reinstalling..."
    rm -rf venv
  fi
fi

echo "→ Creating Python venv with uv..."
uv venv

echo "→ Installing hermes-agent dependencies (this may take a few minutes)..."
uv pip install "." || {
  echo ""
  echo "⚠️  Base install failed. Try manual install:"
  echo "   cd src/hermes-agent && uv venv && uv pip install ."
  exit 1
}

echo ""
echo "✅ Hermes Agent setup complete!"
echo "   venv: src/hermes-agent/venv"
echo ""
echo "To verify:"
echo "   src/hermes-agent/venv/bin/python3 -c 'import yaml; print(\"OK\")'"
