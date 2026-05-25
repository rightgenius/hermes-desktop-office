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
#
# Reproducible builds:
#   A lock file (scripts/bundled-requirements-lock.txt) is generated after every
#   native (macOS) install. Subsequent native builds use it via pip -r for
#   deterministic dependency resolution. Cross-platform builds use a constraints
#   file (scripts/bundled-constraints.txt) to pin critical transitive deps.
#   Run with FORCE_RELOCK=1 to regenerate the lock file from scratch.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HERMES_DIR="$PROJECT_DIR/src/hermes-agent"
DEPS_DIR="$HERMES_DIR/deps"
CONSTRAINTS_FILE="$PROJECT_DIR/scripts/bundled-constraints.txt"
LOCK_FILE="$PROJECT_DIR/scripts/bundled-requirements-lock.txt"

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

# Build constraints argument (platform-independent version limits)
CONSTRAINTS_ARG=""
if [ -f "$CONSTRAINTS_FILE" ]; then
  CONSTRAINTS_ARG="-c $CONSTRAINTS_FILE"
fi

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
  # Use constraints file to pin critical transitive deps (e.g. websockets)
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp $CONSTRAINTS_ARG "$WHEEL_FILE"
  rm -rf "$WHEEL_DIR"
else
  # Native install: use lock file as constraint (pins versions but allows new deps)
  if [ -f "$LOCK_FILE" ] && [ "${FORCE_RELOCK:-0}" != "1" ]; then
    echo "  Using lock file as constraint: $LOCK_FILE"
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" -c "$LOCK_FILE" "$HERMES_DIR"
  else
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" $CONSTRAINTS_ARG "$HERMES_DIR"
  fi
fi

echo ""
echo "→ Installing office skills dependencies (markitdown, Pillow, openpyxl, pandas) ..."
if [ -n "$PIP_PLATFORM" ]; then
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp $CONSTRAINTS_ARG "markitdown[pptx]" Pillow openpyxl pandas
else
  $PYTHON_CMD -m pip install --target "$DEPS_DIR" $CONSTRAINTS_ARG "markitdown[pptx]" Pillow openpyxl pandas
fi

echo ""
echo "✅ Dependencies bundled to src/hermes-agent/deps/ ($TARGET_PLATFORM)"
echo "   $(ls "$DEPS_DIR" | wc -l | tr -d ' ') packages installed"

# After native install, regenerate lock file from resolved versions
# Exclude local packages (hermes-agent) and build tools (pip, setuptools, wheel)
# since they come from the submodule or are installed separately.
if [ -z "$PIP_PLATFORM" ]; then
  echo "  Regenerating lock file: $LOCK_FILE"
  $PYTHON_CMD -c "
import sys
sys.path.insert(0, '$DEPS_DIR')
import pkg_resources
import re
with open('$LOCK_FILE', 'w') as f:
    for dist in pkg_resources.working_set:
        name = dist.project_name.lower().replace('-', '_')
        # Skip local packages and build tools
        if name in ('hermes_agent', 'pip', 'setuptools', 'wheel'):
            continue
        f.write(f'{dist.project_name}=={dist.version}\n')
" 2>/dev/null || $PYTHON_CMD -m pip freeze --path "$DEPS_DIR" | grep -v -i "^hermes-agent\|^pip==\|^setuptools==\|^wheel==" > "$LOCK_FILE"
  echo "  $(wc -l < "$LOCK_FILE" | tr -d ' ') packages frozen"
fi
