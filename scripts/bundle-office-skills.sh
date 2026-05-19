#!/bin/bash
# ============================================================================
# Copy Office Skills from ~/.hermes/skills to assets/skills/ for bundling
# ============================================================================
# This script copies feishu-cli, dingtalk-cli-messaging, and dws skills
# from the user's ~/.hermes/skills directory to assets/skills/office/
# so they can be bundled with the app.
#
# Usage: bash scripts/bundle-office-skills.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HERMES_SKILLS="$HOME/.hermes/skills"
ASSETS_SKILLS="$PROJECT_DIR/assets/skills/office"

# Check if source skills exist
if [ ! -d "$HERMES_SKILLS" ]; then
  echo "⚠️  ~/.hermes/skills not found, skipping office skills bundle"
  exit 0
fi

# Create target directory
mkdir -p "$ASSETS_SKILLS"

# Copy feishu-cli skill
if [ -d "$HERMES_SKILLS/productivity/feishu-cli" ]; then
  echo "→ Copying feishu-cli skill..."
  mkdir -p "$ASSETS_SKILLS/feishu-cli"
  cp "$HERMES_SKILLS/productivity/feishu-cli/SKILL.md" "$ASSETS_SKILLS/feishu-cli/"
  cp -r "$HERMES_SKILLS/productivity/feishu-cli/scripts" "$ASSETS_SKILLS/feishu-cli/" 2>/dev/null || true
  echo "  ✓ feishu-cli copied"
fi

# Copy dingtalk-cli-messaging skill
if [ -d "$HERMES_SKILLS/productivity/dingtalk-cli-messaging" ]; then
  echo "→ Copying dingtalk-cli-messaging skill..."
  mkdir -p "$ASSETS_SKILLS/dingtalk-cli-messaging"
  cp "$HERMES_SKILLS/productivity/dingtalk-cli-messaging/SKILL.md" "$ASSETS_SKILLS/dingtalk-cli-messaging/"
  echo "  ✓ dingtalk-cli-messaging copied"
fi

# Copy dws skill
if [ -d "$HERMES_SKILLS/dws" ]; then
  echo "→ Copying dws skill..."
  mkdir -p "$ASSETS_SKILLS/dws"
  cp "$HERMES_SKILLS/dws/SKILL.md" "$ASSETS_SKILLS/dws/"
  cp -r "$HERMES_SKILLS/dws/references" "$ASSETS_SKILLS/dws/" 2>/dev/null || true
  cp -r "$HERMES_SKILLS/dws/scripts" "$ASSETS_SKILLS/dws/" 2>/dev/null || true
  echo "  ✓ dws copied"
fi

echo ""
echo "✅ Office skills bundled to assets/skills/office/"
ls "$ASSETS_SKILLS"
