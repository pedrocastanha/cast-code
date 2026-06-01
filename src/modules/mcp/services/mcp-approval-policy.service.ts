import { Injectable } from '@nestjs/common';
import { getTemplate } from '../catalog/mcp-templates';

export type McpPolicyMode = 'allowed' | 'approval-required' | 'blocked' | 'dry-run-only';

export interface McpPolicyDecision {
  allowed: boolean;
  mode: McpPolicyMode;
  reason?: string;
}

const META_READ_PATTERNS = [
  /^list_/i,
  /^get_/i,
  /insights?/i,
];

const MUTATION_PATTERNS = [
  /(^|[_\s-])(create|update|publish|delete|archive|write|mutate|set)([_\s-]|$)/i,
  /\bcreate\b/i,
  /\bupdate\b/i,
  /\bpublish\b/i,
  /\bdelete\b/i,
  /\barchive\b/i,
  /\bwrite\b/i,
  /^write_/i,
  /_write_/i,
  /\bmutate\b/i,
  /\bset_/i,
];

@Injectable()
export class McpApprovalPolicyService {
  evaluateTool(serverName: string, toolName: string): McpPolicyDecision {
    const normalized = toolName.toLowerCase();
    const template = getTemplate(serverName);
    const isMutation = MUTATION_PATTERNS.some((pattern) => pattern.test(normalized));

    if (serverName === 'meta-ads') {
      if (META_READ_PATTERNS.some((pattern) => pattern.test(normalized)) && !isMutation) {
        return { allowed: true, mode: 'allowed' };
      }

      return {
        allowed: false,
        mode: 'blocked',
        reason: 'Meta Ads mutations are blocked by default. Use a dry-run or approval-gated workflow before changing campaigns.',
      };
    }

    if (template?.mutationPolicy === 'blocked-by-default' && isMutation) {
      return {
        allowed: false,
        mode: 'blocked',
        reason: `${template.name} mutations are blocked by default.`,
      };
    }

    if (template?.mutationPolicy === 'read-only' && isMutation) {
      return {
        allowed: false,
        mode: 'blocked',
        reason: `${template.name} is read-only; mutation "${toolName}" is not allowed.`,
      };
    }

    if (template?.mutationPolicy === 'approval-required' && isMutation) {
      return {
        allowed: false,
        mode: 'approval-required',
        reason: `${template.name} mutation "${toolName}" requires explicit approval.`,
      };
    }

    return { allowed: true, mode: 'allowed' };
  }
}
