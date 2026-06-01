import { Injectable, Optional } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import type { BridgeTranscriptEvent } from '../types/bridge.types';

@Injectable()
export class BridgeTranscriptService {
  constructor(@Optional() private readonly redaction?: StateRedactionService) {}

  async append(projectRoot: string, event: BridgeTranscriptEvent): Promise<string> {
    const dir = join(projectRoot, '.cast', 'bridge', 'transcripts');
    await mkdir(dir, { recursive: true });

    const filePath = join(dir, `${event.sessionId}.jsonl`);
    const safeEvent: BridgeTranscriptEvent = {
      ...event,
      redactedText: event.redactedText ? this.redact(event.redactedText) : undefined,
    };

    await appendFile(filePath, `${JSON.stringify(safeEvent)}\n`, 'utf8');
    return filePath;
  }

  private redact(value: string): string {
    if (this.redaction) {
      return this.redaction.redact(value);
    }

    return value
      .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{6,}\b/g, '[REDACTED_API_KEY]')
      .replace(/\bsk-ant-[A-Za-z0-9][A-Za-z0-9_-]{6,}\b/g, '[REDACTED_ANTHROPIC_KEY]')
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/\b[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=[^\s]+/gi, '[REDACTED_SECRET]');
  }
}
