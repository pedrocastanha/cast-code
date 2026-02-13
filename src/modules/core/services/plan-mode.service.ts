import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../../common/services/llm.service';

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
  constructor(private readonly llmService: LlmService) {}

  async shouldEnterPlanMode(userMessage: string): Promise<{ shouldPlan: boolean; reason?: string }> {
    const indicators = [
      userMessage.match(/\b\w+\.(ts|tsx|js|jsx|py|java|go|rs)\b/g)?.length > 1,
      /\b(and|then|also|additionally)\b.*\b(create|add|modify|update|delete|refactor|implement)\b/i.test(userMessage),
      /\b(refactor|architecture|restructure|redesign|migration|implement.*feature|create.*module)\b/i.test(userMessage),
      /\b(first|second|third|then|after|before|finally)\b/i.test(userMessage),
      /\b(all|every|entire|whole|complete|full)\b/i.test(userMessage) && /\b(project|app|application|system|module)\b/i.test(userMessage),
    ];

    const complexityScore = indicators.filter(Boolean).length;
    
    if (complexityScore >= 2) {
      return { shouldPlan: true, reason: 'Multiple files or complex changes detected' };
    }
    
    if (userMessage.length > 100) {
      const llm = this.llmService.createModel();
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

  async generatePlan(userMessage: string, context?: string): Promise<Plan> {
    const llm = this.llmService.createModel();
    
    const prompt = `Create a detailed plan for this request:

**Request:** ${userMessage}

${context ? `**Context:** ${context}\n` : ''}

Generate a step-by-step plan. Each step should:
- Be atomic (one logical action)
- Include specific files to modify
- Have clear description
- Include estimated time (optional)

**OUTPUT FORMAT:**
TITLE: <plan title>
OVERVIEW: <2-3 sentence summary>
COMPLEXITY: <low|medium|high>

STEPS:
1. [Description] | Files: file1.ts, file2.ts | Time: 10min | Depends on: none
2. [Description] | Files: file3.ts | Time: 15min | Depends on: 1
3. [Description] | Files: file4.ts | Time: 5min | Depends on: 1,2

Be specific about file paths and changes.`;

    const response = await llm.invoke([
      new SystemMessage('You are a senior software architect. Create clear, actionable plans.'),
      new HumanMessage(prompt),
    ]);

    const text = this.extractContent(response.content);
    return this.parsePlan(text, userMessage);
  }

  async refinePlan(plan: Plan, feedback: string): Promise<Plan> {
    const llm = this.llmService.createModel();
    
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
