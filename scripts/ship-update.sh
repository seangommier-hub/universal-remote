#!/usr/bin/env bash
# Publishes the current JS to every EAS Update branch that has installed builds (ADR-HEARTH-107, 159).
# Usage: scripts/ship-update.sh "update message"
# Always an explicit --branch, never --auto. EXPO_PUBLIC_* values are inlined at bundle time, so the
# family profile's values are exported here; --environment preview has no server-side variables,
# so nothing can override them. app.config.js is restored on exit.
set -euo pipefail

MESSAGE="${1:?Usage: scripts/ship-update.sh \"update message\"}"
CONFIG_FILE="app.config.js"
ENVIRONMENT="preview"
# The preview branch serves the ad hoc phones on both runtimes (policy appVersion: version = runtime).
PREVIEW_RUNTIMES=(1.1.0 1.2.0)
VERSION_PATTERN='^(    version: ")[0-9.]+(")'

cp "$CONFIG_FILE" "$CONFIG_FILE.shipbak"
trap 'mv -f "$CONFIG_FILE.shipbak" "$CONFIG_FILE"' EXIT

export EXPO_PUBLIC_PERSONAL_HARDWARE_ENABLED=true

publish() {
  npx eas update --branch "$1" --environment "$ENVIRONMENT" --platform ios \
    --message "$MESSAGE" --non-interactive
}

for runtime in "${PREVIEW_RUNTIMES[@]}"; do
  sed -i -E "s/${VERSION_PATTERN}/\1${runtime}\2/" "$CONFIG_FILE"
  echo "== preview @ runtime ${runtime} =="
  publish preview
done

cp "$CONFIG_FILE.shipbak" "$CONFIG_FILE"
echo "== family @ runtime from app.config.js =="
publish family
