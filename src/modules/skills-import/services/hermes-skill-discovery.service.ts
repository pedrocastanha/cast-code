import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import { glob } from 'glob';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { DiscoveredHermesSkill } from '../types/skills-import.types';

@Injectable()
export class HermesSkillDiscoveryService {
  async discover(repoPath: string): Promise<DiscoveredHermesSkill[]> {
    const root = path.resolve(repoPath);
    await fs.access(root);

    const skillFiles = await glob(path.join(root, '**', 'SKILL.md'), {
      nodir: true,
      dot: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    const discovered = await Promise.all(
      skillFiles.sort().map(async (filePath) => this.parseSkill(root, filePath)),
    );

    return discovered;
  }

  private async parseSkill(root: string, filePath: string): Promise<DiscoveredHermesSkill> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(raw);
    const skillDir = path.dirname(filePath);
    const sourcePath = this.toPosix(path.relative(root, filePath));
    const name = String(parsed.data.name || path.basename(skillDir));
    const description = String(parsed.data.description || '');
    const supportFiles = await this.findSupportFiles(root, skillDir, filePath);

    return {
      name,
      description,
      sourcePath,
      body: parsed.content.trim(),
      supportFiles,
      frontmatter: parsed.data,
    };
  }

  private async findSupportFiles(root: string, skillDir: string, skillPath: string): Promise<string[]> {
    const files = await glob(path.join(skillDir, '**', '*'), {
      nodir: true,
      dot: true,
      ignore: [skillPath],
    });

    return files
      .map((file) => this.toPosix(path.relative(root, file)))
      .sort();
  }

  private toPosix(value: string): string {
    return value.split(path.sep).join('/');
  }
}
