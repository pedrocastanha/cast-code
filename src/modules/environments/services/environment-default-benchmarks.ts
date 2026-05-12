import type { BenchmarkDefinition } from '../../benchmark/types';

type BenchmarkFactory = (projectRoot: string) => BenchmarkDefinition;

const timestamp = '2026-05-08T00:00:00.000Z';

export const DEFAULT_ENVIRONMENT_BENCHMARKS: Record<string, BenchmarkFactory> = {
  'marketing-campaign-brief': (projectRoot) => ({
    id: 'marketing-campaign-brief',
    projectRoot,
    name: 'Marketing campaign brief smoke',
    description: 'Checks whether a marketing environment can produce a campaign brief with audience, positioning, channel plan, and metrics.',
    target: {
      type: 'environment_task',
      config: {
        environmentId: 'marketing',
        task: 'campaign_brief',
      },
    },
    cases: [
      {
        id: 'campaign-brief-b2b',
        input: 'Create a campaign brief for a B2B SaaS launch aimed at revenue leaders.',
        expected: 'audience',
      },
    ],
    graders: [
      { id: 'includes-audience', type: 'string_check', config: { value: 'audience' }, weight: 0.25 },
      { id: 'includes-positioning', type: 'regex', config: { pattern: 'positioning|posicionamento', flags: 'i' }, weight: 0.25 },
      { id: 'includes-channel', type: 'regex', config: { pattern: 'channel|canal|channels|canais', flags: 'i' }, weight: 0.25 },
      { id: 'includes-metric', type: 'regex', config: { pattern: 'metric|métrica|kpi|cpa|cac|roas', flags: 'i' }, weight: 0.25 },
    ],
    budget: { maxCases: 1, allowLlmJudge: false },
    tags: ['environment', 'marketing', 'smoke'],
    environmentId: 'marketing',
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
  'design-implementation-smoke': (projectRoot) => ({
    id: 'design-implementation-smoke',
    projectRoot,
    name: 'Design implementation smoke',
    description: 'Checks whether a design environment covers design tokens, responsive states, accessibility, and visual verification.',
    target: {
      type: 'environment_task',
      config: {
        environmentId: 'design',
        task: 'ui_implementation_plan',
      },
    },
    cases: [
      {
        id: 'landing-ui-brief',
        input: 'Plan a Figma-to-React implementation for a pricing page.',
        expected: 'accessibility',
      },
    ],
    graders: [
      { id: 'includes-tokens', type: 'regex', config: { pattern: 'token|spacing|typography|color', flags: 'i' }, weight: 0.25 },
      { id: 'includes-responsive', type: 'regex', config: { pattern: 'responsive|breakpoint|mobile', flags: 'i' }, weight: 0.25 },
      { id: 'includes-accessibility', type: 'string_check', config: { value: 'accessibility' }, weight: 0.25 },
      { id: 'includes-visual-qa', type: 'regex', config: { pattern: 'visual qa|screenshot|playwright', flags: 'i' }, weight: 0.25 },
    ],
    budget: { maxCases: 1, allowLlmJudge: false },
    tags: ['environment', 'design', 'smoke'],
    environmentId: 'design',
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
  'engineering-code-review-smoke': (projectRoot) => ({
    id: 'engineering-code-review-smoke',
    projectRoot,
    name: 'Engineering code review smoke',
    description: 'Checks whether an engineering environment reviews changes through risks, tests, impact, and concrete file-level findings.',
    target: {
      type: 'environment_task',
      config: {
        environmentId: 'engineering',
        task: 'code_review',
      },
    },
    cases: [
      {
        id: 'review-api-change',
        input: 'Review a small API change that touches validation and database writes.',
        expected: 'risk',
      },
    ],
    graders: [
      { id: 'includes-risk', type: 'string_check', config: { value: 'risk' }, weight: 0.25 },
      { id: 'includes-test', type: 'regex', config: { pattern: 'test|tests|coverage|regression', flags: 'i' }, weight: 0.25 },
      { id: 'includes-impact', type: 'regex', config: { pattern: 'impact|blast radius|behavior', flags: 'i' }, weight: 0.25 },
      { id: 'includes-file-reference', type: 'regex', config: { pattern: '\\b[\\w./-]+\\.(ts|tsx|js|jsx|py|go|rs)\\b', flags: 'i' }, weight: 0.25 },
    ],
    budget: { maxCases: 1, allowLlmJudge: false },
    tags: ['environment', 'engineering', 'smoke'],
    environmentId: 'engineering',
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
};
