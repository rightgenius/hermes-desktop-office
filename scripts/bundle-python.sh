#!/bin/bash
# ============================================================================
# Bundle Standalone Python for Production
# ============================================================================
# Downloads a portable Python runtime from python-build-standalone
# and places it in assets/python-runtime/ for bundling with the app.
#
# Usage: bash scripts/bundle-python.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_DIR/assets/python-runtime"

RELEASE_TAG="20260510"
ARCH=$(uname -m)

if [ "$ARCH" = "arm64" ]; then
  FILENAME="cpython-3.13.13+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz"
elif [ "$ARCH" = "x86_64" ]; then
  FILENAME="cpython-3.13.13+${RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz"
else
  echo "❌ Unsupported architecture: $ARCH"
  exit 1
fi

PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/${FILENAME}"

# Check if already downloaded
if [ -f "$ASSETS_DIR/bin/python3" ]; then
  echo "✅ Python runtime already bundled at assets/python-runtime/"
  "$ASSETS_DIR/bin/python3" --version
  exit 0
fi

echo "→ Downloading standalone Python for ${ARCH}..."
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
echo "✅ Python runtime bundled to assets/python-runtime/"
"$ASSETS_DIR/bin/python3" --version
