#!/usr/bin/env zsh

ROOT="${0:A:h:h}"
OUT="$(mktemp -t cast-bridge-claude-smoke.XXXXXX.log)"
FAKE_DEBUG="$(mktemp -t cast-bridge-fake.XXXXXX.log)"

cleanup() {
  local code=$?
  if (( code != 0 )); then
    cat "$OUT" >&2
    cat "$FAKE_DEBUG" >&2
  fi
  rm -f "$OUT" "$FAKE_DEBUG"
  exit "$code"
}
trap cleanup EXIT

if [[ "${FAKE_CLAUDE_MODE:-}" == "malformed" ]]; then
  SCRIPTED_INPUT='["force malformed protocol","/exit"]'
else
  SCRIPTED_INPUT='["leia package.json e liste os scripts","/bridge status","/exit"]'
fi

(
  cd "$ROOT"
  if [[ -n "${FAKE_CLAUDE_MODE:-}" ]]; then
    CAST_BRIDGE_CLAUDE_COMMAND="/usr/bin/node" \
    CAST_BRIDGE_CLAUDE_ARGS="$ROOT/scripts/fixtures/bridge/fake-claude-cli.mjs" \
    CAST_BRIDGE_DISABLE_PTY="1" \
    CAST_BRIDGE_TURN_IDLE_MS="500" \
    CAST_BRIDGE_SCRIPTED_INPUT="$SCRIPTED_INPUT" \
    FAKE_CLAUDE_DEBUG_FILE="$FAKE_DEBUG" \
    FAKE_CLAUDE_MODE="$FAKE_CLAUDE_MODE" \
    node "$ROOT/dist/main.js" bridge claude >"$OUT" 2>&1
  else
    CAST_BRIDGE_CLAUDE_COMMAND="/usr/bin/node" \
    CAST_BRIDGE_CLAUDE_ARGS="$ROOT/scripts/fixtures/bridge/fake-claude-cli.mjs" \
    CAST_BRIDGE_DISABLE_PTY="1" \
    CAST_BRIDGE_TURN_IDLE_MS="500" \
    CAST_BRIDGE_SCRIPTED_INPUT="$SCRIPTED_INPUT" \
    FAKE_CLAUDE_DEBUG_FILE="$FAKE_DEBUG" \
    node "$ROOT/dist/main.js" bridge claude >"$OUT" 2>&1
  fi
)
NODE_STATUS=$?
if (( NODE_STATUS != 0 )); then
  exit "$NODE_STATUS"
fi

if [[ "${FAKE_CLAUDE_MODE:-}" == "malformed" ]]; then
  grep -qi "Protocol error handled" "$OUT" || exit 1
else
  grep -qi "Scripts: build, test, typecheck" "$OUT" || exit 1
  grep -qi "Provider: Claude CLI" "$OUT" || exit 1
  grep -qi "Status: connected" "$OUT" || exit 1
fi

print -r -- "bridge claude smoke passed"
