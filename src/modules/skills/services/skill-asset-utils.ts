import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';

import { SkillDefinition } from '../types';

export async function collectSkillSupportFiles(packageRoot: string): Promise<string[]> {
  const rootReal = await fs.realpath(packageRoot);
  const files = await glob('**/*', {
    cwd: rootReal,
    nodir: true,
    dot: true,
    follow: false,
  });

  const supportFiles: string[] = [];
  for (const file of files) {
    const normalized = normalizeSlashes(file);
    if (normalized === 'SKILL.md') {
      continue;
    }

    try {
      const targetReal = await fs.realpath(path.join(rootReal, normalized));
      const stat = await fs.stat(targetReal);
      if (stat.isFile() && isInside(rootReal, targetReal)) {
        supportFiles.push(normalized);
      }
    } catch {
      continue;
    }
  }

  return supportFiles.sort();
}

export function packagePathsForSkill(definitionsPath: string, relativePath: string): Pick<
  SkillDefinition,
  'definitionPath' | 'packageRoot' | 'supportFiles'
> {
  const definitionPath = path.join(definitionsPath, `${relativePath}.md`);
  const normalized = normalizeSlashes(relativePath);

  if (normalized === 'SKILL' || normalized.endsWith('/SKILL')) {
    return {
      definitionPath,
      packageRoot: path.dirname(definitionPath),
      supportFiles: [],
    };
  }

  return { definitionPath, supportFiles: [] };
}

export function normalizeSkillRelativePath(value: string): string {
  return normalizeSlashes(value);
}

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeSlashes(value: string): string {
  return value.split(path.sep).join('/').replace(/\\/g, '/');
}
