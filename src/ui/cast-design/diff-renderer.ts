import { diffLines } from 'diff';
import { Colors } from '../../modules/repl/utils/theme';

const CONTEXT = 2;

/**
 * Renders a compact colored line diff. Unchanged spans longer than
 * 2*CONTEXT+1 collapse to a '⋮' marker. Output capped at maxLines with a
 * trailing '… N more lines' marker.
 */
export function renderDiffLines(
  oldText: string,
  newText: string,
  maxLines = 40,
): string[] {
  const parts = diffLines(oldText, newText);
  const raw: string[] = [];

  for (const part of parts) {
    const lines = part.value.replace(/\n$/, '').split('\n');
    if (part.added) {
      for (const line of lines) raw.push(`${Colors.green}+ ${line}${Colors.reset}`);
    } else if (part.removed) {
      for (const line of lines) raw.push(`${Colors.red}- ${line}${Colors.reset}`);
    } else {
      if (lines.length > CONTEXT * 2 + 1) {
        for (const line of lines.slice(0, CONTEXT)) raw.push(`${Colors.dim}  ${line}${Colors.reset}`);
        raw.push(`${Colors.dim}  ⋮${Colors.reset}`);
        for (const line of lines.slice(-CONTEXT)) raw.push(`${Colors.dim}  ${line}${Colors.reset}`);
      } else {
        for (const line of lines) raw.push(`${Colors.dim}  ${line}${Colors.reset}`);
      }
    }
  }

  if (raw.length > maxLines) {
    const remainder = raw.length - maxLines;
    return [...raw.slice(0, maxLines), `${Colors.dim}… ${remainder} more lines${Colors.reset}`];
  }
  return raw;
}
