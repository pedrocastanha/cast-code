import { Injectable } from '@nestjs/common';

import { SkillRisk, SkillScannerFindingCategory } from '../../skills/types';
import { SkillRiskFinding, SkillRiskScanReport } from '../types/skills-import.types';

interface ScannerPattern {
  category: SkillScannerFindingCategory;
  severity: SkillRisk;
  message: string;
  patterns: RegExp[];
}

const RISK_RANK: Record<SkillRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

@Injectable()
export class SkillRiskScannerService {
  private readonly patterns: ScannerPattern[] = [
    {
      category: 'prompt_injection',
      severity: 'high',
      message: 'Attempts to ignore or bypass prior instructions.',
      patterns: [
        /\bignore (all )?(previous|prior|above) instructions?\b/i,
        /\bdisregard (all )?(previous|prior|above) instructions?\b/i,
        /\bjailbreak\b/i,
      ],
    },
    {
      category: 'credential_exfiltration',
      severity: 'critical',
      message: 'Attempts to reveal or send secrets, credentials, or environment variables.',
      patterns: [
        /\b(send|upload|post|exfiltrate|leak|reveal)\b.{0,80}\b(secret|credential|api[_ -]?key|token|password)s?\b/i,
        /\b(dump|print|list|cat)\b.{0,80}\b(env|environment variables|process\.env)\b/i,
        /\b(secret|credential|api[_ -]?key|token|password)s?\b.{0,80}\b(send|upload|post|exfiltrate|leak)\b/i,
      ],
    },
    {
      category: 'destructive_shell',
      severity: 'high',
      message: 'Mentions destructive shell commands.',
      patterns: [
        /\brm\s+-rf\s+(\/|~|\$HOME|\*)/i,
        /\bsudo\s+rm\s+-rf\b/i,
        /\bmkfs(\.|\s)/i,
        /\bdd\s+if=.*\bof=\/dev\//i,
        /\bchmod\s+-R\s+777\s+(\/|~|\$HOME)/i,
      ],
    },
    {
      category: 'network_exfiltration',
      severity: 'medium',
      message: 'Mentions sending data to an external network destination.',
      patterns: [
        /\b(curl|wget)\b.{0,120}\bhttps?:\/\//i,
        /\b(send|upload|post)\b.{0,120}\b(to|at)\b.{0,40}\bhttps?:\/\//i,
        /\bwebhook\b.{0,120}\b(secret|token|data|payload|environment)\b/i,
      ],
    },
    {
      category: 'system_override',
      severity: 'critical',
      message: 'Attempts to override system/developer instructions or disable safety rules.',
      patterns: [
        /\b(reveal|print|show|dump)\b.{0,80}\b(system prompt|developer message|developer instructions)\b/i,
        /\boverride\b.{0,80}\b(system|developer)\b/i,
        /\bdisable\b.{0,80}\b(safety|guardrails?|rules?)\b/i,
        /\bauto-?approve\b.{0,80}\b(external|mutation|write|delete|payment|publish)\b/i,
      ],
    },
  ];

  scan(input: { name: string; description?: string; body: string }): SkillRiskScanReport {
    const text = [input.name, input.description || '', input.body].join('\n');
    const findings: SkillRiskFinding[] = [];

    for (const patternGroup of this.patterns) {
      for (const pattern of patternGroup.patterns) {
        const match = text.match(pattern);
        if (!match) {
          continue;
        }

        findings.push({
          category: patternGroup.category,
          severity: patternGroup.severity,
          message: patternGroup.message,
          match: match[0],
        });
        break;
      }
    }

    return {
      risk: this.maxRisk(findings.map((finding) => finding.severity)),
      findings,
    };
  }

  private maxRisk(risks: SkillRisk[]): SkillRisk {
    return risks.reduce<SkillRisk>(
      (current, risk) => (RISK_RANK[risk] > RISK_RANK[current] ? risk : current),
      'low',
    );
  }
}
