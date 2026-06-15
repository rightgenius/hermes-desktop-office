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

PYTHON_VERSION="3.13.13"
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
      RUNTIME_ARCH="arm64"
      FILENAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz"
    else
      RUNTIME_ARCH="x86_64"
      FILENAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz"
    fi
    PYTHON_BIN="bin/python3"
    ;;
  windows)
    RUNTIME_ARCH="x86_64"
    FILENAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz"
    PYTHON_BIN="python.exe"
    ;;
  linux)
    RUNTIME_ARCH="x86_64"
    FILENAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz"
    PYTHON_BIN="bin/python3"
    ;;
  *)
    echo "❌ Unsupported platform: $TARGET_PLATFORM"
    exit 1
    ;;
esac

TARGET_ID="${TARGET_PLATFORM}-${RUNTIME_ARCH}-cpython-${PYTHON_VERSION}-${RELEASE_TAG}"
TARGET_FILE="$ASSETS_DIR/.runtime-target"
PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/${FILENAME}"

# Reuse only a runtime downloaded for the exact target. macOS and Linux both
# use bin/python3, so checking the executable path alone can reuse the wrong OS.
CACHED_TARGET=""
if [ -f "$TARGET_FILE" ]; then
  CACHED_TARGET=$(cat "$TARGET_FILE")
fi
if [ "$CACHED_TARGET" = "$TARGET_ID" ] && [ -f "$ASSETS_DIR/$PYTHON_BIN" ]; then
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
  printf '%s\n' "$TARGET_ID" > "$TARGET_FILE"
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
