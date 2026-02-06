export enum MentionType {
  FILE = 'file',
  DIRECTORY = 'directory',
  URL = 'url',
  GIT = 'git',
}

export interface ParsedMention {
  type: MentionType;
  raw: string;
  target: string;
  resolved: string;
}

export interface ResolvedMention extends ParsedMention {
  content: string;
  error?: string;
}

export interface MentionResult {
  expandedMessage: string;
  mentions: ResolvedMention[];
  originalMessage: string;
}
