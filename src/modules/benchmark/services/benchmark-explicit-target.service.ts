import { Injectable } from '@nestjs/common';
import * as path from 'node:path';
import type { BenchmarkTargetCandidate } from '../types';
import { BenchmarkRouteDiscoveryService } from './benchmark-route-discovery.service';

export interface ExplicitBenchmarkTargetResult {
  mentionedPath: string;
  query: string;
  baseUrl?: string;
  expected?: string;
  candidates: BenchmarkTargetCandidate[];
}

@Injectable()
export class BenchmarkExplicitTargetService {
  constructor(private readonly discovery: BenchmarkRouteDiscoveryService) {}

  async resolve(args: string[], projectRoot: string): Promise<ExplicitBenchmarkTargetResult | null> {
    const mention = args.find((arg) => arg.startsWith('@'));
    if (!mention) {
      return null;
    }

    const mentionedPath = path.resolve(projectRoot, mention.slice(1));
    const baseUrl = this.readFlag(args, '--base-url');
    const expected = this.readFlag(args, '--expect');
    const query = args
      .filter((arg) => arg !== mention)
      .filter((arg, index, all) => !this.isFlagValue(arg, index, all))
      .filter((arg) => !arg.startsWith('--'))
      .join(' ')
      .trim();

    const candidates = await this.discovery.discoverFile(mentionedPath, {
      projectRoot,
      source: 'explicit',
      query,
      baseUrl,
    });

    return {
      mentionedPath,
      query,
      baseUrl,
      expected,
      candidates,
    };
  }

  private readFlag(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  }

  private isFlagValue(arg: string, index: number, args: string[]): boolean {
    return index > 0 && args[index - 1].startsWith('--') && !arg.startsWith('--');
  }
}
