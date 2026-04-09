import { Injectable, OnModuleInit } from '@nestjs/common';
import { ToolOutputTransform, DEFAULT_CLEANUP_CONFIG, DefaultCleanupConfig } from './types';
import { defaultTransforms } from './transforms/default-transforms';

@Injectable()
export class ToolOutputProxyService implements OnModuleInit {
  private transforms = new Map<string, ToolOutputTransform>();
  private config: DefaultCleanupConfig = { ...DEFAULT_CLEANUP_CONFIG };

  onModuleInit() {
    for (const t of defaultTransforms) {
      this.transforms.set(t.toolName, t);
    }
  }

  setConfig(config: Partial<DefaultCleanupConfig>) {
    this.config = { ...this.config, ...config };
  }

  register(transform: ToolOutputTransform) {
    this.transforms.set(transform.toolName, transform);
  }

  unregister(toolName: string) {
    this.transforms.delete(toolName);
  }

  process(toolName: string, rawOutput: string, input?: Record<string, unknown>): string {
    const transform = this.transforms.get(toolName);
    if (transform) {
      return transform.transform(rawOutput, input);
    }
    return this.defaultCleanup(rawOutput);
  }

  private defaultCleanup(output: string): string {
    let cleaned = output;

    if (this.config.stripAnsi) {
      cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    }

    if (this.config.collapseBlankLines) {
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    }

    const lines = cleaned.split('\n');

    if (lines.length > this.config.maxLines) {
      const head = lines.slice(0, this.config.maxLines - 5).join('\n');
      const tail = lines.slice(-5).join('\n');
      return `${head}\n\n... [${lines.length - this.config.maxLines} lines truncated] ...\n\n${tail}`;
    }

    if (cleaned.length > this.config.maxChars) {
      return cleaned.slice(0, this.config.maxChars - 100) + '\n\n... [truncated]';
    }

    return cleaned;
  }
}
