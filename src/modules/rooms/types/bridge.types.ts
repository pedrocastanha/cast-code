
export type BridgeEventType =
  | 'bridge.register'
  | 'bridge.unregister'
  | 'bridge.message'
  | 'bridge.connected'
  | 'bridge.disconnected';

export interface BridgeMessage {
    id: string;
    fromAgentId: string;
    toAgentId: string | 'all';
    content: string;
    type: 'task' | 'result' | 'question' | 'broadcast';
    traceId?: string;
    timestamp: number;
}

export interface BridgeRegister {
    name: string;
    tool: string;
    roomId: string;
    color: string;
    model: string;
    provider: string;
    metadata?: Record<string, unknown>;
}

export interface BridgeRegisterResponse {
    instanceId: string;
    token: string;
    roomId: string;
    name: string;
}

export interface BridgeUnregister {
    instanceId: string;
    token: string;
}

export interface BridgeSendMessage {
    fromAgentId: string;
    toAgentId?: string;
    content: string;
    type?: 'task' | 'result' | 'question' | 'broadcast';
    traceId?: string;
}

export interface RegisteredAgent {
    instanceId: string;
    token: string;
    name: string;
    tool: string;
    roomId: string;
    color: string;
    model: string;
    provider: string;
    status: 'connected' | 'disconnected';
    connectedAt: number;
    metadata?: Record<string, unknown>;
}

export interface BridgeEvent {
    id: string;
    type: BridgeEventType;
    agentId: string;
    instanceId: string;
    roomId: string;
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
    timestamp: number;
}
