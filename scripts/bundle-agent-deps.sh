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
  # Some Alibaba Cloud transitive dependencies publish only sdists even though
  # they are pure Python. Cross-platform installs require --only-binary, so
  # build local py3-none-any wheels and expose them through --find-links.
  $PYTHON_CMD -m pip wheel --no-deps --wheel-dir "$WHEEL_DIR" \
    "alibabacloud-endpoint-util==0.0.4" \
    "alibabacloud-gateway-dingtalk==1.0.2" \
    "alibabacloud-gateway-spi==0.0.3" \
    "alibabacloud-credentials-api==1.0.0" \
    "alibabacloud-tea==0.4.3"
  WHEEL_FILE=$(find "$WHEEL_DIR" -name "*.whl" | grep -i "hermes_agent" | head -1)
  if [ -z "$WHEEL_FILE" ]; then
    echo "❌ Failed to build hermes-agent wheel"
    rm -rf "$WHEEL_DIR"
    exit 1
  fi
  PIP_WHEEL_FILE="$WHEEL_FILE"
  PIP_WHEEL_DIR="$WHEEL_DIR"
  PIP_BASE_REQS_FILE="$WHEEL_DIR/hermes-cross-requirements.txt"
  "$PYTHON_CMD" - "$HERMES_DIR/pyproject.toml" > "$PIP_BASE_REQS_FILE" <<'PY'
import sys

inside = False
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    for raw in fh:
        line = raw.strip()
        if not inside:
            if line == "dependencies = [":
                inside = True
            continue
        if line == "]":
            break
        if not line.startswith('"'):
            continue
        dep = line.split("#", 1)[0].strip().rstrip(",").strip().strip('"')
        if dep:
            print(dep.replace("uvicorn[standard]", "uvicorn"))
PY
  if [ "$TARGET_PLATFORM" = "windows" ] && command -v cygpath >/dev/null 2>&1; then
    PIP_WHEEL_FILE=$(cygpath -w "$WHEEL_FILE")
    PIP_WHEEL_DIR=$(cygpath -w "$WHEEL_DIR")
    PIP_BASE_REQS_FILE=$(cygpath -w "$PIP_BASE_REQS_FILE")
  fi
  # Use constraints file to pin critical transitive deps (e.g. websockets).
  # Pip's handling of extras appended to a wheel filename is inconsistent
  # across environments, so install Hermes plus the bundled gateway extras
  # explicitly instead of relying on "$wheel[dingtalk,feishu]".
  if [ "$TARGET_PLATFORM" = "windows" ]; then
    # Pip evaluates uvicorn[standard]'s sys_platform markers against the host
    # during cross-platform resolution, which makes Windows builds try to
    # resolve uvloop. Install the Hermes wheel without deps, then install the
    # project dependencies with uvicorn's optional "standard" extra stripped.
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp --find-links "$PIP_WHEEL_DIR" --no-deps "$PIP_WHEEL_FILE"
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp --find-links "$PIP_WHEEL_DIR" $CONSTRAINTS_ARG -r "$PIP_BASE_REQS_FILE" \
      "dingtalk-stream==0.24.3" \
      "alibabacloud-dingtalk==2.2.42" \
      "lark-oapi==1.5.3" \
      "qrcode==7.4.2"
  else
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" --platform "$PIP_PLATFORM" --only-binary "$PIP_ONLY_BINARY" --python-version 3.13 --implementation cp --find-links "$PIP_WHEEL_DIR" $CONSTRAINTS_ARG "$PIP_WHEEL_FILE" \
      "dingtalk-stream==0.24.3" \
      "alibabacloud-dingtalk==2.2.42" \
      "lark-oapi==1.5.3" \
      "qrcode==7.4.2"
  fi
  rm -rf "$WHEEL_DIR"
else
  # Native install: use lock file as constraint (pins versions but allows new deps)
  if [ -f "$LOCK_FILE" ] && [ "${FORCE_RELOCK:-0}" != "1" ]; then
    echo "  Using lock file as constraint: $LOCK_FILE"
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" -c "$LOCK_FILE" "$HERMES_DIR[dingtalk,feishu]"
  else
    $PYTHON_CMD -m pip install --target "$DEPS_DIR" $CONSTRAINTS_ARG "$HERMES_DIR[dingtalk,feishu]"
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
