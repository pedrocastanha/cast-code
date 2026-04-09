# Rooms Module

## Overview
Multi-agent rooms orchestration — enables multiple AI agents to collaborate in shared rooms with SQLite persistence, SSE, REST controller, and event bus.

## Role in System
The most complex module in Cast Code. Enables multi-agent collaboration where multiple Cast Code instances (or agents) communicate in shared "rooms" (like bar, gym, office, park, space). Each room has its own configuration and behavior. Supports SSE for real-time updates, a REST API for external integration, SQLite for long-term memory, and an event bus for inter-agent communication.

## Dependencies
- **Depends on**: CoreModule (for DeepAgentService instantiation)
- **Used by**: REPL (RoomsCommandsService), Remote module, external integrations via REST API
- **External deps**: `better-sqlite3` (SQLite), `eventemitter2`, `child_process` (for spawning agent processes)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `RoomEventBusService` | Central event bus for room events — broadcasts messages between agents in a room. Uses `eventemitter2`. |
| `RoomSseService` | Server-Sent Events for real-time room updates to connected clients. |
| `RoomInstanceManagerService` | Manages room instances — creation, destruction, DeepAgent registration. Each instance is a Cast Code session in a room. |
| `RoomBridgeService` | Message bridge between agents in a room — handles broadcast and direct messaging. |
| `RoomInboxService` | Per-agent message inbox — queues messages for agents that aren't actively listening. |
| `LTMStorageService` | SQLite-based long-term memory storage for rooms. |
| `LTMIndexService` | Indexing service for efficient LTM retrieval. |
| `LTMService` | High-level long-term memory operations — store, retrieve, search room memory. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `RoomInstance` | Instance in a room: instanceId, roomId, agentId, createdAt, status, DeepAgent reference |
| `CastEvent` | Room event: type, content, sender, timestamp, roomId |
| `RoomConfig` | Room configuration: name, behavior rules, agent limits |
| `BridgeMessage` | Message in the bridge: sender, content, type (task/question/broadcast) |

## Coding Standards & Patterns
- **@Global() module**: Marked as `@Global()` so room services are available everywhere without explicit imports.
- **REST controller**: `RoomsController` provides HTTP endpoints for room management (create/destroy instances, broadcast, tasks). Used for external integrations.
- **Room configs**: Predefined room configurations in `configs/` (bar, gym, office, park, space). Each defines room behavior and rules.
- **Process spawning**: `spawnAgent` endpoint spawns a detached Node.js process running Cast Code in bridge mode — enables true multi-agent parallel execution.
- **SSE streaming**: RoomSseService pushes real-time updates to HTTP clients connected to the room.
- **SQLite for persistence**: LTM services use SQLite for durable, queryable long-term memory across room sessions.
- **Event-driven**: Heavy use of EventEmitter2 for decoupled communication between room components.

## Business Rules
- Rooms have predefined names (bar, gym, office, park, space) — each with its own config.
- Agents in a room can broadcast messages (visible to all) or send direct messages.
- Instance creation requires a roomId and agentId.
- Background agents are spawned as detached processes with `AGENT_NAME` and `AGENT_ROLE` environment variables.
- The inbox service ensures messages aren't lost when agents aren't actively listening.
- SQLite LTM persists room conversations and decisions across sessions.

## Circular Dependencies
None on the Rooms side. CoreModule imports RoomsModule, but Rooms doesn't import Core (except via the instance manager's DeepAgent type reference).

## Working on This Module
- **Complex module**: 8 services, a controller, multiple type files, and 5 room configs. Understand the architecture before modifying.
- **Room configs**: `configs/*.config.ts` files define room behavior. Modify these to change how rooms operate.
- **REST API**: `RoomsController` endpoints are at `/rooms/:roomId/instances`, `/rooms/:roomId/broadcast`, `/rooms/task/:agentId`, etc.
- **Spawning agents**: The `spawnAgent` endpoint spawns a real Node.js subprocess. Check the args array for the exact command structure.
- **SSE debugging**: Connect to the SSE endpoint to see real-time room events. Useful for debugging multi-agent interactions.
- **SQLite LTM**: Check `ltm-storage.service.ts` for the database schema and queries.
- **Event flow**: Agent → RoomBridgeService → RoomEventBusService → RoomSseService → connected clients. Understanding this flow is key to debugging.
