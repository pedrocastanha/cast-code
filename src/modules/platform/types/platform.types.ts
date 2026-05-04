export interface CastProjectManifest {
  version?: number;
  project?: { name?: string };
  platform?: {
    projectId?: string;
    apiKeyEnv?: string;
    apiUrl?: string;
  };
  [key: string]: unknown;
}

export interface PlatformConfig {
  enabled: boolean;
  projectRoot: string;
  projectId?: string;
  apiKeyEnv: string;
  apiUrl: string;
  error?: string;
}

export interface PlatformFeatures {
  remoteAgents: boolean;
  benchAccess: boolean;
  maxSkills: number;
  sessionsHistory?: number;
}

export interface RemoteSkillPayload {
  name: string;
  type?: 'skill' | 'agent';
  content: string;
  updatedAt?: string;
}

export interface RemoteAgentPayload {
  role: string;
  model?: string | null;
  systemPrompt: string;
  updatedAt?: string;
}

export interface PlatformProjectPayload {
  project: { id: string; name: string; slug?: string; description?: string | null };
  features: PlatformFeatures;
  skills: RemoteSkillPayload[];
  agents: RemoteAgentPayload[];
  settings?: {
    ragEnabled?: boolean;
    rag?: {
      embeddingModel?: string | null;
      chunkSize?: number | null;
      chunkOverlap?: number | null;
      topK?: number | null;
      useGraph?: boolean | null;
      graphDepth?: number | null;
      agentInstruction?: string | null;
    } | null;
  };
  fetchedAt?: string;
}

export interface PlatformMemoryRetrievalResult {
  unitId: string;
  sourceId?: string;
  title?: string;
  content: string;
  score: number;
  reasons?: string[];
  related?: Array<{
    unitId: string;
    sourceId?: string;
    content: string;
  }>;
}

export interface PlatformMemoryRetrieval {
  retrievalId?: string;
  workspaceId?: string;
  queryHash?: string;
  queryPreview?: string;
  latencyMs?: number;
  results: PlatformMemoryRetrievalResult[];
}

export interface PlatformMemoryUsageResponse {
  workspaceId?: string;
  retrievalId?: string;
  accepted: number;
}

export type PlatformStatus = 'disabled' | 'online' | 'offline' | 'error';

export type PlatformEventType =
  | 'session.started'
  | 'agent.invoked'
  | 'skill.used'
  | 'command.run'
  | 'tokens.consumed'
  | 'session.ended';

export interface PlatformEvent {
  type: PlatformEventType;
  payload: Record<string, unknown>;
  ts: string;
}

export interface PlatformBootstrapResult {
  status: PlatformStatus;
  config: PlatformConfig;
  project?: PlatformProjectPayload['project'];
  features?: PlatformFeatures;
  source?: 'remote' | 'cache';
  message?: string;
}

export interface PlatformLinkOptions {
  projectId: string;
  apiKeyEnv?: string;
  apiUrl?: string;
}
