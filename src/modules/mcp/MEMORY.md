# MCP Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/mcp`.

## Purpose

The MCP module owns Model Context Protocol client support: server config, stdio/HTTP/SSE connections, OAuth, tool conversion, capability/resource/prompt access, catalog metadata, risk scanning, and mutation policy.

## Key Files

- `mcp.module.ts`: provides and exports client, registry, risk scanner, capability, and approval-policy services.
- `services/mcp-client.service.ts`: connects to MCP servers and calls tools/resources/prompts.
- `services/mcp-registry.service.ts`: registers configs, connects servers, converts MCP tools to LangChain tools, and scopes server summaries.
- `services/mcp-capability.service.ts`: exposes utility tools for resources/prompts/capabilities.
- `services/mcp-approval-policy.service.ts`: evaluates whether MCP tool calls are allowed, approval-required, dry-run-only, or blocked.
- `services/mcp-risk-scanner.service.ts`: scans tool descriptions for risk signals.
- `services/cast-oauth-provider.ts`: handles OAuth client info, tokens, authorization redirect, and callback wait.
- `catalog/mcp-templates.ts`: curated MCP catalog templates with category/auth/risk/mutation metadata.
- `types/mcp.types.ts`: config, tool, resource, prompt, status, and summary contracts.

## Boundaries

- Slash command setup/list UX lives in `repl/services/commands/mcp-commands.service.ts`.
- Platform may provide remote MCP summaries/configs, but HTTP payload handling lives in `platform`.
- Tool invocation permission may also be mediated by `permissions` and runtime prompting.

## Decisions To Preserve

- MCP tools are lazy and gated. Do not preload every MCP tool into every prompt.
- Catalog metadata should retain risk and mutation policy; high-risk connectors must stay approval-required or blocked by default.
- Environment scope filtering must not destroy registered server configs.
- OAuth secrets/tokens must not be printed in status or prompt summaries.

## Tests

Specs cover templates, approval policy, client, registry, and risk scanner under `src/modules/mcp`.

Update this file when transport behavior, OAuth handling, tool conversion, catalog risk metadata, or environment scoping changes.
