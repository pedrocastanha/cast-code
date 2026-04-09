import { ToolOutputTransform } from '../types';

export const lsTransform: ToolOutputTransform = {
  toolName: 'ls',
  transform: (raw: string): string => {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (lines.length <= 20) return raw;

    const dirs = lines.filter((l) => l.endsWith('/') || l.trim().endsWith('/'));
    const files = lines.filter((l) => !l.endsWith('/') && !l.trim().endsWith('/'));

    const byExt = new Map<string, number>();
    for (const f of files) {
      const name = f.trim().replace(/^[\s*]+|[\s*]+$/g, '');
      const parts = name.split('.');
      const ext = parts.length > 1 ? `.${parts[parts.length - 1]}` : '(no ext)';
      byExt.set(ext, (byExt.get(ext) || 0) + 1);
    }

    const extSummary = Array.from(byExt.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ext, count]) => `${count} ${ext}`)
      .join(', ');

    const dirList = dirs
      .slice(0, 15)
      .map((d) => d.trim().replace(/\/$/, ''))
      .join(', ');
    const dirSuffix = dirs.length > 15 ? `, +${dirs.length - 15} more` : '';

    return [
      `${dirs.length} directories, ${files.length} files`,
      `Dirs: ${dirList}${dirSuffix}`,
      `Files by type: ${extSummary}`,
    ].join('\n');
  },
};

export const grepTransform: ToolOutputTransform = {
  toolName: 'grep',
  transform: (raw: string): string => {
    const lines = raw.split('\n').filter((l) => l.trim());

    if (lines.length === 0 || raw.includes('no matches')) {
      return 'No matches found.';
    }

    if (lines.length <= 30) return raw;

    const fileMatches = new Map<string, number>();
    for (const line of lines) {
      const match = line.match(/^([^:]+):/);
      if (match) {
        const file = match[1];
        fileMatches.set(file, (fileMatches.get(file) || 0) + 1);
      }
    }

    const filesSummary = Array.from(fileMatches.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, count]) => `${file} (${count})`)
      .join('\n');
    const fileSuffix = fileMatches.size > 10 ? `\n... and ${fileMatches.size - 10} more files` : '';

    const head = lines.slice(0, 15).join('\n');
    const tail = lines.slice(-5).join('\n');

    return [
      `${lines.length} matches across ${fileMatches.size} files:`,
      '',
      filesSummary + fileSuffix,
      '',
      '--- First matches ---',
      head,
      '--- Last matches ---',
      tail,
    ].join('\n');
  },
};

export const shellTransform: ToolOutputTransform = {
  toolName: 'shell',
  transform: (raw: string): string => {
    let cleaned = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    const lines = cleaned.split('\n');

    const hasError =
      lines.some((l) => /^error[:\s]/i.test(l.trim())) ||
      lines.some((l) => /^fatal:/i.test(l.trim())) ||
      lines.some((l) => /^E\d{4}/.test(l.trim())) ||
      cleaned.includes('Command failed');

    if (hasError) {
      return cleaned;
    }

    if (lines.length <= 80) return cleaned;

    const head = lines.slice(0, 60).join('\n');
    const tail = lines.slice(-10).join('\n');
    return `${head}\n\n... [${lines.length - 70} lines truncated] ...\n\n${tail}`;
  },
};

export const readFileTransform: ToolOutputTransform = {
  toolName: 'read_file',
  transform: (raw: string, input?: Record<string, unknown>): string => {
    const lines = raw.split('\n');

    if (lines.length <= 200) return raw;

    const head = lines.slice(0, 100).join('\n');
    const tail = lines.slice(-50).join('\n');
    const filePath = input?.file_path || input?.path || 'file';

    return [
      `[File: ${filePath} — ${lines.length} lines total, showing first 100 and last 50]`,
      head,
      `... [${lines.length - 150} lines omitted] ...`,
      tail,
    ].join('\n');
  },
};

export const globTransform: ToolOutputTransform = {
  toolName: 'glob',
  transform: (raw: string): string => {
    const lines = raw.split('\n').filter((l) => l.trim());

    if (lines.length <= 50) return raw;
    if (lines.length === 0) return 'No files found.';

    const byDir = new Map<string, number>();
    const byExt = new Map<string, number>();

    for (const line of lines) {
      const parts = line.trim().split('/');
      const dir = parts.length > 1 ? parts[0] : '.';
      byDir.set(dir, (byDir.get(dir) || 0) + 1);

      const ext = line.includes('.') ? `.${line.split('.').pop()}` : '(none)';
      byExt.set(ext, (byExt.get(ext) || 0) + 1);
    }

    const dirSummary = Array.from(byDir.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([dir, count]) => `  ${dir}/ — ${count} files`)
      .join('\n');
    const dirSuffix = byDir.size > 15 ? `\n  ... and ${byDir.size - 15} more directories` : '';

    const extSummary = Array.from(byExt.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ext, count]) => `${count} ${ext}`)
      .join(', ');

    return [
      `${lines.length} files found:`,
      '',
      'By directory:',
      dirSummary + dirSuffix,
      '',
      `By type: ${extSummary}`,
    ].join('\n');
  },
};

export const writeFileTransform: ToolOutputTransform = {
  toolName: 'write_file',
  transform: (raw: string, input?: Record<string, unknown>): string => {
    const path = input?.file_path || input?.path || 'file';
    const lines = raw.split('\n').length;
    const bytes = raw.length;
    const sizeStr = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    return `✓ Wrote ${path} (${lines} lines, ${sizeStr})`;
  },
};

export const editFileTransform: ToolOutputTransform = {
  toolName: 'edit_file',
  transform: (raw: string, input?: Record<string, unknown>): string => {
    const path = input?.file_path || input?.path || 'file';
    if (raw.startsWith('Error') || raw.startsWith('error')) {
      return `✗ Edit failed: ${path}\n${raw.slice(0, 200)}`;
    }
    const lines = raw.split('\n').length;
    return `✓ Edited ${path} (${lines} lines changed)`;
  },
};

export const shellBgTransform: ToolOutputTransform = {
  toolName: 'shell_background',
  transform: (raw: string): string => {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (lines.length <= 10) return raw;
    const head = lines.slice(0, 8).join('\n');
    return `${head}\n... [${lines.length - 8} lines output in background]`;
  },
};

export const taskCreateTransform: ToolOutputTransform = {
  toolName: 'task_create',
  transform: (raw: string, input?: Record<string, unknown>): string => {
    const title = input?.title || input?.subject || 'task';
    const id = input?.id || '';
    return `✓ Task created: #${id} ${title}`;
  },
};

export const taskUpdateTransform: ToolOutputTransform = {
  toolName: 'task_update',
  transform: (raw: string, input?: Record<string, unknown>): string => {
    const id = input?.id || '';
    const status = input?.status || '';
    return `✓ Task #${id} → ${status}`;
  },
};

export const memoryWriteTransform: ToolOutputTransform = {
  toolName: 'memory_write',
  transform: (raw: string, input?: Record<string, unknown>): string => {
    const key = input?.key || '';
    return `✓ Memory saved: ${key}`;
  },
};

export const memoryReadTransform: ToolOutputTransform = {
  toolName: 'memory_read',
  transform: (raw: string): string => {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (lines.length <= 5) return raw;
    return lines.slice(0, 5).join('\n') + `\n... [${lines.length - 5} more lines]`;
  },
};

export const memorySearchTransform: ToolOutputTransform = {
  toolName: 'memory_search',
  transform: (raw: string): string => {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (lines.length <= 5) return raw;
    return lines.slice(0, 5).join('\n') + `\n... [${lines.length - 5} more results]`;
  },
};

export const defaultTransforms: ToolOutputTransform[] = [
  lsTransform,
  grepTransform,
  shellTransform,
  readFileTransform,
  globTransform,
  writeFileTransform,
  editFileTransform,
  shellBgTransform,
  taskCreateTransform,
  taskUpdateTransform,
  memoryWriteTransform,
  memoryReadTransform,
  memorySearchTransform,
];
