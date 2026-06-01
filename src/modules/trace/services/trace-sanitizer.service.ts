import { Injectable } from '@nestjs/common';
import { TraceRedaction, TraceSanitizeResult } from '../types/trace.types';

const SECRET_KEY_PATTERN = /(token|key|secret|password|credential|auth)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}\b/g,
];

@Injectable()
export class TraceSanitizerService {
  sanitize<TPayload extends Record<string, unknown>>(payload: TPayload): TraceSanitizeResult<TPayload> {
    const redactions: TraceRedaction[] = [];
    const sanitized = this.sanitizeValue(payload, '$', redactions) as TPayload;
    return { payload: sanitized, redactions };
  }

  private sanitizeValue(value: unknown, path: string, redactions: TraceRedaction[]): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value, path, redactions);
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      redactions.push({ path, reason: 'binary_output' });
      return '[binary output redacted]';
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => this.sanitizeValue(item, `${path}[${index}]`, redactions));
    }

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = '[redacted:secret_pattern]';
        redactions.push({ path: childPath, reason: 'secret_pattern' });
        continue;
      }
      output[key] = this.sanitizeValue(child, childPath, redactions);
    }
    return output;
  }

  private sanitizeString(value: string, path: string, redactions: TraceRedaction[]): string {
    let output = value;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      output = output.replace(pattern, (match) => {
        redactions.push({ path, reason: 'secret_pattern' });
        return match.startsWith('Bearer ')
          ? 'Bearer [redacted:secret_pattern]'
          : '[redacted:secret_pattern]';
      });
    }

    if (output.length > 32_000) {
      redactions.push({ path, reason: 'large_output' });
      return `${output.slice(0, 32_000)}\n[trace output truncated]`;
    }

    return output;
  }
}
