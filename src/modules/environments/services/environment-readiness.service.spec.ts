import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { EnvironmentReadinessService } from './environment-readiness.service';
import type { ResolvedCastEnvironmentManifest } from '../types';

const manifest: ResolvedCastEnvironmentManifest = {
  version: 1,
  source: 'builtin',
  id: 'marketing',
  name: 'Marketing',
  description: 'Marketing environment',
  defaultAgent: 'marketing-agent',
  skills: { required: ['marketing-campaign'], optional: [] },
  mcp: { recommended: ['brave-search'], required: ['meta-ads'] },
  permissions: { defaultMode: 'read-only', requireApproval: ['ad_spend'] },
  rag: { recommendedSources: ['brand-guide'] },
  benchmarks: { smoke: ['marketing-campaign-brief'] },
  schedules: { suggested: [] },
};

describe('EnvironmentReadinessService', () => {
  test('blocks on missing required skills or MCPs and warns on recommended setup', async () => {
    const service = new EnvironmentReadinessService(
      { getUnscopedSkillNames: () => ['marketing-campaign'] } as any,
      { getUnscopedServerNames: () => [] } as any,
      { listDefinitions: async () => [] } as any,
    );

    const report = await service.inspect('/repo', manifest);

    assert.equal(report.status, 'blocked');
    assert(report.checks.some((check) => check.kind === 'mcp' && check.id === 'meta-ads' && check.status === 'blocked'));
    assert(report.checks.some((check) => check.kind === 'rag' && check.status === 'warning'));
    assert(report.checks.some((check) => check.kind === 'benchmark' && check.status === 'ready'));
  });
});
