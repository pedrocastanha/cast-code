export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_permission'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface AgentRun {
  id: string;
  parentRunId: string;
  agentName: string;
  status: AgentRunStatus;
  task: string;
  inputContract: AgentInputContract;
  skills: AgentRunSkill[];
  tools: AgentRunTool[];
  artifacts: AgentRunArtifact[];
  errors: AgentRunError[];
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  tokenUsage?: AgentRunTokenUsage;
}

export interface AgentInputContract {
  prompt: string;
  fileOwnership: AgentFileOwnership[];
  toolScope: string[];
  requiredSkills: string[];
  expectedOutput: AgentOutputSchema;
  acceptanceCriteria: string[];
}

export interface AgentFileOwnership {
  path: string;
  mode: 'read' | 'write' | 'shared';
}

export interface AgentOutputSchema {
  kind: 'analysis' | 'patch' | 'test_report' | 'review' | 'implementation_plan' | 'custom';
  requiredSections: string[];
}

export interface AgentRunSkill {
  name: string;
  scope: string;
  version: string;
  reason: 'agent_required' | 'task_match' | 'manual' | 'environment' | 'profile';
}

export interface AgentRunTool {
  name: string;
  reason: 'agent_default' | 'skill_tool' | 'mcp' | 'fallback';
}

export interface AgentRunArtifact {
  kind: 'final_answer' | 'changed_files' | 'test_result' | 'handoff' | 'blocker';
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunError {
  message: string;
  code?: string;
  recoverable: boolean;
}

export interface AgentRunTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface CreateAgentRunInput {
  parentRunId?: string;
  agentName: string;
  task: string;
  inputContract: AgentInputContract;
  skills?: AgentRunSkill[];
  tools?: AgentRunTool[];
}
