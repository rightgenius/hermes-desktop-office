#!/bin/bash
# ============================================================================
# Bundle Hermes Agent Python Dependencies for Production
# ============================================================================
# Installs hermes-agent and all dependencies into a portable deps/ directory
# using pip install --target. This directory is then bundled with the app.
#
# Usage: bash scripts/bundle-agent-deps.sh [platform]
#   platform: auto (default) — uses current system Python
#             macos, windows, linux — downloads platform-specific wheels
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

# Determine target platform
TARGET_PLATFORM="${1:-auto}"
if [ "$TARGET_PLATFORM" = "auto" ]; then
  OS_NAME=$(uname -s)
  case "$OS_NAME" in
    Darwin)  TARGET_PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) TARGET_PLATFORM="windows" ;;
    Linux) TARGET_PLATFORM="linux" ;;
    *) echo "❌ Unsupported OS: $OS_NAME"; exit 1 ;;
  esac
fi

# Map platform to pip --platform values
PIP_PLATFORM=""
PIP_ONLY_BINARY=""
PYTHON_CMD="python3"

case "$TARGET_PLATFORM" in
  macos)
    # Native build — no platform override needed
    ;;
  windows)
    PIP_PLATFORM="win_amd64"
    PIP_ONLY_BINARY=":all:"
    ;;
  linux)
    PIP_PLATFORM="manylinux2014_x86_64"
    PIP_ONLY_BINARY=":all:"
    ;;
  auto)
    # Native install — no platform override
    ;;
esac

echo "→ Installing hermes-agent dependencies to deps/ ..."
echo "  (this may take a few minutes)"
echo "  platform: $TARGET_PLATFORM"

# Clean existing deps
rm -rf "$DEPS_DIR"

# Install base deps
$PYTHON_CMD -m pip install --target "$DEPS_DIR" --upgrade pip setuptools wheel

if [ -n "$PIP_PLATFORM" ]; then
  # For cross-platform builds, we can't install a local directory with --only-binary.
  # Build a wheel first, then install it with platform constraints.
  echo "  Building hermes-agent wheel for $TARGET_PLATFORM..."
  WHEEL_DIR=$(mktemp -d)
  $PYTHON_CMD -m pip wheel --no-deps --wheel-dir "$WHEEL_DIR" "$HERMES_DIR"
  WHEEL_FILE=$(find "$WHEEL_DIR" -name "*.whl" | head -1)
  if [ -z "$WHEEL_FILE" ]; then
    echo "❌ Failed to build hermes-agent wheel"
    rm -rf "$WHEEL_DIR"
    exit 1
  fi
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp "$WHEEL_FILE"
  rm -rf "$WHEEL_DIR"
else
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" "$HERMES_DIR"
fi

echo ""
echo "→ Installing office skills dependencies (markitdown, Pillow, openpyxl, pandas) ..."
if [ -n "$PIP_PLATFORM" ]; then
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp "markitdown[pptx]" Pillow openpyxl pandas
else
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" "markitdown[pptx]" Pillow openpyxl pandas
fi

echo ""
echo "✅ Dependencies bundled to src/hermes-agent/deps/ ($TARGET_PLATFORM)"
echo "   $(ls "$DEPS_DIR" | wc -l | tr -d ' ') packages installed"
