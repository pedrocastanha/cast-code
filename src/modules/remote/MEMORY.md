# Remote Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/remote`.

## Purpose

The remote module serves the local remote-control web UI used by `/remote`, including browser/mobile message input, streamed output broadcast, optional ngrok exposure, and password protection.

## Key Files

- `remote.module.ts`: imports `ConfigModule`; provides and exports `RemoteServerService`.
- `services/remote-server.service.ts`: starts/stops the HTTP server, intercepts stdout for broadcast, handles inbound messages, launches ngrok, and exposes running/public URL state.
- `views/remote-ui.ts`: browser UI asset served by the remote server.

## Boundaries

- Prompt execution remains in `repl`/`core`; remote only forwards messages and output chunks.
- Config values come from `config`; do not duplicate global config parsing here.
- Kanban has its own local board server.

## Decisions To Preserve

- Remote access must stay password-protected.
- Restore stdout interception when the server stops.
- Ngrok exposure is optional; local server operation should not depend on a public tunnel.
- Voice/browser UI changes belong in `views/remote-ui.ts`, not in core runtime.

## Tests

`src/modules/remote/views/remote-ui.spec.ts` covers UI behavior.

Update this file when remote auth, server lifecycle, stdout streaming, ngrok integration, or inbound message semantics change.
