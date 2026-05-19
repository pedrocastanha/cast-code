import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { EnvironmentLoaderService } from './environment-loader.service';

describe('EnvironmentLoaderService', () => {
  test('loads built-in environments', async () => {
    const loader = new EnvironmentLoaderService();
    const environments = await loader.list(process.cwd());
    const ids = environments.map((environment) => environment.id);

    assert(ids.includes('marketing'));
    assert(ids.includes('design'));
    assert(ids.includes('engineering'));
  });

  test('allows valid project manifests to override built-ins', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-env-loader-'));
    const environmentDir = join(projectRoot, '.cast', 'environments');
    await mkdir(environmentDir, { recursive: true });
    await writeFile(join(environmentDir, 'marketing.cast-env.yaml'), [
      'version: 1',
      'source: project',
      'id: marketing',
      'name: Project Marketing',
      'description: Project-specific marketing pack.',
      'defaultAgent: project-marketer',
      'skills:',
      '  required: [marketing-campaign]',
      '  optional: []',
      'profiles:',
      '  campaign:',
      '    description: Campaign profile.',
      '    skills:',
      '      required: [marketing-campaign]',
      '      optional: [brand-voice]',
      '    agents:',
      '      required: [coder]',
      '      optional: []',
      'mcp:',
      '  recommended: []',
      '  required: []',
      'permissions:',
      '  defaultMode: read-only',
      '  requireApproval: []',
      'rag:',
      '  recommendedSources: []',
      'benchmarks:',
      '  smoke: []',
      'schedules:',
      '  suggested: []',
    ].join('\n'), 'utf8');

    try {
      const loader = new EnvironmentLoaderService();
      const marketing = await loader.get('marketing', projectRoot);

      assert.equal(marketing?.source, 'project');
      assert.equal(marketing?.name, 'Project Marketing');
      assert.deepEqual(marketing?.skills.required, ['marketing-campaign']);
      const campaign = marketing?.profiles.campaign;
      assert(campaign?.skills);
      assert.deepEqual(campaign.skills.optional, ['brand-voice']);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('ignores project manifests that are not marked as project source', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-env-loader-invalid-'));
    const environmentDir = join(projectRoot, '.cast', 'environments');
    await mkdir(environmentDir, { recursive: true });
    await writeFile(join(environmentDir, 'sales.cast-env.yaml'), [
      'version: 1',
      'id: sales',
      'name: Sales',
      'description: Missing source marker.',
      'defaultAgent: sales-agent',
    ].join('\n'), 'utf8');

    try {
      const loader = new EnvironmentLoaderService();
      const sales = await loader.get('sales', projectRoot);

      assert.equal(sales, null);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
