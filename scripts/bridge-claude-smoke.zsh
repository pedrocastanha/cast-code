#!/usr/bin/env zsh

SCRIPT_PATH="${(%):-%x}"
ROOT="${SCRIPT_PATH:A:h:h}"

node "$ROOT/scripts/bridge-claude-smoke.mjs"
STATUS=$?

return "$STATUS" 2>/dev/null || exit "$STATUS"
