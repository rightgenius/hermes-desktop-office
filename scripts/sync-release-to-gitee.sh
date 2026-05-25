#!/usr/bin/env bash
# Sync release assets from GitHub Release to Gitee Release
# Usage: GITEE_TOKEN=xxx bash scripts/sync-release-to-gitee.sh [tag] [options]
# Options:
#   --force   overwrite existing Gitee release (recreate)

set -euo pipefail

GITHUB_OWNER="rightgenius"
GITHUB_REPO="hermes-desktop-office"
GITEE_OWNER="nius"
GITEE_REPO="hermes-desktop-office"
GITEE_API="https://gitee.com/api/v5"
GITHUB_API="https://api.github.com"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[GiteeSync]${NC} $*"; }
warn() { echo -e "${YELLOW}[GiteeSync]${NC} $*" >&2; }
err()  { echo -e "${RED}[GiteeSync]${NC} $*" >&2; exit 1; }

for cmd in curl jq git; do
  command -v "$cmd" >/dev/null 2>&1 || err "missing required command: $cmd"
done

if [[ -z "${GITEE_TOKEN:-}" ]]; then
  err "GITEE_TOKEN environment variable is required (Gitee personal access token)"
fi

TAG=""
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *)       TAG="$arg" ;;
  esac
done

if [[ -z "$TAG" ]]; then
  TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  [[ -z "$TAG" ]] && err "no tag found (provide tag as argument or run from a tagged commit)"
fi

log "syncing release: $TAG"

TMP_DIR="$(mktemp -d -t gitee-sync-XXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "fetching GitHub release info for $TAG ..."
GH_RELEASE_FILE="$TMP_DIR/gh_release.json"
GH_AUTH_HEADER=""
if [[ -n "${GH_TOKEN:-}" ]]; then
  GH_AUTH_HEADER="Authorization: Bearer $GH_TOKEN"
else
  warn "GH_TOKEN not set, using unauthenticated GitHub API (60 req/hour limit)"
fi
HTTP_CODE="$(curl -s -o "$GH_RELEASE_FILE" -w '%{http_code}' \
  -H 'Accept: application/vnd.github+json' \
  ${GH_AUTH_HEADER:+-H "$GH_AUTH_HEADER"} \
  "$GITHUB_API/repos/$GITHUB_OWNER/$GITHUB_REPO/releases/tags/$TAG")"

FALLBACK_TO_HTML=0
if [[ "$HTTP_CODE" != "200" ]]; then
  if [[ "$HTTP_CODE" == "403" ]]; then
    warn "GitHub API rate limited, falling back to HTML scraping ..."
    FALLBACK_TO_HTML=1
  else
    msg="$(jq -r '.message // empty' "$GH_RELEASE_FILE" 2>/dev/null)"
    err "failed to fetch GitHub Release (HTTP $HTTP_CODE${msg:+: $msg}). Ensure the release exists or set GH_TOKEN for higher rate limits."
  fi
fi

if [[ "$FALLBACK_TO_HTML" == "1" ]]; then
  HTML_FILE="$TMP_DIR/gh_assets.html"
  curl -s "https://github.com/$GITHUB_OWNER/$GITHUB_REPO/releases/expanded_assets/$TAG" -o "$HTML_FILE"
  ASSET_URLS="$(grep -oE "href=\"/$GITHUB_OWNER/$GITHUB_REPO/releases/download/$TAG/[^\"]+\"" "$HTML_FILE" \
    | sed -E "s|href=\"/||;s|\"||" | sort -u || true)"
  if [[ -z "$ASSET_URLS" ]]; then
    err "could not find any release assets via HTML scraping"
  fi
  GH_RELEASE_NAME="Release $TAG"
  GH_RELEASE_BODY=""
  ASSET_COUNT="$(echo "$ASSET_URLS" | wc -l | tr -d ' ')"

  python3 -c "
import re, json
html = open('$HTML_FILE').read()
items = re.findall(r'<a[^>]*href=\"/[^/]+/[^/]+/releases/download/$TAG/([^\"]+)\"[^>]*>.*?</a>.*?<span[^>]*>([^<]*\b(MB|GB|KB)\b[^<]*)</span>', html, re.DOTALL)
sizes = {}
for name, size_str, unit in items:
    m = re.search(r'([\d.]+)\s*(KB|MB|GB)', size_str)
    if m:
        sizes[name] = float(m.group(1)) * {'KB':1024, 'MB':1024**2, 'GB':1024**3}[m.group(2)]
json.dump(sizes, open('$TMP_DIR/gh_sizes.json','w'))
" 2>/dev/null || warn "failed to parse asset sizes from HTML"

  GITEE_SIZE_LIMIT_BYTES=$(( 100 * 1024 * 1024 ))
  mkdir -p "$TMP_DIR/assets"
  ASSETS_DIR="$TMP_DIR/assets"
  echo "$ASSET_URLS" | while read -r url; do
    name="$(basename "$url")"
    file_bytes="$(python3 -c "import json; d=json.load(open('$TMP_DIR/gh_sizes.json')); print(int(d.get('$name', 0)))" 2>/dev/null || echo 0)"
    if [[ "$file_bytes" -gt "$GITEE_SIZE_LIMIT_BYTES" ]]; then
      size_mb=$(( file_bytes / 1024 / 1024 ))
      warn "  skipping download: $name (${size_mb}MB exceeds 100MB Gitee limit)"
      continue
    fi
    log "  downloading $name ..."
    curl -L -s -o "$ASSETS_DIR/$name" "https://github.com/$url"
  done
else
  GH_RELEASE_ID="$(jq -r '.id' "$GH_RELEASE_FILE")"
  GH_RELEASE_NAME="$(jq -r '.name // .tag_name' "$GH_RELEASE_FILE")"
  GH_RELEASE_BODY="$(jq -r '.body // ""' "$GH_RELEASE_FILE")"
  ASSET_COUNT="$(jq -r '.assets | length' "$GH_RELEASE_FILE")"

  if [[ "$ASSET_COUNT" == "0" ]]; then
    warn "no assets found in GitHub release $TAG"
  fi

  log "found $ASSET_COUNT asset(s) in GitHub release"

  GITEE_SIZE_LIMIT_BYTES=$(( 100 * 1024 * 1024 ))
  ASSETS_DIR="$TMP_DIR/assets"
  mkdir -p "$ASSETS_DIR"

  jq -c '.assets[]' "$GH_RELEASE_FILE" | while read -r asset; do
    name="$(jq -r '.name' <<< "$asset")"
    url="$(jq -r '.browser_download_url' <<< "$asset")"
    size="$(jq -r '.size' <<< "$asset")"
    size_mb=$(( size / 1024 / 1024 ))
    if [[ "$size" -gt "$GITEE_SIZE_LIMIT_BYTES" ]]; then
      warn "  skipping download: $name (${size_mb}MB > 100MB Gitee limit)"
      continue
    fi
    log "  downloading $name (${size_mb} MB) ..."
    curl -L -s -o "$ASSETS_DIR/$name" "$url" \
      || err "failed to download asset: $name"
  done
fi

RELEASE_NOTES=""
RELEASE_NOTES_FILE="RELEASE_NOTES.md"
if [[ -f "$RELEASE_NOTES_FILE" ]]; then
  RELEASE_NOTES="$(awk -v tag="$TAG" '
    BEGIN { capture=0 }
    /^# Release Notes / && index($0, tag) > 0 { capture=1; next }
    /^# Release Notes / && capture { capture=0; next }
    capture { print }
  ' "$RELEASE_NOTES_FILE")"
fi
if [[ -z "$RELEASE_NOTES" ]]; then
  RELEASE_NOTES="$GH_RELEASE_BODY"
fi
if [[ -z "$RELEASE_NOTES" ]]; then
  RELEASE_NOTES="Release $TAG"
fi

GH_DL_URL="https://github.com/$GITHUB_OWNER/$GITHUB_REPO/releases/tag/$TAG"
SIZE_NOTICE="$(printf '\n\n---\n\n> **⚠️ 安装包下载**：Gitee 单文件上限 100MB，本项目安装包均大于 140MB，请前往 [GitHub Release %s] (%s) 下载完整安装包。' "$TAG" "$GH_DL_URL")"
RELEASE_NOTES_WITH_NOTICE="$RELEASE_NOTES$SIZE_NOTICE"

NOTES_FILE="$TMP_DIR/release_notes.md"
printf '%s' "$RELEASE_NOTES" > "$NOTES_FILE"
NOTES_WITH_NOTICE_FILE="$TMP_DIR/release_notes_with_notice.md"
printf '%s' "$RELEASE_NOTES_WITH_NOTICE" > "$NOTES_WITH_NOTICE_FILE"

log "checking existing Gitee release ..."
EXISTING="$(curl -s -w '\n%{http_code}' \
  "$GITEE_API/repos/$GITEE_OWNER/$GITEE_REPO/releases/tags/$TAG?access_token=$GITEE_TOKEN")"
EXISTING_CODE="$(echo "$EXISTING" | tail -n1)"
EXISTING_BODY="$(echo "$EXISTING" | sed '$d')"
GITEE_RELEASE_ID=""

if [[ "$EXISTING_CODE" == "200" ]]; then
  GITEE_RELEASE_ID="$(jq -r '.id // empty' <<< "$EXISTING_BODY")"
  if [[ -n "$GITEE_RELEASE_ID" ]]; then
    if [[ "$FORCE" == "1" ]]; then
      warn "existing Gitee release found (id=$GITEE_RELEASE_ID), deleting (--force) ..."
      curl -s -X DELETE \
        "$GITEE_API/repos/$GITEE_OWNER/$GITEE_REPO/releases/$GITEE_RELEASE_ID?access_token=$GITEE_TOKEN" \
        >/dev/null
      GITEE_RELEASE_ID=""
    else
      log "Gitee release already exists (id=$GITEE_RELEASE_ID). Use --force to overwrite."
      log "uploading new assets to existing release ..."
    fi
  fi
fi

GITEE_SIZE_LIMIT_BYTES=$(( 100 * 1024 * 1024 ))

if [[ -z "$GITEE_RELEASE_ID" ]]; then
  log "creating Gitee release ..."
  jq -n \
    --arg token "$GITEE_TOKEN" \
    --arg tag "$TAG" \
    --arg name "$GH_RELEASE_NAME" \
    --rawfile body "$NOTES_WITH_NOTICE_FILE" \
    '{access_token:$token, tag_name:$tag, name:$name, body:$body, target_commitish:"main"}' \
    > "$TMP_DIR/create_payload.json"
  CREATE_RESP="$(curl -s -X POST \
    -H 'Content-Type: application/json' \
    --data-binary @"$TMP_DIR/create_payload.json" \
    "$GITEE_API/repos/$GITEE_OWNER/$GITEE_REPO/releases")"
  CREATE_ERR="$(jq -r '.message // empty' <<< "$CREATE_RESP")"
  [[ -n "$CREATE_ERR" ]] && err "failed to create Gitee release: $CREATE_ERR"
  GITEE_RELEASE_ID="$(jq -r '.id' <<< "$CREATE_RESP")"
  [[ -z "$GITEE_RELEASE_ID" || "$GITEE_RELEASE_ID" == "null" ]] && err "failed to create Gitee release (no id returned)"
  log "created Gitee release id=$GITEE_RELEASE_ID"
else
  log "patching existing Gitee release body with download notice ..."
  jq -n \
    --arg token "$GITEE_TOKEN" \
    --arg id "$GITEE_RELEASE_ID" \
    --arg tag "$TAG" \
    --arg name "$GH_RELEASE_NAME" \
    --rawfile body "$NOTES_WITH_NOTICE_FILE" \
    '{access_token:$token, id:($id|tonumber), tag_name:$tag, name:$name, body:$body}' \
    > "$TMP_DIR/patch_payload.json"
  PATCH_RESP="$(curl -s -X PATCH \
    -H 'Content-Type: application/json' \
    --data-binary @"$TMP_DIR/patch_payload.json" \
    "$GITEE_API/repos/$GITEE_OWNER/$GITEE_REPO/releases/$GITEE_RELEASE_ID")"
  PATCH_ERR="$(jq -r '.message // empty' <<< "$PATCH_RESP")"
  if [[ -n "$PATCH_ERR" ]]; then
    warn "failed to patch release body: $PATCH_ERR"
  else
    log "release body updated"
  fi
fi

EXISTING_ATTACHMENTS="$(curl -s \
  "$GITEE_API/repos/$GITEE_OWNER/$GITEE_REPO/releases/$GITEE_RELEASE_ID?access_token=$GITEE_TOKEN" \
  | jq -r '.assets[]?.name // empty' 2>/dev/null || true)"

UPLOADED=0
SKIPPED=0
TOO_LARGE=0
FAILED=0

for file in "$ASSETS_DIR"/*; do
  [[ -e "$file" ]] || continue
  name="$(basename "$file")"
  file_size="$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)"
  file_mb=$(( file_size / 1024 / 1024 ))

  if [[ "$file_size" -gt "$GITEE_SIZE_LIMIT_BYTES" ]]; then
    warn "  skipping $name (${file_mb}MB > 100MB Gitee limit — will be downloadable via GitHub link in release body)"
    TOO_LARGE=$(( TOO_LARGE + 1 ))
    continue
  fi
  if echo "$EXISTING_ATTACHMENTS" | grep -qx "$name" 2>/dev/null; then
    warn "  skipping $name (already exists on Gitee)"
    SKIPPED=$(( SKIPPED + 1 ))
    continue
  fi
  log "  uploading $name (${file_mb}MB) ..."
  UPLOAD_RESP="$(curl -s -X POST \
    -F "access_token=$GITEE_TOKEN" \
    -F "file=@$file" \
    "$GITEE_API/repos/$GITEE_OWNER/$GITEE_REPO/releases/$GITEE_RELEASE_ID/attach_files")"
  UPLOAD_ERR="$(jq -r '.message // empty' <<< "$UPLOAD_RESP" 2>/dev/null)"
  if [[ -n "$UPLOAD_ERR" ]]; then
    warn "  failed to upload $name: $UPLOAD_ERR"
    FAILED=$(( FAILED + 1 ))
  else
    log "  uploaded $name"
    UPLOADED=$(( UPLOADED + 1 ))
  fi
done

echo ""
log "done. uploaded=$UPLOADED skipped=$SKIPPED too_large=$TOO_LARGE failed=$FAILED"
log "Gitee release: https://gitee.com/$GITEE_OWNER/$GITEE_REPO/releases/tag/$TAG"
log "GitHub release (for large assets): $GH_DL_URL"
