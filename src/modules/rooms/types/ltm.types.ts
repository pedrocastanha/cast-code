/**
 * Long Term Memory (LTM) Types
 * 
 * Types for persistent memory storage and retrieval across agent sessions.
 */

export type MemoryType =
  | 'task_completed'
  | 'tool_result'
  | 'conversation'
  | 'insight'
  | 'error'
  | 'code_snippet';

export interface MemoryMetadata {
  taskId?: string;
  taskSubject?: string;
  toolName?: string;
  tokens?: number;
  latencyMs?: number;
  filePath?: string;
  diff?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface MemoryEntry {
  id: string;
  instanceId: string;
  roomId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  metadata: MemoryMetadata;
  timestamp: number;
  importance: number;
}

export interface MemoryFilters {
  type?: MemoryType | MemoryType[];
  agentId?: string;
  instanceId?: string;
  roomId?: string;
  startTime?: number;
  endTime?: number;
  minImportance?: number;
  tags?: string[];
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  scores: number[];
}
