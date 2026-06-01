import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  BenchmarkCandidateSource,
  BenchmarkTarget,
  BenchmarkTargetCandidate,
} from '../types';

export interface RouteDiscoveryOptions {
  projectRoot: string;
  source: BenchmarkCandidateSource;
  query?: string;
  baseUrl?: string;
}

const ROUTE_VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.cast',
  '.cast.worktrees',
  '.turbo',
  '.cache',
]);

@Injectable()
export class BenchmarkRouteDiscoveryService {
  async discoverFile(filePath: string, options: RouteDiscoveryOptions): Promise<BenchmarkTargetCandidate[]> {
    const absolutePath = path.resolve(options.projectRoot, filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const candidates = [
      ...this.scanExpressLike(content, absolutePath, options),
      ...this.scanNest(content, absolutePath, options),
      ...this.scanNextRoute(content, absolutePath, options),
      ...this.scanOpenApi(content, absolutePath, options),
    ];
    return this.filterAndSort(candidates, options.query);
  }

  async discoverProject(projectRoot: string): Promise<BenchmarkTargetCandidate[]> {
    const files = await this.listCandidateFiles(projectRoot);
    const candidates: BenchmarkTargetCandidate[] = [];

    for (const file of files) {
      try {
        candidates.push(...await this.discoverFile(file, {
          projectRoot,
          source: this.isOpenApiFile(file) ? 'openapi' : 'project_discovery',
        }));
      } catch {
        // Discovery is best-effort; unreadable files should not block the wizard.
      }
    }

    return this.dedupe(candidates).sort((a, b) => b.confidence - a.confidence);
  }

  private scanExpressLike(content: string, filePath: string, options: RouteDiscoveryOptions): BenchmarkTargetCandidate[] {
    const candidates: BenchmarkTargetCandidate[] = [];
    const routePattern = /\b(?:app|router|fastify)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match: RegExpExecArray | null;

    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = this.normalizeRoutePath(match[2]);
      candidates.push(this.buildApiCandidate({
        source: options.source,
        filePath,
        method,
        routePath,
        confidence: 0.88,
        evidence: [match[0]],
        baseUrl: options.baseUrl,
        body: this.inferBodyTemplate(content),
      }));
    }

    return candidates;
  }

  private scanNest(content: string, filePath: string, options: RouteDiscoveryOptions): BenchmarkTargetCandidate[] {
    const candidates: BenchmarkTargetCandidate[] = [];
    const controllerPrefix = this.normalizeRoutePath(this.firstDecoratorArg(content, 'Controller') ?? '');
    const routePattern = /@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)\s*(?:\r?\n|\s)*([\w$]+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = this.joinRoutes(controllerPrefix, this.normalizeRoutePath(match[2] ?? ''));
      candidates.push(this.buildApiCandidate({
        source: options.source,
        filePath,
        method,
        routePath,
        handlerName: match[3],
        confidence: 0.9,
        evidence: [match[0].trim()],
        baseUrl: options.baseUrl,
        body: this.inferBodyTemplate(content),
      }));
    }

    return candidates;
  }

  private scanNextRoute(content: string, filePath: string, options: RouteDiscoveryOptions): BenchmarkTargetCandidate[] {
    if (!/[\\/]app[\\/]api[\\/].+[\\/]route\.[cm]?[tj]s$/.test(filePath)) {
      return [];
    }

    const routePath = this.routePathFromNextFile(filePath, options.projectRoot);
    const candidates: BenchmarkTargetCandidate[] = [];
    const exportPattern = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = exportPattern.exec(content)) !== null) {
      candidates.push(this.buildApiCandidate({
        source: options.source,
        filePath,
        method: match[1],
        routePath,
        handlerName: match[1],
        confidence: 0.9,
        evidence: [match[0]],
        baseUrl: options.baseUrl,
        body: this.inferBodyTemplate(content),
      }));
    }

    return candidates;
  }

  private scanOpenApi(content: string, filePath: string, options: RouteDiscoveryOptions): BenchmarkTargetCandidate[] {
    if (!this.isOpenApiFile(filePath)) {
      return [];
    }

    const paths = this.parseOpenApiPaths(content);
    const candidates: BenchmarkTargetCandidate[] = [];

    for (const [routePath, methods] of Object.entries(paths)) {
      for (const verb of ROUTE_VERBS) {
        const operation = methods[verb];
        if (!operation) {
          continue;
        }
        candidates.push(this.buildApiCandidate({
          source: 'openapi',
          filePath,
          method: verb.toUpperCase(),
          routePath,
          handlerName: operation.operationId,
          confidence: 0.95,
          evidence: [`openapi ${verb.toUpperCase()} ${routePath}`],
          baseUrl: options.baseUrl,
          body: { input: '{{input}}' },
        }));
      }
    }

    return candidates;
  }

  private buildApiCandidate(input: {
    source: BenchmarkCandidateSource;
    filePath: string;
    method: string;
    routePath: string;
    handlerName?: string;
    confidence: number;
    evidence: string[];
    baseUrl?: string;
    body: Record<string, string>;
  }): BenchmarkTargetCandidate {
    const config: Record<string, unknown> = { method: input.method };
    if (input.baseUrl) {
      config.url = this.joinUrl(input.baseUrl, input.routePath);
    }
    if (input.method !== 'GET') {
      config.body = input.body;
    }

    const target: BenchmarkTarget = {
      type: 'api_endpoint',
      config,
    };

    return {
      id: this.candidateId(input.method, input.routePath, input.filePath),
      type: 'api_endpoint',
      label: `${input.method} ${input.routePath || '/'}`,
      confidence: input.confidence,
      filePath: input.filePath,
      method: input.method,
      routePath: input.routePath || '/',
      handlerName: input.handlerName,
      source: input.source,
      target,
      requiresServer: true,
      requiresWrite: false,
      risk: 'low',
      evidence: input.evidence,
    };
  }

  private async listCandidateFiles(root: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            await walk(fullPath);
          }
          continue;
        }
        if (this.isCodeFile(entry.name) || this.isOpenApiFile(fullPath)) {
          files.push(fullPath);
        }
      }
    };

    await walk(root);
    return files;
  }

  private filterAndSort(candidates: BenchmarkTargetCandidate[], query?: string): BenchmarkTargetCandidate[] {
    const normalizedQuery = this.normalizeQuery(query);
    const filtered = normalizedQuery
      ? candidates.filter((candidate) => this.candidateSearchText(candidate).includes(normalizedQuery))
      : candidates;
    return this.dedupe(filtered).sort((a, b) => b.confidence - a.confidence);
  }

  private candidateSearchText(candidate: BenchmarkTargetCandidate): string {
    return [
      candidate.method,
      candidate.routePath,
      candidate.handlerName,
      candidate.label,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  private normalizeQuery(query?: string): string {
    return (query ?? '')
      .toLowerCase()
      .replace(/^endpoint\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private dedupe(candidates: BenchmarkTargetCandidate[]): BenchmarkTargetCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.method}:${candidate.routePath}:${candidate.filePath}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private firstDecoratorArg(content: string, name: string): string | undefined {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`@${escapedName}\\s*\\(\\s*['"\`]([^'"\`]*)['"\`]`).exec(content);
    return match?.[1];
  }

  private inferBodyTemplate(content: string): Record<string, string> {
    if (/\bbody\.message\b|@Body\(['"`]message['"`]\)/.test(content)) {
      return { message: '{{input}}' };
    }
    if (/\bbody\.input\b|@Body\(['"`]input['"`]\)/.test(content)) {
      return { input: '{{input}}' };
    }
    if (/\bbody\.prompt\b|@Body\(['"`]prompt['"`]\)/.test(content)) {
      return { prompt: '{{input}}' };
    }
    return { input: '{{input}}' };
  }

  private routePathFromNextFile(filePath: string, root: string): string {
    const relative = path.relative(root, filePath).replace(/\\/g, '/');
    const routePath = relative
      .replace(/^app\/api\//, '/api/')
      .replace(/\/route\.[cm]?[tj]s$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1');
    return this.normalizeRoutePath(routePath);
  }

  private parseOpenApiPaths(content: string): Record<string, Record<string, { operationId?: string }>> {
    try {
      return JSON.parse(content).paths ?? {};
    } catch {
      return this.parseSimpleYamlOpenApiPaths(content);
    }
  }

  private parseSimpleYamlOpenApiPaths(content: string): Record<string, Record<string, { operationId?: string }>> {
    const paths: Record<string, Record<string, { operationId?: string }>> = {};
    let insidePaths = false;
    let currentPath = '';
    let currentVerb = '';

    for (const line of content.split(/\r?\n/)) {
      const pathsMatch = /^paths:\s*$/.exec(line);
      if (pathsMatch) {
        insidePaths = true;
        continue;
      }
      if (!insidePaths) {
        continue;
      }

      const routeMatch = /^\s{2}(['"]?\/[^:'"]+['"]?):\s*$/.exec(line);
      if (routeMatch) {
        currentPath = routeMatch[1].replace(/^['"]|['"]$/g, '');
        paths[currentPath] = paths[currentPath] ?? {};
        currentVerb = '';
        continue;
      }

      const verbMatch = /^\s{4}(get|post|put|patch|delete):\s*$/.exec(line);
      if (verbMatch && currentPath) {
        currentVerb = verbMatch[1];
        paths[currentPath][currentVerb] = {};
        continue;
      }

      const operationMatch = /^\s{6}operationId:\s*['"]?([^'"]+)['"]?\s*$/.exec(line);
      if (operationMatch && currentPath && currentVerb) {
        paths[currentPath][currentVerb].operationId = operationMatch[1];
      }
    }

    return paths;
  }

  private normalizeRoutePath(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
      return '';
    }
    return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
  }

  private joinRoutes(prefix: string, routePath: string): string {
    return this.normalizeRoutePath(`${prefix}/${routePath}`.replace(/\/+/g, '/'));
  }

  private joinUrl(baseUrl: string, routePath: string): string {
    const normalizedPath = this.normalizeRoutePath(routePath);
    return `${baseUrl.replace(/\/+$/g, '')}${normalizedPath || '/'}`;
  }

  private candidateId(method: string, routePath: string, filePath: string): string {
    return `api:${method.toLowerCase()}:${routePath || '/'}:${path.basename(filePath)}`.replace(/[^a-z0-9:/._-]+/gi, '-');
  }

  private isCodeFile(fileName: string): boolean {
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(fileName);
  }

  private isOpenApiFile(filePath: string): boolean {
    return /(?:openapi|swagger)\.(json|ya?ml)$/i.test(filePath);
  }
}
