import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../../common/services/llm.service';

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'suggestion' | 'praise';
  line?: number;
  message: string;
  suggestion?: string;
  code?: string;
}

export interface ReviewResult {
  file: string;
  issues: ReviewIssue[];
  summary: string;
  score: number;
}

@Injectable()
export class CodeReviewService {
  constructor(private readonly llmService: LlmService) {}

  async reviewFile(filePath: string): Promise<ReviewResult> {
    const content = this.readFile(filePath);
    if (!content) {
      return {
        file: filePath,
        issues: [{ severity: 'error', message: 'Could not read file' }],
        summary: 'File not found or empty',
        score: 0,
      };
    }

    const llm = this.llmService.createModel();
    const prompt = this.buildReviewPrompt(filePath, content);

    const response = await llm.invoke([
      new SystemMessage(this.getReviewSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const responseText = this.extractContent(response.content);
    return this.parseReviewResponse(filePath, responseText, content);
  }

  async reviewFiles(filePaths: string[]): Promise<ReviewResult[]> {
    const results: ReviewResult[] = [];
    for (const file of filePaths) {
      const result = await this.reviewFile(file);
      results.push(result);
    }
    return results;
  }

  async reviewDiff(stagedOnly = false): Promise<ReviewResult[]> {
    const files = this.getChangedFiles(stagedOnly);
    return this.reviewFiles(files);
  }

  async fixFile(filePath: string): Promise<{ success: boolean; fixed?: string; error?: string }> {
    const content = this.readFile(filePath);
    if (!content) {
      return { success: false, error: 'Could not read file' };
    }

    const llm = this.llmService.createModel();
    const prompt = this.buildFixPrompt(filePath, content);

    const response = await llm.invoke([
      new SystemMessage(this.getFixSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const responseText = this.extractContent(response.content);
    const fixedCode = this.extractCodeBlock(responseText);

    if (fixedCode) {
      this.writeFile(filePath, fixedCode);
      return { success: true, fixed: fixedCode };
    }

    return { success: false, error: 'Could not generate fix' };
  }

  async indentFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const content = this.readFile(filePath);
      if (!content) {
        return { success: false, error: 'Could not read file' };
      }

      try {
        execSync(`npx prettier --write "${filePath}"`, { cwd: process.cwd() });
        return { success: true };
      } catch {
        const llm = this.llmService.createModel();
        const prompt = `Format and indent this code properly. Maintain all functionality, only fix indentation and formatting:

File: ${filePath}

\`\`\`
${content}
\`\`\`

Return ONLY the formatted code in a code block.`;

        const response = await llm.invoke([
          new SystemMessage('You are a code formatter. Fix indentation and formatting only.'),
          new HumanMessage(prompt),
        ]);

        const responseText = this.extractContent(response.content);
        const formattedCode = this.extractCodeBlock(responseText);

        if (formattedCode) {
          this.writeFile(filePath, formattedCode);
          return { success: true };
        }
      }

      return { success: false, error: 'Could not format file' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async indentAll(pattern = 'src/**/*.{ts,tsx,js,jsx}'): Promise<{ success: number; failed: number }> {
    try {
      const files = execSync(`find src -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx"`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
      }).trim().split('\n').filter(f => f);

      let success = 0;
      let failed = 0;

      for (const file of files) {
        const result = await this.indentFile(file);
        if (result.success) success++;
        else failed++;
      }

      return { success, failed };
    } catch {
      return { success: 0, failed: 0 };
    }
  }

  private readFile(filePath: string): string | null {
    try {
      return execSync(`cat "${filePath}"`, { cwd: process.cwd(), encoding: 'utf-8' });
    } catch {
      return null;
    }
  }

  private writeFile(filePath: string, content: string): void {
    try {
      const fs = require('fs');
      fs.writeFileSync(filePath, content);
    } catch {
    }
  }

  private getChangedFiles(stagedOnly = false): string[] {
    try {
      const cmd = stagedOnly 
        ? 'git diff --cached --name-only --diff-filter=ACM'
        : 'git diff --name-only --diff-filter=ACM';
      
      const output = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' });
      return output.trim().split('\n').filter(f => f && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')));
    } catch {
      return [];
    }
  }

  private buildReviewPrompt(filePath: string, content: string): string {
    return `Review this code file:

File: ${filePath}

\`\`\`
${content.slice(0, 3000)}${content.length > 3000 ? '\n... (truncated)' : ''}
\`\`\`

Provide a detailed code review following the format specified.`;
  }

  private buildFixPrompt(filePath: string, content: string): string {
    return `Fix any issues in this code (bugs, security, performance, best practices):

File: ${filePath}

\`\`\`
${content}
\`\`\`

Return ONLY the fixed code in a code block. Do not add explanations.`;
  }

  private getReviewSystemPrompt(): string {
    return `You are a senior code reviewer. Analyze code and provide actionable feedback.

**SEVERITY LEVELS:**
- error: Bugs, security issues, broken functionality
- warning: Potential issues, anti-patterns, performance concerns
- suggestion: Improvements, best practices, style issues
- praise: Good practices worth highlighting

**OUTPUT FORMAT:**
SCORE: <0-100>

SUMMARY: <2-3 sentence overall assessment>

ISSUES:
[severity] Line <number>: <message>
Suggestion: <how to fix>
Code: <relevant code snippet>

(repeat for each issue)

PRAISES:
- <what was done well>

Be thorough but constructive. Focus on important issues, not nitpicks.`;
  }

  private getFixSystemPrompt(): string {
    return `You are an expert developer. Fix all issues in the provided code including:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Type safety problems
- Best practice violations

Return ONLY the fixed code in a markdown code block. Preserve all functionality while fixing issues.`;
  }

  private parseReviewResponse(filePath: string, content: string, originalCode: string): ReviewResult {
    const issues: ReviewIssue[] = [];
    
    const scoreMatch = content.match(/SCORE:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

    const summaryMatch = content.match(/SUMMARY:\s*(.+?)(?=\n\n|ISSUES:|PRAISES:|$)/is);
    const summary = summaryMatch ? summaryMatch[1].trim() : 'No summary provided';

    const issuesMatch = content.match(/ISSUES:([\s\S]+?)(?=PRAISES:|$)/i);
    if (issuesMatch) {
      const issuesText = issuesMatch[1].trim();
      const issueBlocks = issuesText.split(/\n\n+/);
      
      for (const block of issueBlocks) {
        const lines = block.trim().split('\n');
        const firstLine = lines[0];
        
        const match = firstLine.match(/\[(\w+)\]\s*Line\s*(\d+)?\s*:?\s*(.+)/i);
        if (match) {
          const severity = match[1].toLowerCase() as ReviewIssue['severity'];
          const line = match[2] ? parseInt(match[2]) : undefined;
          const message = match[3].trim();
          
          let suggestion: string | undefined;
          let code: string | undefined;
          
          for (let i = 1; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('suggestion:')) {
              suggestion = lines[i].replace(/suggestion:/i, '').trim();
            } else if (lines[i].toLowerCase().includes('code:')) {
              code = lines[i + 1]?.trim() || lines[i].replace(/code:/i, '').trim();
            }
          }
          
          issues.push({ severity, line, message, suggestion, code });
        }
      }
    }

    const praisesMatch = content.match(/PRAISES:([\s\S]+?)$/i);
    if (praisesMatch) {
      const praises = praisesMatch[1].trim().split('\n').filter(p => p.trim().startsWith('-'));
      for (const praise of praises) {
        issues.push({
          severity: 'praise',
          message: praise.replace(/^-\s*/, '').trim(),
        });
      }
    }

    return { file: filePath, issues, summary, score };
  }

  private extractCodeBlock(text: string): string | null {
    const match = text.match(/```[\w]*\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
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
