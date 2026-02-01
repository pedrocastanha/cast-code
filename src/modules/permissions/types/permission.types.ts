export enum PermissionScope {
  ONCE = 'once',
  SESSION = 'session',
  ALWAYS = 'always',
}

export interface PermissionResponse {
  allowed: boolean;
  scope: PermissionScope;
  remember?: boolean;
}

export interface PermissionRule {
  pattern: string;
  allowed: boolean;
  scope: PermissionScope;
  createdAt: number;
}

export enum DangerLevel {
  SAFE = 'safe',
  CAUTIOUS = 'cautious',
  DANGEROUS = 'dangerous',
}

export interface PermissionsConfig {
  rules: PermissionRule[];
  sessionRules: PermissionRule[];
  dangerPatterns: {
    [key in DangerLevel]: RegExp[];
  };
}
