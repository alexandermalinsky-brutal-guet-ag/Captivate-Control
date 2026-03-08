#!/usr/bin/env bash
set -euo pipefail

SOURCE_PLUGIN="$(cd "$(dirname "$0")" && pwd)/captivate-control-bridge.plugin.js"
TARGET_DIR="/Library/Application Support/NewBlue/Titler Content/Resources/Service Handlers/NodeRuntime/plugins"
TARGET_PLUGIN="${TARGET_DIR}/captivate-control-bridge.plugin.js"

if [[ ! -f "$SOURCE_PLUGIN" ]]; then
  echo "Source plugin not found: $SOURCE_PLUGIN" >&2
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Target plugin directory not found: $TARGET_DIR" >&2
  exit 1
fi

if [[ -f "$TARGET_PLUGIN" ]]; then
  BACKUP_PATH="${TARGET_PLUGIN}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$TARGET_PLUGIN" "$BACKUP_PATH"
  echo "Backed up existing plugin to: $BACKUP_PATH"
fi

cp "$SOURCE_PLUGIN" "$TARGET_PLUGIN"
echo "Installed plugin: $TARGET_PLUGIN"
echo "Restart NewBlue Captivate to load the updated plugin."
