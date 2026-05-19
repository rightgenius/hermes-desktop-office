#!/usr/bin/env bash
# Download bundled CLI binaries for supported platforms
# Usage: ./scripts/download-clis.sh [--clean]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_DIR/assets"

LARK_CLI_VERSION="1.0.26"
DWS_CLI_VERSION="1.0.21"

# Determine platforms
PLATFORMS=("darwin-arm64" "darwin-amd64" "linux-amd64" "windows-amd64")

clean_assets() {
    echo "Cleaning assets directory..."
    rm -rf "$ASSETS_DIR/feishu-cli" "$ASSETS_DIR/dws-cli"
    mkdir -p "$ASSETS_DIR/feishu-cli" "$ASSETS_DIR/dws-cli"
}

download_bin() {
    local platform="$1"
    local version="$2"
    local out_dir="$3"
    local bin_name="$4"

    local out_path="$out_dir/$platform"
    mkdir -p "$out_path"

    local final_bin="$out_path/$bin_name"
    if [[ -f "$final_bin" ]]; then
        echo "  ✓ $platform/$bin_name already exists, skipping"
        return
    fi

    # lark-cli uses: lark-cli-VERSION-PLATFORM.tar.gz
    local ext="tar.gz"
    if [[ "$platform" == windows-* ]]; then
        ext="zip"
    fi
    local url="https://github.com/larksuite/cli/releases/download/v$version/lark-cli-$version-$platform.$ext"
    echo "  Downloading $url ..."

    local tmp_file="/tmp/cli-tmp-$$.$ext"
    if command -v curl &>/dev/null; then
        curl -fSL --connect-timeout 10 --max-time 120 -o "$tmp_file" "$url" || {
            echo "  ✗ Failed to download $platform"
            return 1
        }
    else
        wget -q -O "$tmp_file" "$url" || {
            echo "  ✗ Failed to download $platform"
            return 1
        }
    fi

    # Extract to temp dir first, then find the actual binary
    local tmp_dir="/tmp/cli-extract-$$-$platform"
    mkdir -p "$tmp_dir"

    if [[ "$ext" == "zip" ]]; then
        unzip -o "$tmp_file" -d "$tmp_dir"
    else
        tar -xzf "$tmp_file" -C "$tmp_dir"
    fi
    rm -f "$tmp_file"

    # Find the actual binary (skip documentation files, look for executable or specific name)
    local extracted_bin
    if [[ "$platform" == windows-* ]]; then
        extracted_bin=$(find "$tmp_dir" -name "*.exe" -type f | head -1)
    else
        # Prefer files named 'lark-cli' or 'dws' (the actual binaries)
        extracted_bin=$(find "$tmp_dir" -type f -name "lark-cli" -o -name "dws" | head -1)
        # Fallback: find any executable file (skip docs)
        if [[ -z "$extracted_bin" ]]; then
            extracted_bin=$(find "$tmp_dir" -type f ! -name "*.md" ! -name "LICENSE" ! -name "*.txt" ! -name "CHANGELOG" ! -name "README" | head -1)
        fi
    fi

    if [[ -n "$extracted_bin" ]]; then
        cp "$extracted_bin" "$final_bin"
    else
        echo "  ✗ No binary found in archive for $platform"
        rm -rf "$tmp_dir"
        return 1
    fi

    rm -rf "$tmp_dir"

    if [[ "$platform" != windows-* ]]; then
        chmod +x "$final_bin"
    fi

    echo "  ✓ $platform/$bin_name downloaded"
}

if [[ "${1:-}" == "--clean" ]]; then
    clean_assets
fi

echo "Downloading lark-cli v$LARK_CLI_VERSION ..."
for plat in "${PLATFORMS[@]}"; do
    download_bin "$plat" "$LARK_CLI_VERSION" "$ASSETS_DIR/feishu-cli" "lark-cli"
done

echo ""
echo "Downloading dws-cli v$DWS_CLI_VERSION ..."
for plat in "${PLATFORMS[@]}"; do
    # dws-cli doesn't publish GitHub releases — use npm package for darwin-arm64
    if [[ "$plat" == "darwin-arm64" ]]; then
        if [[ -f "$ASSETS_DIR/dws-cli/$plat/dws" ]]; then
            echo "  ✓ $plat/dws already exists, skipping"
        else
            echo "  Installing dws-cli via npm for current platform..."
            npm install -g dingtalk-workspace-cli 2>/dev/null || true
            DWS_BIN=$(find "$(npm prefix -g)/lib/node_modules/dingtalk-workspace-cli" -name "dws" -type f 2>/dev/null | head -1)
            if [[ -n "$DWS_BIN" ]]; then
                mkdir -p "$ASSETS_DIR/dws-cli/$plat"
                cp "$DWS_BIN" "$ASSETS_DIR/dws-cli/$plat/dws"
                chmod +x "$ASSETS_DIR/dws-cli/$plat/dws"
                echo "  ✓ $plat/dws installed from npm"
            else
                echo "  ✗ Failed to find dws binary from npm package"
            fi
        fi
    else
        echo "  ○ $plat — dws-cli only available for darwin-arm64, skip"
    fi
done

echo ""
echo "All CLI binaries downloaded to assets/"
