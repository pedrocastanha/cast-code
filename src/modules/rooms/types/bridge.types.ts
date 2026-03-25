/**
 * Bridge Protocol Types for Cross-Terminal Communication
 * 
 * These types define the protocol for external AI agents (Claude Code, Codex, etc.)
 * to register and communicate within the same room as the native cast-code agent.
 */

/**
 * Bridge event types for cross-terminal communication
 */
export type BridgeEventType =
  | 'bridge.register'
  | 'bridge.unregister'
  | 'bridge.message'
  | 'bridge.connected'
  | 'bridge.disconnected';

/**
 * A message sent between agents via the bridge
 */
export interface BridgeMessage {
  /** Unique message ID */
  id: string;
  /** Agent ID of the sender */
  fromAgentId: string;
  /** Agent ID of the recipient (or 'all' for broadcast) */
  toAgentId: string | 'all';
  /** Message content */
  content: string;
  /** Message type */
  type: 'task' | 'result' | 'question' | 'broadcast';
  /** Optional trace ID for tracking related messages */
  traceId?: string;
  /** Timestamp when message was created */
  timestamp: number;
}

/**
 * Request to register an external agent with the bridge
 */
export interface BridgeRegister {
  /** Display name for the agent (e.g., "Claude", "Codex") */
  name: string;
  /** Tool identifier (e.g., "claude", "codex", "qwen", "gemini") */
  tool: string;
  /** Room ID to join (e.g., "bar", "office", "gym", "park", "space") */
  roomId: string;
  /** Color for visual identification in the UI */
  color: string;
  /** Model name (e.g., "claude-sonnet-4-6", "gpt-4o") */
  model: string;
  /** Provider name (e.g., "anthropic", "openai", "google") */
  provider: string;
  /** Optional metadata for additional configuration */
  metadata?: Record<string, unknown>;
}

/**
 * Response after successful agent registration
 */
export interface BridgeRegisterResponse {
  /** Unique instance ID assigned to the registered agent */
  instanceId: string;
  /** Authentication token for subsequent requests */
  token: string;
  /** Room ID the agent was registered in */
  roomId: string;
  /** Agent display name */
  name: string;
}

/**
 * Request to unregister an external agent from the bridge
 */
export interface BridgeUnregister {
  /** Instance ID of the agent to unregister */
  instanceId: string;
  /** Authentication token for verification */
  token: string;
}

/**
 * Request to send a message via the bridge
 */
export interface BridgeSendMessage {
  /** Agent ID of the sender */
  fromAgentId: string;
  /** Agent ID of the recipient (or omit for broadcast) */
  toAgentId?: string;
  /** Message content */
  content: string;
  /** Message type */
  type?: 'task' | 'result' | 'question' | 'broadcast';
  /** Optional trace ID */
  traceId?: string;
}

/**
 * Registered agent information
 */
export interface RegisteredAgent {
  /** Unique instance ID */
  instanceId: string;
  /** Authentication token */
  token: string;
  /** Agent display name */
  name: string;
  /** Tool identifier */
  tool: string;
  /** Room ID */
  roomId: string;
  /** Visual color */
  color: string;
  /** Model name */
  model: string;
  /** Provider name */
  provider: string;
  /** Connection status */
  status: 'connected' | 'disconnected';
  /** Connection timestamp */
  connectedAt: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Bridge event for cross-terminal communication
 */
export interface BridgeEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: BridgeEventType;
  /** Agent ID associated with the event */
  agentId: string;
  /** Instance ID */
  instanceId: string;
  /** Room ID */
  roomId: string;
  /** Event payload */
  payload: {
    name?: string;
    tool?: string;
    message?: string;
    fromAgentId?: string;
    toAgentId?: string;
    content?: string;
    error?: string;
    [key: string]: unknown;
  };
  /** Timestamp */
  timestamp: number;
}
