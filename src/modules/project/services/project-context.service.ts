import { Injectable } from '@nestjs/common';
import { ProjectContext } from '../types';

@Injectable()
export class ProjectContextService {
  private context: ProjectContext | null = null;

  setContext(context: ProjectContext) {
    this.context = context;
  }

  getContext(): ProjectContext | null {
    return this.context;
  }

  getContextPrompt(): string {
    if (!this.context) {
      return '';
    }

    const parts: string[] = [];

    parts.push(`# Project: ${this.context.name}`);

    if (this.context.stack.length > 0) {
      parts.push(`\n## Tech Stack\n${this.context.stack.map((s) => `- ${s}`).join('\n')}`);
    }

    if (this.context.conventions.length > 0) {
      parts.push(
        `\n## Conventions\n${this.context.conventions.map((c) => `- ${c}`).join('\n')}`,
      );
    }

    if (this.context.description) {
      parts.push(`\n## Description\n${this.context.description}`);
    }

    if (this.context.structure) {
      parts.push(
        `\n## Structure\n${Object.entries(this.context.structure)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n')}`,
      );
    }

    if (this.context.rules && this.context.rules.length > 0) {
      parts.push(`\n## Business Rules\n${this.context.rules.map((r) => `- ${r}`).join('\n')}`);
    }

    return parts.join('\n');
  }

  hasContext(): boolean {
    return this.context !== null;
  }

  clearContext() {
    this.context = null;
  }
}
