import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MultiLlmService } from '../../../common/services/multi-llm.service';

export interface PlanStep {
  id: number;
  description: string;
  files: string[];
  estimatedTime?: string;
  dependencies?: number[];
}

export interface Plan {
  title: string;
  overview: string;
  steps: PlanStep[];
  complexity: 'low' | 'medium' | 'high';
  shouldPlan: boolean;
}

@Injectable()
export class PlanModeService {
  constructor(private readonly multiLlmService: MultiLlmService) {}

  async shouldEnterPlanMode(userMessage: string): Promise<{ shouldPlan: boolean; reason?: string }> {
    const effort = typeof (this.multiLlmService as any).getCurrentEffortProfile === 'function'
      ? (this.multiLlmService as any).getCurrentEffortProfile()
      : null;

    if (effort?.planning === 'off') {
      return { shouldPlan: false, reason: 'Planning disabled by fast effort' };
    }

    if (this.isClearSingleFileImplementationTask(userMessage)) {
      return { shouldPlan: false };
    }

    const indicators = [
      (userMessage.match(/\b\w+\.(ts|tsx|js|jsx|py|java|go|rs)\b/g)?.length ?? 0) > 1,
      /\b(and|then|also|additionally)\b.*\b(create|add|modify|update|delete|refactor|implement)\b/i.test(userMessage),
      /\b(refactor|architecture|restructure|redesign|migration|implement.*feature|create.*module)\b/i.test(userMessage),
      /\b(first|second|third|then|after|before|finally)\b/i.test(userMessage),
      /\b(all|every|entire|whole|complete|full)\b/i.test(userMessage) && /\b(project|app|application|system|module)\b/i.test(userMessage),
    ];

    const complexityScore = indicators.filter(Boolean).length;

    if (effort?.planning === 'prefer' && (complexityScore >= 1 || userMessage.length > 80)) {
      return { shouldPlan: true, reason: `Planning preferred by ${effort.level} effort` };
    }
    
    if (complexityScore >= 2) {
      return { shouldPlan: true, reason: 'Multiple files or complex changes detected' };
    }
    
    if (userMessage.length > 100) {
      const llm = this.multiLlmService.createModel('planner');
      const prompt = `Should this request use a structured plan mode?

Request: "${userMessage}"

Consider:
- Does it involve multiple files?
- Are there sequential steps?
- Is it complex enough to benefit from planning first?

Reply ONLY with: YES or NO`;

      try {
        const response = await llm.invoke([
          new SystemMessage('You are a task analyzer. Be concise.'),
          new HumanMessage(prompt),
        ]);

        const text = this.extractContent(response.content).toUpperCase();
        if (text.includes('YES')) {
          return { shouldPlan: true, reason: 'AI analysis suggests planning is beneficial' };
        }
      } catch {
      }
    }

    return { shouldPlan: false };
  }

  private isClearSingleFileImplementationTask(userMessage: string): boolean {
    const filePaths = this.getReferencedFilePaths(userMessage);
    if (filePaths.length !== 1) {
      return false;
    }

    const hasImplementationIntent =
      /\b(add|change|update|modify|fix|implement|validate|throw|test|run|write|create)\b/i.test(userMessage)
      || /\b(adicion|alter|atualiz|modific|corrij|corrigir|implemen|valid|lanc|lanç|teste|testar|rode|rodar|crie|criar|escrev)\b/i.test(userMessage);

    if (!hasImplementationIntent) {
      return false;
    }

    const broadScope =
      /\b(architecture|arquitetura|entire|whole|all|every|todos|todas|inteiro|inteira|modules|modulos|m[oó]dulos|project|projeto|app|application|sistema)\b/i.test(userMessage);

    return !broadScope;
  }

  private getReferencedFilePaths(userMessage: string): string[] {
    const matches = userMessage.match(/\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|php|rb|cs|json|md|css|scss|html|yml|yaml)\b/g) ?? [];
    return Array.from(new Set(matches));
  }

  async generatePlan(userMessage: string, context?: string): Promise<Plan> {
    const llm = this.multiLlmService.createModel('planner');
    
    const prompt = `Create a detailed implementation plan for this request.

**Request:** ${userMessage}

${context ? `**Project context (use this to derive accurate file paths and patterns):**\n${context}\n` : ''}

Generate a step-by-step plan grounded in the actual project structure above. Each step must:
- Be atomic (one logical action)
- Reference REAL files from the project context, or new files that follow existing naming patterns
- Have a clear description
- Include estimated time (optional)

**OUTPUT FORMAT:**
TITLE: <plan title>
OVERVIEW: <2-3 sentence summary>
COMPLEXITY: <low|medium|high>

STEPS:
1. [Description] | Files: file1.ts, file2.ts | Time: 10min | Depends on: none
2. [Description] | Files: file3.ts | Time: 15min | Depends on: 1
3. [Description] | Files: file4.ts | Time: 5min | Depends on: 1,2`;

    const response = await llm.invoke([
      new SystemMessage('You are a senior software architect. Create clear, actionable plans.'),
      new HumanMessage(prompt),
    ]);

    const text = this.extractContent(response.content);
    return this.parsePlan(text, userMessage);
  }

  async gatherProjectContext(): Promise<string> {
    const cwd = process.cwd();
    const parts: string[] = [];

    try {
      const tree = execSync('find . -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.next/*" -type f -name "*.ts" | head -60', {
        cwd,
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      if (tree) parts.push(`Project TypeScript files:\n${tree}`);
    } catch {}

    const configFiles = ['package.json', 'tsconfig.json', 'nest-cli.json'];
    for (const f of configFiles) {
      const p = join(cwd, f);
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, 'utf8');
          parts.push(`${f}:\n${content.slice(0, 800)}`);
        } catch {}
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }

  async generateClarifyingQuestions(userMessage: string): Promise<string[]> {
    const llm = this.multiLlmService.createModel('planner');
    const prompt = `Given this software request, ask up to 3 short clarifying questions that help produce a better implementation plan.

Request: ${userMessage}

Rules:
- Ask only high-impact questions (constraints, scope boundaries, compatibility, existing patterns to follow).
- NEVER ask about deadlines or delivery timelines — the answer is always "now".
- Return ONLY numbered questions, one per line.
- If request is already clear, return "NONE".`;

    try {
      const response = await llm.invoke([
        new SystemMessage('You create concise planning questions for software tasks.'),
        new HumanMessage(prompt),
      ]);
      const text = this.extractContent(response.content).trim();
      if (!text || text.toUpperCase() === 'NONE') return [];

      return text
        .split('\n')
        .map((line) => line.replace(/^\s*\d+[).\s-]*/, '').trim())
        .filter(Boolean)
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  async refinePlan(plan: Plan, feedback: string): Promise<Plan> {
    const llm = this.multiLlmService.createModel('planner');
    
    const currentPlan = plan.steps.map(s => 
      `${s.id}. ${s.description} | Files: ${s.files.join(', ')}`
    ).join('\n');

    const prompt = `Refine this plan based on feedback:

**Current Plan:**
${currentPlan}

**Feedback:** ${feedback}

Update the plan accordingly. Use the same output format.`;

    const response = await llm.invoke([
      new SystemMessage('You are a senior software architect. Refine plans based on feedback.'),
      new HumanMessage(prompt),
    ]);

    const text = this.extractContent(response.content);
    return this.parsePlan(text, plan.title);
  }

  formatPlanForDisplay(plan: Plan): string {
    const lines: string[] = [];
    
    lines.push(`\n  ${'─'.repeat(60)}`);
    lines.push(`  📋 ${plan.title}`);
    lines.push(`  ${'─'.repeat(60)}\n`);
    lines.push(`  ${plan.overview}\n`);
    lines.push(`  Complexity: ${plan.complexity.toUpperCase()} | Steps: ${plan.steps.length}\n`);
    
    for (const step of plan.steps) {
      const deps = step.dependencies?.length ? ` (after steps: ${step.dependencies.join(', ')})` : '';
      const time = step.estimatedTime ? ` ~${step.estimatedTime}` : '';
      
      lines.push(`  ${step.id}. ${step.description}${time}${deps}`);
      if (step.files.length > 0) {
        lines.push(`     Files: ${step.files.join(', ')}`);
      }
      lines.push('');
    }
    
    lines.push(`  ${'─'.repeat(60)}\n`);
    
    return lines.join('\n');
  }

  private parsePlan(text: string, fallbackTitle: string): Plan {
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const overviewMatch = text.match(/OVERVIEW:\s*(.+?)(?=\n\n|COMPLEXITY:|STEPS:|$)/is);
    const complexityMatch = text.match(/COMPLEXITY:\s*(low|medium|high)/i);
    
    const steps: PlanStep[] = [];
    const stepsMatch = text.match(/STEPS:([\s\S]*?)$/i);
    
    if (stepsMatch) {
      const stepsText = stepsMatch[1].trim();
      const stepLines = stepsText.split('\n').filter(l => l.trim() && /^\d+\./.test(l.trim()));
      
      for (const line of stepLines) {
        const stepMatch = line.match(/^(\d+)\.\s*\[?([^\]|]+)\]?.*\|\s*Files:\s*([^|]+)(?:\|\s*Time:\s*([^|]+))?(?:\|\s*Depends on:\s*([^|]+))?/i);
        
        if (stepMatch) {
          const id = parseInt(stepMatch[1]);
          const description = stepMatch[2].trim();
          const files = stepMatch[3].split(',').map(f => f.trim()).filter(f => f);
          const estimatedTime = stepMatch[4]?.trim();
          const depsText = stepMatch[5]?.trim();
          const dependencies = depsText && depsText !== 'none' 
            ? depsText.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d))
            : [];
          
          steps.push({ id, description, files, estimatedTime, dependencies });
        }
      }
    }

    if (steps.length === 0) {
      steps.push({
        id: 1,
        description: 'Execute the requested changes',
        files: [],
      });
    }

    return {
      title: titleMatch?.[1].trim() || fallbackTitle,
      overview: overviewMatch?.[1].trim() || 'Execute the requested task',
      complexity: (complexityMatch?.[1].toLowerCase() as Plan['complexity']) || 'medium',
      steps,
      shouldPlan: true,
    };
  }

  private extractContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (typeof first === 'object' && first !== null && 'text' in first) {
        return String(first.text);
      }
    }
    return String(content);
  }
}
