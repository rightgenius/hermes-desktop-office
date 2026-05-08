#!/usr/bin/env bash
# Download bundled CLI binaries for supported platforms
# Usage: ./scripts/download-clis.sh [--clean]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_DIR/assets"

LARK_CLI_VERSION="1.0.24"
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
    local repo="$3"
    local out_dir="$4"
    local bin_name="$5"

    local dir_name
    if [[ "$platform" == windows-* ]]; then
        dir_name="win-x86_64"
    elif [[ "$platform" == darwin-* ]]; then
        dir_name="macos-${platform#darwin-}"
    else
        dir_name="linux-${platform#linux-}"
    fi

    local out_path="$out_dir/$platform"
    mkdir -p "$out_path"

    local final_bin="$out_path/$bin_name"
    if [[ -f "$final_bin" ]]; then
        echo "  ✓ $platform/$bin_name already exists, skipping"
        return
    fi

    local url="https://github.com/$repo/releases/download/v$version/$repo-$version-$dir_name.tar.gz"
    echo "  Downloading $url ..."

    local tmp_file="/tmp/cli-tmp-$$.tar.gz"
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

    tar -xzf "$tmp_file" -C "$out_path"
    rm -f "$tmp_file"

    # Rename if needed
    local extracted
    extracted=$(ls "$out_path" | head -1)
    if [[ "$extracted" != "$bin_name" ]]; then
        mv "$out_path/$extracted" "$final_bin"
    fi

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
    download_bin "$plat" "$LARK_CLI_VERSION" "larksuite/cli" "$ASSETS_DIR/feishu-cli" "lark-cli"
done

echo ""
echo "Downloading dws-cli v$DWS_CLI_VERSION ..."
for plat in "${PLATFORMS[@]}"; do
    download_bin "$plat" "$DWS_CLI_VERSION" "dingtalk-workspace-cli" "$ASSETS_DIR/dws-cli" "dws"
done

echo ""
echo "All CLI binaries downloaded to assets/"
