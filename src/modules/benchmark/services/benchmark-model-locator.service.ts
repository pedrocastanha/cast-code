import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BenchmarkModelOverridePoint } from '../types';

export interface ModelLocatorInput {
  projectRoot: string;
  filePath?: string;
  content?: string;
}

const MODEL_ENV_KEYS = ['OPENAI_MODEL', 'ANTHROPIC_MODEL', 'MODEL', 'LLM_MODEL'];

@Injectable()
export class BenchmarkModelLocatorService {
  async locate(input: ModelLocatorInput): Promise<BenchmarkModelOverridePoint[]> {
    const points: BenchmarkModelOverridePoint[] = [];
    points.push(...await this.locateEnv(input.projectRoot));

    const content = input.content ?? (input.filePath ? await fs.readFile(input.filePath, 'utf-8') : '');
    if (content) {
      points.push(...this.locateInContent(content, input.filePath));
    }

    return this.dedupe(points).sort((a, b) => b.confidence - a.confidence);
  }

  private async locateEnv(projectRoot: string): Promise<BenchmarkModelOverridePoint[]> {
    const points: BenchmarkModelOverridePoint[] = [];

    for (const name of ['.env', '.env.example', '.env.local']) {
      try {
        const filePath = path.join(projectRoot, name);
        const content = await fs.readFile(filePath, 'utf-8');
        for (const key of MODEL_ENV_KEYS) {
          if (new RegExp(`^${key}=`, 'm').test(content)) {
            points.push({
              id: `env:${key}`,
              kind: 'env',
              label: `Environment variable ${key}`,
              filePath,
              key,
              confidence: 0.86,
              requiresWrite: false,
              instructions: `Set ${key} for each benchmark model variant before starting the target.`,
            });
          }
        }
      } catch {
        // Missing env files are normal.
      }
    }

    return points;
  }

  private locateInContent(content: string, filePath?: string): BenchmarkModelOverridePoint[] {
    const points: BenchmarkModelOverridePoint[] = [];

    if (/\b(?:req\.body|body)\.model\b/.test(content)) {
      points.push({
        id: 'request-body:model',
        kind: 'request_body',
        label: 'Request body field model',
        filePath,
        key: 'model',
        confidence: 0.8,
        requiresWrite: false,
        instructions: 'Add a model field to the benchmark request body for each model variant.',
      });
    }

    if (/\b(?:ChatOpenAI|createOpenAI|openai\.chat\.completions|anthropic\.messages|createModel)\b/.test(content)) {
      points.push({
        id: `factory:${filePath ?? 'inline'}`,
        kind: 'code_factory',
        label: 'Model factory in source',
        filePath,
        confidence: 0.72,
        requiresWrite: true,
        instructions: 'Use a controlled wrapper or confirmed config change before overriding this factory.',
      });
    }

    return points;
  }

  private dedupe(points: BenchmarkModelOverridePoint[]): BenchmarkModelOverridePoint[] {
    const seen = new Set<string>();
    return points.filter((point) => {
      const key = `${point.kind}:${point.key ?? point.filePath ?? point.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
