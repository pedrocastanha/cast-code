export type SwarmPlanStatus = 'draft' | 'approved' | 'rejected' | 'superseded';
export type SwarmIntegrationMode = 'manual' | 'apply_safe' | 'apply_all';
export type SwarmWorkerKind = 'existing_agent' | 'ephemeral_agent';
export type SwarmEffort = 'low' | 'medium' | 'high';

export type SwarmRuntimePolicy =
  | { kind: 'default' }
  | {
    kind: 'bridge';
    provider: 'claude' | 'codex' | 'copilot' | 'qwen' | 'kimi' | 'openrouter';
    maxConcurrentSessions: number;
  }
  | { kind: 'model'; provider: string; model: string };

export interface SwarmGlobalConstraints {
  maxWorkers: number;
  maxRuntimeMsPerTask?: number;
  denyPaths?: string[];
}

export interface SwarmFileOwnership {
  glob: string;
  label?: string;
}

export interface SwarmVerificationStep {
  command: string;
  label?: string;
}

export interface SwarmHandoffFormat {
  summaryMaxChars: number;
  includeDecisions: boolean;
  includeTestsRun: boolean;
}

export interface SwarmWorkerSpec {
  id: string;
  kind: SwarmWorkerKind;
  baseAgentName?: string;
  name: string;
  role: string;
  systemPrompt: string;
  model?: string;
  effort?: SwarmEffort;
  runtime?: SwarmRuntimePolicy;
  handoffFormat: SwarmHandoffFormat;
}

export interface SwarmTaskPlan {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  worker: SwarmWorkerSpec;
  fileOwnership: SwarmFileOwnership[];
  allowedTools: string[];
  injectedSkills: string[];
  discoverableSkills: string[];
  acceptanceCriteria: string[];
  focusedVerification: SwarmVerificationStep[];
}

export interface SwarmPlan {
  id: string;
  projectRoot: string;
  workspaceRoot: string;
  goal: string;
  reasonForSwarm: string;
  status: SwarmPlanStatus;
  integrationMode: SwarmIntegrationMode;
  runtimePolicy: SwarmRuntimePolicy;
  globalConstraints: SwarmGlobalConstraints;
  tasks: SwarmTaskPlan[];
  finalVerification: SwarmVerificationStep[];
  createdAt: string;
  approvedAt?: string;
}

export type SwarmRunStatus =
  | 'planned'
  | 'approved'
  | 'preparing'
  | 'running'
  | 'integrating'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SwarmTaskRunStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'waiting_permission'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'integrated'
  | 'cancelled';

export interface SwarmExpansionRequest {
  kind: 'skill_request' | 'tool_request' | 'ownership_request';
  name: string;
  reason: string;
}

export interface SwarmHandoff {
  summary: string;
  changedFiles: string[];
  decisions: string[];
  testsRun: Array<{ command: string; status: 'passed' | 'failed'; outputPreview?: string }>;
  blockers: string[];
  expansionRequests: SwarmExpansionRequest[];
  skillsUsed?: string[];
}

export type SwarmIntegrationResultStatus =
  | 'pending'
  | 'applied'
  | 'manual_review_required'
  | 'contract_violation'
  | 'conflict'
  | 'skipped';

export interface SwarmTaskIntegrationResult {
  status: SwarmIntegrationResultStatus;
  changedPaths: string[];
  conflictPaths?: string[];
  violationPaths?: string[];
  message?: string;
}

export interface SwarmTaskRun {
  id: string;
  planTaskId: string;
  status: SwarmTaskRunStatus;
  workerId: string;
  worktreePath: string;
  branchName: string;
  startedAt?: string;
  endedAt?: string;
  handoff?: SwarmHandoff;
  integration?: SwarmTaskIntegrationResult;
}

export interface SwarmRun {
  id: string;
  planId: string;
  status: SwarmRunStatus;
  projectRoot: string;
  workspaceRoot: string;
  integrationMode: SwarmIntegrationMode;
  runtimePolicy: SwarmRuntimePolicy;
  tasks: SwarmTaskRun[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface CreateSwarmPlanInput {
  goal: string;
  projectRoot?: string;
  workspaceRoot?: string;
  integrationMode?: SwarmIntegrationMode;
  runtimePolicy?: SwarmRuntimePolicy;
  globalConstraints?: Partial<SwarmGlobalConstraints>;
}

export interface SwarmSuggestion {
  shouldSuggest: boolean;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface SwarmPermissionContext {
  runId: string;
  taskRunId: string;
  workerId: string;
  mode: 'interactive' | 'headless';
  allowedCommandRules: string[];
  allowedWriteGlobs: string[];
  deniedWriteGlobs: string[];
}

export interface SwarmWorktreeContext {
  runId: string;
  taskId: string;
  branchName: string;
  worktreePath: string;
  projectRoot: string;
  workspaceRoot: string;
}

export interface SwarmWorkerRunInput {
  plan: SwarmPlan;
  planTask: SwarmTaskPlan;
  taskRun: SwarmTaskRun;
  worktree: SwarmWorktreeContext;
  permission: SwarmPermissionContext;
  dryRun?: boolean;
  onOutput?: (chunk: string) => void;
}

export interface SwarmDispatchOptions {
  runId: string;
  dryRun?: boolean;
  maxConcurrent?: number;
}
