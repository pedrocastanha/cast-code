import { Injectable } from '@nestjs/common';

export interface McpRiskScanResult {
  name: string;
  suspicious: boolean;
  reasons: string[];
  warning?: string;
}

const PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'ignore-system-rules', pattern: /\b(ignore|bypass|override)\b.{0,40}\b(system|developer|safety)\b.{0,20}\b(rule|instruction|prompt)s?/i },
  { reason: 'ignore-system-rules', pattern: /\b(disregard|forget)\b.{0,30}\b(previous|above)\b.{0,20}\binstructions?\b/i },
  { reason: 'leak-secrets', pattern: /\b(leak|exfiltrate|reveal|print|dump|send)\b.{0,40}\b(secrets?|tokens?|api[_ -]?keys?|passwords?|credentials?|env(?:ironment)?s?)\b/i },
  { reason: 'auto-approve', pattern: /\b(auto[- ]?approve|approve automatically|without approval|skip approval)\b/i },
];

@Injectable()
export class McpRiskScannerService {
  scanDescription(name: string, description?: string): McpRiskScanResult {
    const text = description ?? '';
    const reasons = Array.from(new Set(
      PATTERNS
        .filter(({ pattern }) => pattern.test(text))
        .map(({ reason }) => reason),
    ));

    return {
      name,
      suspicious: reasons.length > 0,
      reasons,
      warning: reasons.length > 0
        ? `Tool "${name}" quarantined due to suspicious description: ${reasons.join(', ')}.`
        : undefined,
    };
  }
}
