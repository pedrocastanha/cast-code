# Stats Module

## Overview
Token usage and cost tracking — monitors LLM API calls, calculates token consumption, and estimates costs.

## Role in System
Provides visibility into LLM usage costs. Tracks every API call made by DeepAgentService, PlanModeService, and other LLM-consuming services. Users can check their token usage and estimated costs via the `/stats` and `/cost` REPL commands.

## Dependencies
- **Depends on**: None (self-contained tracking)
- **Used by**: CoreModule (DeepAgentService reports usage), REPL (StatsCommandsService)
- **External deps**: None

## Key Services/Providers
| Service | Purpose |
|---|---|
| `StatsService` | Tracks token usage per API call (input tokens, output tokens, total). Calculates estimated costs based on model pricing. Provides usage summaries. |

## Key Types/Interfaces
No dedicated types file. Usage data likely tracked as `{ model, inputTokens, outputTokens, cost, timestamp }` records.

## Coding Standards & Patterns
- **Call tracking**: Every LLM call reports its token usage to StatsService.
- **Cost estimation**: Uses known model pricing (per-token rates) to estimate costs. Pricing may be hardcoded or loaded from config.
- **Aggregation**: Provides totals (total tokens, total cost) and breakdowns (per-model, per-session).
- **Lightweight**: No persistence layer — stats are in-memory and reset on restart. For persistent stats, check if there's a file-based option.

## Business Rules
- Token counting happens for every LLM call — chat completions, plan generation, commit messages, etc.
- Cost estimates are approximate — actual API billing may differ.
- Stats are session-scoped by default. Long-running sessions accumulate stats.

## Circular Dependencies
None.

## Working on This Module
- **Single service**: Everything is in `stats.service.ts`. Very simple module.
- **Integration**: DeepAgentService calls `statsService.recordUsage()` after each LLM response.
- **Adding cost models**: If new models are added to the system, update the pricing table in StatsService.
- **REPL display**: StatsCommandsService in REPL formats and displays stats. The stats service provides the raw data.
- **Future enhancement**: Consider persistent stats (file-based or SQLite) for cross-session tracking.
