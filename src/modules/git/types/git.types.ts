export type ConventionalCommitType = 
  | 'feat' 
  | 'fix' 
  | 'docs' 
  | 'style' 
  | 'refactor' 
  | 'perf' 
  | 'test' 
  | 'build' 
  | 'ci' 
  | 'chore' 
  | 'cleanup' 
  | 'remove';

export interface CommitGroup {
  type: ConventionalCommitType;
  files: string[];
  description: string;
  scope?: string;
}

export interface SplitCommit extends CommitGroup {
  message: string;
}

export interface MonorepoInfo {
  isMonorepo: boolean;
  rootDir: string;
  modules: string[];
  moduleMapping: Record<string, string>; 
}

export interface GitDiffInfo {
  staged: string;
  unstaged: string;
  stagedFiles: string[];
  unstagedFiles: string[];
  stats: string;
}

export interface CommitSuggestion {
  type: 'commit' | 'fix_error' | 'security' | 'improve' | 'refactor';
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4 | 5;
  data?: {
    file?: string;
    line?: number;
    old_code?: string;
    new_code?: string;
  };
}
