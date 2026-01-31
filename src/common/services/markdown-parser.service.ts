import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { ParsedMarkdown } from '../types';

@Injectable()
export class MarkdownParserService {
  async parse<T>(filePath: string): Promise<ParsedMarkdown<T>> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data, content: markdownContent } = matter(content);

    return {
      frontmatter: data as T,
      content: markdownContent.trim(),
    };
  }

  async parseAll<T>(directory: string, pattern = '**/*.md'): Promise<Map<string, ParsedMarkdown<T>>> {
    const files = await glob(path.join(directory, pattern));
    const results = new Map<string, ParsedMarkdown<T>>();

    for (const file of files) {
      const relativePath = path.relative(directory, file);
      const name = relativePath.replace(/\.md$/, '');
      const parsed = await this.parse<T>(file);
      results.set(name, parsed);
    }

    return results;
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
