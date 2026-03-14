import { Injectable } from '@nestjs/common';

export type PromptLayer = 'git' | 'pr' | 'release' | 'planning' | 'mcp' | 'mentions';

export interface ClassifierContext {
  hasMcpConnected: boolean;
  hasProjectContext: boolean;
  hasMemory: boolean;
  mentionsInMessage: boolean;
}

const GIT_PATTERN = /\b(commit|diff|push|branch|merge|rebase|stash|tag|checkout|log|status|upstream|remote|pull|fetch)\b|\/up\b|\/split-up\b|\/status\b|\/diff\b|\/log\b/i;
const PR_PATTERN = /\/pr\b|\bpull\s*request\b|\bopen\s*pr\b|\bcrear?\s*pr\b/i;
const RELEASE_PATTERN = /\/release\b|\brelease\s*notes?\b|\bchangelog\b|\bversao\b|\bversion\b/i;
const PLANNING_PATTERN = /\barchitect\b|\bplan\b|\bdesign\b|\brefactor\b|\bstructure\b|\bmigrat/i;
const MENTIONS_PATTERN = /(?:^|\s)@(?!https?:\/\/)(?![\w.+-]+@)[\w./\-]+/;

@Injectable()
export class PromptClassifierService {
  classify(message: string, ctx: ClassifierContext): PromptLayer[] {
    const layers: PromptLayer[] = [];

    if (ctx.mentionsInMessage || MENTIONS_PATTERN.test(message)) {
      layers.push('mentions');
    }
    if (GIT_PATTERN.test(message)) layers.push('git');
    if (PR_PATTERN.test(message)) layers.push('pr');
    if (RELEASE_PATTERN.test(message)) layers.push('release');
    if (PLANNING_PATTERN.test(message)) layers.push('planning');
    if (ctx.hasMcpConnected) layers.push('mcp');

    return layers;
  }
}
