#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)/Captivate Control"
TARGET_ROOT="/Users/Shared/NewBlue/LiveEngine/DataControllers"
TARGET_DIR="${TARGET_ROOT}/Captivate Control"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source controller folder not found: $SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -d "$TARGET_ROOT" ]]; then
  echo "Target controller root not found: $TARGET_ROOT" >&2
  exit 1
fi

if [[ -d "$TARGET_DIR" ]]; then
  BACKUP_PATH="${TARGET_DIR}.bak.$(date +%Y%m%d%H%M%S)"
  cp -R "$TARGET_DIR" "$BACKUP_PATH"
  echo "Backed up existing controller to: $BACKUP_PATH"
  rm -rf "$TARGET_DIR"
fi

cp -R "$SOURCE_DIR" "$TARGET_DIR"
echo "Installed controller: $TARGET_DIR"
echo "Restart Captivate to load the updated controller."
