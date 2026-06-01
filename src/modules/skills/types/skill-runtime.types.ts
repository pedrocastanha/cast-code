export type SkillRuntimeScope = 'builtin' | 'remote' | 'user' | 'project' | 'session';

export type SkillRuntimeStatus =
  | 'active'
  | 'shadowed'
  | 'disabled'
  | 'quarantined'
  | 'invalid'
  | 'reloading';

export type SkillActivationReason =
  | 'manual'
  | 'mention'
  | 'environment'
  | 'profile'
  | 'agent_required'
  | 'dynamic_recommendation';

export interface SkillRuntimeRecord {
  name: string;
  description?: string;
  aliases: string[];
  scope: SkillRuntimeScope;
  sourcePath?: string;
  packageRoot?: string;
  version: string;
  status: SkillRuntimeStatus;
  activationReasons: SkillActivationReason[];
  supportFiles: SkillRuntimeSupportFile[];
  shadowedBy?: SkillRuntimeRef;
  shadows: SkillRuntimeRef[];
  reload: SkillReloadState;
}

export interface SkillRuntimeRef {
  name: string;
  scope: SkillRuntimeScope;
  sourcePath?: string;
  version?: string;
}

export interface SkillRuntimeSupportFile {
  path: string;
  bytes: number;
  readable: boolean;
  reason?: 'too_large' | 'binary' | 'path_blocked';
}

export interface SkillReloadState {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  changedFiles: string[];
  warnings: string[];
  errors: string[];
}

export interface SkillRuntimeConflict {
  alias: string;
  records: SkillRuntimeRef[];
}

export interface SkillRuntimeResolution {
  records: SkillRuntimeRecord[];
  conflicts: SkillRuntimeConflict[];
}

export interface SkillReloadResult {
  ok: boolean;
  message: string;
  records: SkillRuntimeRecord[];
  warnings: string[];
  errors: string[];
}
