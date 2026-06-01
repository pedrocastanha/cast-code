import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpApprovalPolicyService } from './mcp-approval-policy.service';

test('Meta Ads policy allows read-only discovery and insights tools', () => {
  const policy = new McpApprovalPolicyService();

  assert.equal(policy.evaluateTool('meta-ads', 'list_campaigns').allowed, true);
  assert.equal(policy.evaluateTool('meta-ads', 'get_insights').allowed, true);
});

test('Meta Ads policy blocks mutation tools by default', () => {
  const policy = new McpApprovalPolicyService();

  const result = policy.evaluateTool('meta-ads', 'publish_ad');

  assert.equal(result.allowed, false);
  assert.equal(result.mode, 'blocked');
  assert.match(result.reason ?? '', /blocked by default/i);
});

test('approval-required templates require explicit approval for mutations', () => {
  const policy = new McpApprovalPolicyService();

  const result = policy.evaluateTool('figma', 'write_to_canvas');

  assert.equal(result.allowed, false);
  assert.equal(result.mode, 'approval-required');
});

test('read-only templates block mutation tools', () => {
  const policy = new McpApprovalPolicyService();

  const result = policy.evaluateTool('context7', 'delete_document');

  assert.equal(result.allowed, false);
  assert.equal(result.mode, 'blocked');
  assert.match(result.reason ?? '', /read-only/i);
});
