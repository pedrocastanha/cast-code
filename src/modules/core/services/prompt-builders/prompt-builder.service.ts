import { Injectable } from '@nestjs/common';
import { PromptSection, PromptBuilderContext } from './types';

@Injectable()
export class PromptBuilderService {
  private sections = new Map<string, PromptSection>();

  register(section: PromptSection) {
    this.sections.set(section.id, section);
  }

  unregister(id: string) {
    this.sections.delete(id);
  }

  build(ctx: PromptBuilderContext, sectionOrder: string[]): string {
    const parts: string[] = [];

    for (const id of sectionOrder) {
      const section = this.sections.get(id);
      if (section) {
        const content = section.build(ctx);
        if (content.length > 0) {
          parts.push(content);
        }
      }
    }

    return parts.join('\n\n');
  }

  getSectionIds(): string[] {
    return Array.from(this.sections.keys());
  }
}
