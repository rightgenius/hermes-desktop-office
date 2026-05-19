#!/bin/bash
# ============================================================================
# Bundle Hermes Agent Python Dependencies for Production
# ============================================================================
# Installs hermes-agent and all dependencies into a portable deps/ directory
# using pip install --target. This directory is then bundled with the app.
#
# Usage: bash scripts/bundle-agent-deps.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HERMES_DIR="$PROJECT_DIR/src/hermes-agent"
DEPS_DIR="$HERMES_DIR/deps"

if [ ! -f "$HERMES_DIR/cli.py" ]; then
  echo "❌ hermes-agent submodule not found."
  exit 1
fi

# Check for Python3
if ! command -v python3 &> /dev/null; then
  echo "❌ python3 not found."
  exit 1
fi

echo "→ Installing hermes-agent dependencies to deps/ ..."
echo "  (this may take a few minutes)"

# Clean existing deps
rm -rf "$DEPS_DIR"

# Install to target directory
python3 -m pip install --target "$DEPS_DIR" --upgrade pip setuptools wheel
python3 -m pip install --target "$DEPS_DIR" "$HERMES_DIR"

echo ""
echo "✅ Dependencies bundled to src/hermes-agent/deps/"
echo "   $(ls "$DEPS_DIR" | wc -l | tr -d ' ') packages installed"
