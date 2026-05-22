#!/bin/bash
# ============================================================================
# Bundle Standalone Python for Production
# ============================================================================
# Downloads a portable Python runtime from python-build-standalone
# and places it in assets/python-runtime/ for bundling with the app.
#
# Usage: bash scripts/bundle-python.sh [platform]
#   platform: auto-detect (default), macos, windows, linux
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_DIR/assets/python-runtime"

RELEASE_TAG="20260510"

# Determine target platform
TARGET_PLATFORM="${1:-auto}"
if [ "$TARGET_PLATFORM" = "auto" ]; then
  OS_NAME=$(uname -s)
  ARCH=$(uname -m)
  case "$OS_NAME" in
    Darwin)  TARGET_PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) TARGET_PLATFORM="windows" ;;
    Linux) TARGET_PLATFORM="linux" ;;
    *) echo "❌ Unsupported OS: $OS_NAME"; exit 1 ;;
  esac
fi

case "$TARGET_PLATFORM" in
  macos)
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
      FILENAME="cpython-3.13.13+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz"
    else
      FILENAME="cpython-3.13.13+${RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz"
    fi
    PYTHON_BIN="bin/python3"
    ;;
  windows)
    FILENAME="cpython-3.13.13+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz"
    PYTHON_BIN="python.exe"
    ;;
  linux)
    FILENAME="cpython-3.13.13+${RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz"
    PYTHON_BIN="bin/python3"
    ;;
  *)
    echo "❌ Unsupported platform: $TARGET_PLATFORM"
    exit 1
    ;;
esac

PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/${FILENAME}"

# Check if already downloaded
if [ -f "$ASSETS_DIR/$PYTHON_BIN" ]; then
  echo "✅ Python runtime already bundled at assets/python-runtime/ ($TARGET_PLATFORM)"
  "$ASSETS_DIR/$PYTHON_BIN" --version
  exit 0
fi

echo "→ Downloading standalone Python for $TARGET_PLATFORM..."
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"

TEMP_DIR=$(mktemp -d)
curl -L -o "$TEMP_DIR/python.tar.gz" "$PYTHON_URL"

echo "→ Extracting Python runtime..."
tar -xzf "$TEMP_DIR/python.tar.gz" -C "$TEMP_DIR"

# The extract creates a 'python' directory
if [ -d "$TEMP_DIR/python" ]; then
  cp -R "$TEMP_DIR/python"/* "$ASSETS_DIR/"
else
  echo "❌ Failed to find python directory in extracted archive"
  ls -la "$TEMP_DIR"
  exit 1
fi

# Clean up
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Python runtime bundled to assets/python-runtime/ ($TARGET_PLATFORM)"
"$ASSETS_DIR/$PYTHON_BIN" --version
