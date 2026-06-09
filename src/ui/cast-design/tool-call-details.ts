const TOOL_DISPLAY_NAMES: Record<string, string> = {
  shell: 'Bash',
  shell_background: 'Bash',
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  glob: 'Search',
  grep: 'Search',
  ls: 'List',
  web_search: 'Web Search',
  web_fetch: 'Fetch',
  task: 'Agent',
  task_create: 'Task',
  task_update: 'Task',
  task_list: 'Tasks',
  task_get: 'Task',
  memory_read: 'Memory',
  memory_write: 'Memory',
  memory_search: 'Memory',
  rag_search: 'RAG',
  list_skills: 'Skills',
  read_skill: 'Skill',
  list_agents: 'Agents',
  cast_command: 'Cast',
  mcp_list_servers: 'MCP',
  mcp_list_tools: 'MCP',
  ask_user_question: 'Question',
  enter_plan_mode: 'Plan',
  exit_plan_mode: 'Plan',
};

const TOOL_SPINNER_LABELS: Record<string, string> = {
  read_file: 'Reading',
  write_file: 'Writing',
  edit_file: 'Editing',
  shell: 'Running',
  shell_background: 'Running',
  glob: 'Searching',
  grep: 'Searching',
  ls: 'Searching',
  web_search: 'Searching web',
  web_fetch: 'Fetching',
  rag_search: 'RAG',
  memory_read: 'Memory',
  memory_write: 'Memory',
  memory_search: 'Memory',
  cast_command: 'Cast command',
  task: 'Tasks',
  task_create: 'Tasks',
  task_update: 'Tasks',
};

export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] ?? toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getToolSpinnerLabel(toolName: string): string {
  return TOOL_SPINNER_LABELS[toolName] ?? 'Working';
}

function filePath(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  const value = record.file_path || record.path || record.filename || record.file || record.filepath;
  if (value) return String(value);
  for (const key of Object.keys(record)) {
    if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
      return String(record[key]);
    }
  }
  return '';
}

function normalizeDelegatedTaskInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const record = input as Record<string, unknown>;
  if (typeof record.input === 'string') {
    try {
      const parsed = JSON.parse(record.input);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return record;
    }
  }
  return record;
}

export function getToolInputSummary(toolName: string, input: unknown): string {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  switch (toolName) {
  case 'read_file':
  case 'write_file':
  case 'edit_file':
    return filePath(input);
  case 'glob':
    return [
      record.pattern ? String(record.pattern) : '',
      record.cwd ? `in ${record.cwd}` : '',
    ].filter(Boolean).join(' ');
  case 'grep':
    return [
      record.pattern ? `"${record.pattern}"` : '',
      record.file_pattern ? `(${record.file_pattern})` : '',
    ].filter(Boolean).join(' ');
  case 'shell':
  case 'shell_background':
    return record.command ? `$ ${String(record.command)}` : '';
  case 'ls':
    return String(record.directory || record.path || '.');
  case 'web_search':
    return record.query ? `"${record.query}"` : '';
  case 'web_fetch':
    return record.url ? String(record.url) : '';
  case 'task_create':
    return record.title ? `"${record.title}"` : '';
  case 'task_update':
    return record.id ? `#${record.id} → ${record.status || ''}` : '';
  case 'task_get':
    return record.id ? `#${record.id}` : '';
  case 'ask_user_question':
    return record.question
      ? `"${String(record.question).slice(0, 50)}${String(record.question).length > 50 ? '...' : ''}"`
      : '';
  case 'enter_plan_mode':
    return 'Starting plan...';
  case 'exit_plan_mode':
    return 'Submitting plan';
  case 'memory_write':
  case 'memory_read':
    return record.key ? String(record.key) : '';
  case 'memory_search':
  case 'rag_search':
    return record.query
      ? `"${String(record.query).slice(0, 80)}${String(record.query).length > 80 ? '...' : ''}"`
      : '';
  case 'task': {
    const taskInput = normalizeDelegatedTaskInput(input);
    const agentName = taskInput.subagent_type || taskInput.agent || taskInput.name;
    const description = taskInput.description || taskInput.prompt || taskInput.task;
    let detail = agentName ? `agent ${agentName}` : '';
    if (description && description !== 'Delegated sub-agent task') {
      const text = String(description);
      detail += ` "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`;
    }
    return detail;
  }
  case 'list_skills':
    return 'available';
  case 'read_skill':
    return record.name ? String(record.name) : '';
  case 'list_agents':
    return 'available';
  case 'cast_command':
    return record.command ? String(record.command) : '';
  case 'mcp_list_servers':
    return 'Listing MCP servers';
  case 'mcp_list_tools':
    return record.server ? `server=${record.server}` : '(all servers)';
  default: {
    const keys = Object.keys(record);
    if (keys.length === 0) return '';
    const firstVal = String(record[keys[0]]).slice(0, 60);
    return `${keys[0]}=${firstVal}`;
  }
  }
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs < 0) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

export function getToolResultSummary(toolName: string, output: string): string {
  const trimmed = output.trim();
  if (!trimmed) return 'done';

  switch (toolName) {
  case 'read_file': {
    const lineCount = output.split('\n').length;
    const bytes = output.length;
    const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    return `${lineCount} line${lineCount === 1 ? '' : 's'}, ${size}`;
  }
  case 'write_file':
  case 'edit_file':
    if (/^error/i.test(trimmed)) {
      return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
    }
    return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
  case 'glob':
  case 'grep': {
    const count = output.split('\n').filter((line) => line.trim()).length;
    return count === 0 ? 'no matches' : `${count} match${count === 1 ? '' : 'es'}`;
  }
  case 'shell':
  case 'shell_background': {
    const lines = output.split('\n').filter((line, index) => index === 0 || line.trim());
    return `${lines.length} line${lines.length === 1 ? '' : 's'}`;
  }
  case 'ls': {
    const count = output.split('\n').filter((line) => line.trim()).length;
    return `${count} item${count === 1 ? '' : 's'}`;
  }
  case 'memory_write':
    return 'saved';
  case 'cast_command':
    if (/denied/i.test(output)) return 'denied';
    return 'output returned';
  default: {
    const lines = output.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return 'done';
    if (lines.length === 1) {
      return lines[0].length > 80 ? `${lines[0].slice(0, 79)}…` : lines[0];
    }
    return `${lines.length} lines`;
  }
  }
}

export function getToolOutputBodyLines(toolName: string, output: string, maxLines = 40): string[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  const cap = (lines: string[], lineMax = 130): string[] => {
    const visible = lines.slice(0, maxLines);
    const more = lines.length > maxLines ? lines.length - maxLines : 0;
    const rows = visible.map((line) => line.slice(0, lineMax));
    if (more > 0) {
      rows.push(`… ${more} more line${more === 1 ? '' : 's'}`);
    }
    return rows;
  };

  switch (toolName) {
  case 'read_file':
    return cap(output.split('\n'), 120);
  case 'glob':
  case 'grep':
  case 'ls':
    return cap(output.split('\n').filter((line) => line.trim()), 100);
  case 'shell':
  case 'shell_background':
    return cap(output.split('\n').filter((line, index) => index === 0 || line.trim()), 150);
  case 'web_search':
  case 'web_fetch':
  case 'memory_read':
  case 'memory_search':
  case 'rag_search':
    return cap(output.split('\n').filter((line) => line.trim()), 120);
  default:
    return cap(output.split('\n').filter((line) => line.trim()), 120);
  }
}
