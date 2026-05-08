import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class StateRedactionService {
  private readonly patterns: Array<{ regex: RegExp; replacement: string }> = [
    {
      regex: /\b(Authorization\s*:\s*Bearer\s+)[^\s"'`]+/gi,
      replacement: '$1[REDACTED_BEARER_TOKEN]',
    },
    {
      regex: /\b((?:export\s+)?[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"'`]+)/gi,
      replacement: '$1[REDACTED_SECRET]',
    },
    {
      regex: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/g,
      replacement: '[REDACTED_API_KEY]',
    },
    {
      regex: /\bsk-ant-[A-Za-z0-9][A-Za-z0-9_-]{6,}\b/g,
      replacement: '[REDACTED_ANTHROPIC_KEY]',
    },
    {
      regex: /\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    {
      regex: /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi,
      replacement: '$1[REDACTED_CREDENTIALS]@',
    },
  ];

  redact(value: unknown): string {
    let text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    for (const pattern of this.patterns) {
      text = text.replace(pattern.regex, pattern.replacement);
    }
    return text;
  }

  contentPreview(content: unknown, maxLength = 500): string {
    const redacted = this.redact(content).replace(/\s+/g, ' ').trim();
    return redacted.length > maxLength ? redacted.slice(0, maxLength) : redacted;
  }

  contentHash(rawContent: unknown): string {
    const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent ?? '');
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
