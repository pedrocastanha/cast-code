import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTemplates, getTemplate } from './mcp-templates';

test('MCP templates expose governed catalog metadata', () => {
  for (const template of getAllTemplates()) {
    assert.ok(template.environments.length > 0, `${template.id} environments`);
    assert.ok(['low', 'medium', 'high'].includes(template.risk), `${template.id} risk`);
    assert.ok(['none', 'env', 'oauth'].includes(template.auth), `${template.id} auth`);
    assert.ok(
      ['read-only', 'approval-required', 'blocked-by-default'].includes(template.mutationPolicy),
      `${template.id} mutationPolicy`,
    );
    assert.equal(typeof template.capabilities.tools, 'boolean', `${template.id} tools capability`);
    assert.equal(typeof template.capabilities.resources, 'boolean', `${template.id} resources capability`);
    assert.equal(typeof template.capabilities.prompts, 'boolean', `${template.id} prompts capability`);
  }
});

test('Meta Ads is a high-risk marketing connector blocked by default', () => {
  const meta = getTemplate('meta-ads');

  assert.ok(meta);
  assert.equal(meta.category, 'marketing');
  assert.equal(meta.risk, 'high');
  assert.equal(meta.auth, 'env');
  assert.equal(meta.mutationPolicy, 'blocked-by-default');
  assert.deepEqual(meta.environments, ['marketing']);
});

test('Figma templates include desktop and remote readiness guidance metadata', () => {
  const desktop = getTemplate('figma');
  const remote = getTemplate('figma-remote');

  assert.ok(desktop);
  assert.ok(remote);
  assert.equal(desktop.config.endpoint, 'http://127.0.0.1:3845/mcp');
  assert.equal(desktop.auth, 'none');
  assert.equal(desktop.mutationPolicy, 'approval-required');
  assert.match(desktop.readiness ?? '', /desktop/i);
  assert.equal(remote.auth, 'oauth');
  assert.match(remote.readiness ?? '', /oauth/i);
});
