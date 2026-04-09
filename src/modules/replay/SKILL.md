# Replay Module

## Overview
Session replay recording — records user interactions and AI responses for playback, debugging, and sharing.

## Role in System
Captures the full conversation history (user inputs, AI responses, tool executions) during a REPL session and saves it for later playback. Useful for debugging agent behavior, sharing interesting interactions, and auditing.

## Dependencies
- **Depends on**: None (self-contained recording/playback)
- **Used by**: CoreModule (DeepAgentService integrates ReplayService), REPL (ReplayCommandsService)
- **External deps**: File system for recording storage

## Key Services/Providers
| Service | Purpose |
|---|---|
| `ReplayService` | Records session events (user messages, AI responses, tool calls) to a file. Supports playback of recorded sessions. |

## Key Types/Interfaces
No dedicated types file. Session recordings are likely stored as JSON arrays of events.

## Coding Standards & Patterns
- **Event recording**: Each interaction (user message, AI response, tool execution) is recorded as an event with timestamp.
- **File-based storage**: Recordings are saved as files (likely JSON) in a recordings directory.
- **Playback**: Replays the recorded session, showing the conversation flow without making actual LLM calls.
- **Integration**: Core's DeepAgentService calls into ReplayService to record each turn of the conversation.

## Business Rules
- Recording must be explicitly started (via `/record` command or config setting).
- Recordings capture the full conversation including tool calls and outputs.
- Playback replays the session without making LLM calls — it's a read-only replay of what happened.

## Circular Dependencies
None.

## Working on This Module
- **Single service**: Everything is in `replay.service.ts`. Simple, focused module.
- **Recording format**: Likely an array of `{ timestamp, type, content }` events saved as JSON.
- **Starting recording**: Via REPL `/record` command. Check `ReplayCommandsService` in the REPL module.
- **Storage location**: Recordings are likely stored in `.cast/recordings/` or a similar directory. Check the service for the exact path.
- **Integration point**: DeepAgentService in Core calls replay service on each conversation turn.
