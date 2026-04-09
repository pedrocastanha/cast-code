# Remote Module

## Overview
Exposes Cast Code's REPL interface remotely via ngrok tunneling, enabling remote access to the AI coding assistant.

## Role in System
Creates an ngrok tunnel to the local Cast Code instance, allowing users to access the REPL from anywhere. Includes a web UI for remote interaction. Configuration includes password protection and OpenAI API key for authentication.

## Dependencies
- **Depends on**: ConfigModule (for ngrok auth token, remote config settings)
- **Used by**: REPL, Kanban (can also be exposed remotely)
- **External deps**: `ngrok` (tunneling), web server for UI

## Key Services/Providers
| Service | Purpose |
|---|---|
| `RemoteServerService` | Manages ngrok tunnel lifecycle — starts/stops tunnel, configures auth, exposes the REPL web interface. |

## Key Types/Interfaces
No dedicated types file. Config uses `RemoteConfig` from Config module: `{ enabled, password?, openaiApiKey?, ngrokAuthToken? }`.

## Coding Standards & Patterns
- **ngrok integration**: Uses ngrok's Node.js SDK to create tunnels. Auth token comes from user config.
- **Web UI**: `views/remote-ui.ts` generates the remote access web interface (similar pattern to Kanban).
- **Security**: Password protection and API key authentication prevent unauthorized access.
- **Config-driven**: Remote settings come from `~/.cast/config.yaml` under `remote{}` section.
- **Tunnel lifecycle**: Tunnel starts on demand (user enables remote mode) and stops when session ends or user disables it.

## Business Rules
- Remote access requires a valid ngrok auth token.
- Password protection is recommended for remote sessions.
- The remote UI exposes the REPL interface — all REPL commands are available remotely.
- ngrok tunnels have limitations (free tier: random URLs, limited bandwidth).

## Circular Dependencies
None.

## Working on This Module
- **Starting remote access**: User configures ngrok token in config, enables remote mode. `RemoteServerService.start()` creates the tunnel.
- **UI customization**: The web UI is in `views/remote-ui.ts` — code-generated HTML. Modify to change the remote interface appearance.
- **Security considerations**: Never expose remote access without password protection. The ngrok URL is public once created.
- **Troubleshooting**: ngrok errors usually relate to invalid auth tokens, rate limiting, or network issues. Check service logs for tunnel status.
