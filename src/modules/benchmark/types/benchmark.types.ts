export type BenchmarkTargetType =
  | 'model_prompt'
  | 'agent_workflow'
  | 'api_endpoint'
  | 'rag_answer'
  | 'mcp_tool'
  | 'environment_task'
  | 'scheduler_job';

export type GraderType =
  | 'string_check'
  | 'regex'
  | 'json_schema'
  | 'tool_trace'
  | 'llm_judge';

export type BenchmarkRunStatus =
  | 'queued'
  | 'running'
  | 'scoring'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BenchmarkResultStatus = 'passed' | 'failed' | 'error' | 'skipped';

export interface BenchmarkTarget {
  type: BenchmarkTargetType;
  config: Record<string, unknown>;
}

export type BenchmarkCandidateSource =
  | 'explicit'
  | 'project_discovery'
  | 'openapi'
  | 'test_trace';

export type BenchmarkRiskLevel = 'low' | 'medium' | 'high';

export type BenchmarkHarnessMode =
  | 'direct_http'
  | 'start_command_http'
  | 'direct_function'
  | 'agent_workflow'
  | 'wrapper_required'
  | 'unsupported';

export type BenchmarkModelOverrideKind =
  | 'env'
  | 'request_body'
  | 'config_file'
  | 'code_factory'
  | 'cast_config';

export interface BenchmarkModelOverridePoint {
  id: string;
  kind: BenchmarkModelOverrideKind;
  label: string;
  filePath?: string;
  key?: string;
  confidence: number;
  requiresWrite: boolean;
  instructions: string;
}

export interface BenchmarkTargetCandidate {
  id: string;
  type: BenchmarkTargetType;
  label: string;
  confidence: number;
  filePath?: string;
  method?: string;
  routePath?: string;
  handlerName?: string;
  source: BenchmarkCandidateSource;
  target: BenchmarkTarget;
  requiresServer: boolean;
  requiresWrite: boolean;
  risk: BenchmarkRiskLevel;
  evidence: string[];
}

export interface BenchmarkHarnessPlan {
  candidateId: string;
  mode: BenchmarkHarnessMode;
  targetType: BenchmarkTargetType;
  target: BenchmarkTarget;
  requiresWrite: boolean;
  confirmationRequired: boolean;
  controlledEnvironmentRecommended: boolean;
  reason: string;
  startCommand?: string;
  healthcheckUrl?: string;
  modelOverridePoints: BenchmarkModelOverridePoint[];
  risk: BenchmarkRiskLevel;
  evidence: string[];
}

export interface GraderDefinition {
  id: string;
  type: GraderType;
  config: Record<string, unknown>;
  weight?: number;
}

export interface BenchmarkCase {
  id: string;
  input: string;
  expected?: string;
  metadata?: Record<string, unknown>;
  graders?: GraderDefinition[];
}

export interface ModelRunConfig {
  provider: string;
  model: string;
  purpose?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface BenchmarkBudget {
  maxCostUsd?: number;
  maxTokens?: number;
  maxCases?: number;
  allowLlmJudge?: boolean;
  maxLlmJudgeCalls?: number;
}

export interface BenchmarkDefinition {
  id: string;
  projectRoot: string;
  name: string;
  description?: string;
  target: BenchmarkTarget;
  cases: BenchmarkCase[];
  graders: GraderDefinition[];
  budget?: BenchmarkBudget;
  models?: ModelRunConfig[];
  tags?: string[];
  environmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BenchmarkSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  score: number;
  totalCost: number;
  totalTokens: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
}

export interface BenchmarkRun {
  id: string;
  definitionId: string;
  projectRoot: string;
  status: BenchmarkRunStatus;
  startedAt: string;
  completedAt?: string;
  summary?: BenchmarkSummary;
  error?: string;
  artifactDir?: string;
  definitionSnapshot?: BenchmarkDefinition;
}

export interface BenchmarkToolTraceEntry {
  name: string;
  input?: unknown;
  output?: unknown;
}

export interface GraderScore {
  graderId: string;
  type: GraderType;
  passed: boolean;
  score: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkResult {
  id: string;
  runId: string;
  caseId: string;
  status: BenchmarkResultStatus;
  input: string;
  output?: string;
  expected?: string;
  error?: string;
  scores: GraderScore[];
  score: number;
  cost: number;
  tokens: number;
  latencyMs: number;
  model?: string;
  toolTrace?: BenchmarkToolTraceEntry[];
  metadata?: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
}

export interface CreateBenchmarkRunInput {
  definitionId: string;
  projectRoot: string;
  definitionSnapshot: BenchmarkDefinition;
  artifactDir?: string;
}

export interface TargetExecutionInput {
  target: BenchmarkTarget;
  benchmarkCase: BenchmarkCase;
}

export interface TargetExecutionResult {
  output: string;
  toolTrace?: BenchmarkToolTraceEntry[];
  tokens?: number;
  cost?: number;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkAgentExecutor {
  runBenchmarkPrompt(prompt: string): Promise<TargetExecutionResult>;
}
