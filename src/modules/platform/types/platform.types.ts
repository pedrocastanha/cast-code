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
  benchmarks?: {
    enabled: boolean;
    definitions: PlatformBenchmarkDefinitionPayload[];
  };
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

export interface PlatformBenchmarkCasePayload {
  id?: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  rubric?: Record<string, unknown>;
  tags?: string[];
}

export interface PlatformBenchmarkDefinitionPayload {
  id?: string;
  name: string;
  targetType: string;
  targetRef: string;
  environmentId?: string;
  config: Record<string, unknown>;
  cases?: PlatformBenchmarkCasePayload[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformBenchmarkDefinitionResponse {
  definition: PlatformBenchmarkDefinitionPayload & { id: string };
  cases: Array<PlatformBenchmarkCasePayload & { id: string }>;
}

export interface PlatformBenchmarkRunPayload {
  id?: string;
  benchmarkId: string;
  status: string;
  runConfig?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
}

export interface PlatformBenchmarkResultPayload {
  id?: string;
  caseId: string;
  status: string;
  scores?: Record<string, unknown>;
  outputPreview?: string;
  latencyMs?: number;
  cost?: number;
  error?: string;
  createdAt?: string;
}

export interface PlatformBenchmarkArtifactPayload {
  id?: string;
  kind: string;
  name: string;
  path: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
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
