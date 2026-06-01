import { Injectable, Optional } from '@nestjs/common';
import { EnvironmentResolverService } from '../../environments/services/environment-resolver.service';
import type { ResolvedCastEnvironmentManifest } from '../../environments/types';
import type { CreateScheduleInput } from '../types';

export interface ScheduleSuggestion {
  id: string;
  environmentId: string;
  name: string;
  description: string;
  cronExpression: string;
  task: string;
  input: string;
  approvalPolicy: CreateScheduleInput['approvalPolicy'];
  tags: string[];
}

const TEMPLATES: Record<string, Omit<ScheduleSuggestion, 'environmentId'>> = {
  'daily-performance-digest': {
    id: 'daily-performance-digest',
    name: 'Daily performance digest',
    description: 'Summarize marketing channel performance and point out changes worth reviewing.',
    cronExpression: '0 9 * * 1-5',
    task: 'Prepare a concise marketing performance digest using configured read-only sources.',
    input: 'Review the latest campaign metrics and produce wins, risks, anomalies, and next actions.',
    approvalPolicy: 'dry-run-only',
    tags: ['marketing', 'digest'],
  },
  'weekly-campaign-review': {
    id: 'weekly-campaign-review',
    name: 'Weekly campaign review',
    description: 'Review campaign positioning, channel learning, and experiments for the coming week.',
    cronExpression: '0 10 * * 1',
    task: 'Run a weekly campaign review and propose improvements without publishing changes.',
    input: 'Audit active and recent campaigns against brand voice, audience fit, spend efficiency, and experiment backlog.',
    approvalPolicy: 'dry-run-only',
    tags: ['marketing', 'campaigns'],
  },
  'weekly-visual-qa': {
    id: 'weekly-visual-qa',
    name: 'Weekly visual QA',
    description: 'Check product UI quality against design system, accessibility, and visual consistency.',
    cronExpression: '0 10 * * 1',
    task: 'Run visual QA against key surfaces and create a prioritized fix list.',
    input: 'Inspect recent UI changes for layout regressions, accessibility gaps, design-system drift, and copy issues.',
    approvalPolicy: 'dry-run-only',
    tags: ['design', 'visual-qa'],
  },
  'nightly-test-health': {
    id: 'nightly-test-health',
    name: 'Nightly test health',
    description: 'Review test failures, flaky areas, and risky code paths after daily development.',
    cronExpression: '0 2 * * *',
    task: 'Review engineering test health and identify high-confidence fixes.',
    input: 'Analyze recent test output, changed code paths, and reliability risks. Return a prioritized engineering plan.',
    approvalPolicy: 'dry-run-only',
    tags: ['engineering', 'tests'],
  },
  'weekly-dependency-review': {
    id: 'weekly-dependency-review',
    name: 'Weekly dependency review',
    description: 'Inspect dependency updates for security, breaking changes, and upgrade priority.',
    cronExpression: '0 11 * * 1',
    task: 'Review dependency health and produce an upgrade plan.',
    input: 'Check dependency freshness, vulnerabilities, runtime impact, and migration risk. Do not modify files.',
    approvalPolicy: 'dry-run-only',
    tags: ['engineering', 'dependencies'],
  },
};

@Injectable()
export class ScheduleSuggestionService {
  constructor(
    @Optional()
    private readonly environments?: EnvironmentResolverService,
  ) {}

  async list(projectRoot: string, environmentId?: string): Promise<ScheduleSuggestion[]> {
    const environments = await this.resolveEnvironments(projectRoot, environmentId);
    return environments.flatMap((environment) =>
      environment.schedules.suggested.map((suggestionId) => this.fromTemplate(environment.id, suggestionId)).filter(Boolean) as ScheduleSuggestion[],
    );
  }

  async get(projectRoot: string, suggestionId: string, environmentId?: string): Promise<ScheduleSuggestion | null> {
    const suggestions = await this.list(projectRoot, environmentId);
    return suggestions.find((suggestion) => suggestion.id === suggestionId) ?? null;
  }

  toCreateInput(suggestion: ScheduleSuggestion, projectRoot: string): CreateScheduleInput {
    return {
      projectRoot,
      name: suggestion.name,
      description: suggestion.description,
      cronExpression: suggestion.cronExpression,
      target: {
        type: 'environment_task',
        ref: suggestion.id,
        config: {
          task: suggestion.task,
          input: suggestion.input,
          dryRun: true,
        },
      },
      environmentId: suggestion.environmentId,
      approvalPolicy: suggestion.approvalPolicy,
      budget: {
        maxCases: 1,
        maxTokens: 20_000,
        maxCostUsd: 0.5,
        allowLlmJudge: false,
      },
      maxRuntimeMs: 10 * 60 * 1000,
      tags: suggestion.tags,
    };
  }

  private async resolveEnvironments(projectRoot: string, environmentId?: string): Promise<ResolvedCastEnvironmentManifest[]> {
    if (!this.environments) {
      return [];
    }
    if (environmentId) {
      const environment = await this.environments.resolve(environmentId, projectRoot);
      return environment ? [environment] : [];
    }
    return this.environments.list(projectRoot);
  }

  private fromTemplate(environmentId: string, suggestionId: string): ScheduleSuggestion | null {
    const template = TEMPLATES[suggestionId];
    if (!template) {
      return {
        id: suggestionId,
        environmentId,
        name: this.title(suggestionId),
        description: `Suggested ${environmentId} schedule from the environment manifest.`,
        cronExpression: '0 9 * * 1',
        task: `Run the ${suggestionId} workflow for the ${environmentId} environment.`,
        input: `Execute ${suggestionId} and return a concise report with findings, risks, and next actions.`,
        approvalPolicy: 'dry-run-only',
        tags: [environmentId, suggestionId],
      };
    }
    return { ...template, environmentId };
  }

  private title(value: string): string {
    return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
  }
}
