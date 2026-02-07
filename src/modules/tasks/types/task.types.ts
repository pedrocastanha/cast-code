export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
}

export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  dependencies: string[];
  blocks: string[];
  metadata?: Record<string, any>;
}

export interface TaskPlan {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface CreateTaskOptions {
  subject: string;
  description: string;
  activeForm?: string;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateTaskOptions {
  status?: TaskStatus;
  subject?: string;
  description?: string;
  activeForm?: string;
  addDependencies?: string[];
  removeDependencies?: string[];
  metadata?: Record<string, any>;
}

export interface PlanApprovalOptions {
  approved: boolean;
  autoApprove: boolean;
  modificationRequested?: string;
}

export interface PlanExecutionContext {
  planId: string;
  autoApprove: boolean;
  currentTaskIndex: number;
  startedAt: number;
}
