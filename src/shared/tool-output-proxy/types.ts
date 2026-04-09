export interface ToolOutputTransform {
  toolName: string;
  transform: (rawOutput: string, input?: Record<string, unknown>) => string;
}

export interface DefaultCleanupConfig {
  maxLines: number;
  maxChars: number;
  stripAnsi: boolean;
  collapseBlankLines: boolean;
}

export interface ToolOutputSummary {
  summary: string;
  originalLines?: number;
  resultLines?: number;
  truncated: boolean;
}

export const DEFAULT_CLEANUP_CONFIG: DefaultCleanupConfig = {
  maxLines: 80,
  maxChars: 4000,
  stripAnsi: true,
  collapseBlankLines: true,
};
