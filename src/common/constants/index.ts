import * as path from 'path';
import * as os from 'os';

export const CAST_DIR = '.cast';
export const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.cast');

export const DEFAULT_MODEL = 'gpt-5.4-mini';
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
  'shell_background',
  'web_search',
  'web_fetch',
  'task_create',
  'task_update',
  'task_list',
  'task_get',
  'ask_user_question',
  'enter_plan_mode',
  'exit_plan_mode',
  'memory_write',
  'memory_read',
  'memory_search',
] as const;

export type BuiltInToolName = (typeof BUILT_IN_TOOLS)[number];

export const ADAPTIVE_TEST_FIRST_WORKFLOW_PROMPT = [
  '# Adaptive Test-First Workflow',
  '- For feature, fix, refactor, architecture, migration, performance, or security work: inspect the relevant code before changing it.',
  '- Ask clarifying questions only when ambiguity affects behavior, data contracts, UX, security, persistence, migrations, public APIs, or a complex module has likely side effects the user did not specify.',
  '- Do not ask questions just to delay clear work. If the task is clear, state important assumptions briefly and proceed.',
  '- Missing tests are not ambiguity. If the user requested tests and no test file exists, create the smallest appropriate test file using the local test framework.',
  '- A clear file extension is enough to infer the language for ordinary implementation work; do not ask the user to confirm the language for files like .js, .ts, .py, or .go.',
  '- Before implementing a behavior change, write or update the smallest meaningful failing test first. Run it and confirm it fails for the expected reason.',
  '- Then implement the minimum change, rerun the focused test, and run broader tests or builds according to risk.',
  '- For refactors, preserve behavior with characterization tests before moving code when coverage is missing.',
  '- If tests are impossible or no test framework exists, explain the gap, use the narrowest manual verification available, and keep the change small.',
].join('\n');
