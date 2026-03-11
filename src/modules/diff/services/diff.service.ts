import { Injectable } from '@nestjs/common';
import * as diffLib from 'diff';
import { colorize } from '../../repl/utils/theme';

export interface FileDiffResult {
  patch: string;
  addedLines: number;
  removedLines: number;
  changedLines: number;
  isEmpty: boolean;
}

@Injectable()
export class DiffService {
  /** Generate a colored unified diff between two file contents */
  generateFileDiff(originalContent: string, newContent: string, filePath: string): FileDiffResult {
    const patch = diffLib.createPatch(filePath, originalContent, newContent, '', '');
    const changes = diffLib.diffLines(originalContent, newContent);

    const addedLines = changes.filter(c => c.added).reduce((n, c) => n + (c.count || 0), 0);
    const removedLines = changes.filter(c => c.removed).reduce((n, c) => n + (c.count || 0), 0);

    return {
      patch: this.colorizePatch(patch),
      addedLines,
      removedLines,
      changedLines: addedLines + removedLines,
      isEmpty: addedLines === 0 && removedLines === 0,
    };
  }

  /** Generate diff for an edit_file operation (old_string → new_string replacement) */
  generateEditDiff(originalContent: string, oldStr: string, newStr: string, filePath: string): FileDiffResult {
    const newContent = originalContent.replace(oldStr, newStr);
    return this.generateFileDiff(originalContent, newContent, filePath);
  }

  /** Format diff result for terminal output */
  formatForDisplay(result: FileDiffResult, filePath: string): string {
    const lines: string[] = [];
    lines.push(colorize(`  ${filePath}`, 'cyan'));
    lines.push(colorize(`  +${result.addedLines} -${result.removedLines}`, result.addedLines > 0 ? 'success' : 'muted'));
    lines.push('');
    // Show the colorized patch (skip the header lines)
    const patchLines = result.patch.split('\n').slice(4); // skip --- +++ @@ header
    lines.push(...patchLines.slice(0, 40)); // cap at 40 lines in preview
    if (patchLines.length > 40) {
      lines.push(colorize(`  ... ${patchLines.length - 40} more lines`, 'muted'));
    }
    return lines.join('\n');
  }

  private colorizePatch(patch: string): string {
    return patch.split('\n').map(line => {
      if (line.startsWith('+++') || line.startsWith('---')) return colorize(line, 'muted');
      if (line.startsWith('+')) return colorize(line, 'success');
      if (line.startsWith('-')) return colorize(line, 'error');
      if (line.startsWith('@@')) return colorize(line, 'info');
      return colorize(line, 'subtle');
    }).join('\n');
  }
}
