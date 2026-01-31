import * as path from 'path';
import * as os from 'os';

export const CAST_DIR = '.cast';
export const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.cast');

export const DEFAULT_MODEL = 'gpt-4.1-nano';
export const DEFAULT_TEMPERATURE = 0.1;

export const DEFINITIONS_DIR = {
  AGENTS: 'definitions',
  SKILLS: 'definitions',
} as const;

export const BUILT_IN_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'glob',
  'grep',
  'ls',
  'shell',
  'web_search',
  'web_fetch',
] as const;

export type BuiltInToolName = (typeof BUILT_IN_TOOLS)[number];
