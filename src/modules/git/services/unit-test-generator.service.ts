import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MultiLlmService } from '../../../common/services/multi-llm.service';

export interface GeneratedTestFile {
  path: string;
  content: string;
  reason?: string;
}

export interface UnitTestGenerationResult {
  files: GeneratedTestFile[];
  framework: string;
  notes: string[];
}

interface SourceTestPlan {
  sourcePath: string;
  testPath: string;
  language: 'javascript' | 'java' | 'python';
  framework: string;
  sourceContent: string;
  existingTestContent: string;
  existingTest: boolean;
  fileDiff: string;
  changedSymbols: string[];
}

interface TestValidationResult {
  valid: boolean;
  issues: string[];
}

@Injectable()
export class UnitTestGeneratorService {
  constructor(private readonly multiLlmService: MultiLlmService) {}

  detectDefaultBaseBranch(): string {
    try {
      const cwd = process.cwd();
      const candidates = ['main', 'master', 'develop'];
      for (const branch of candidates) {
        try {
          execSync(`git rev-parse --verify ${branch} 2>/dev/null || git rev-parse --verify origin/${branch} 2>/dev/null`, {
            cwd,
            stdio: 'ignore',
          });
          return branch;
        } catch {}
      }
      return 'main';
    } catch {
      return 'main';
    }
  }

  getChangedFiles(baseBranch: string): string[] {
    const cwd = process.cwd();
    const files = new Set<string>();

    const outputs = [
      this.execGit(`git diff --name-only ${baseBranch}..HEAD`, cwd),
      this.execGit('git diff --name-only --cached', cwd),
      this.execGit('git diff --name-only', cwd),
      this.execGit('git ls-files --others --exclude-standard', cwd),
    ];

    for (const output of outputs) {
      for (const file of output.split('\n').map((f) => f.trim()).filter((f) => f)) {
        files.add(file);
      }
    }

    return Array.from(files);
  }

  detectTestFramework(): string {
    try {
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.vitest) return 'vitest';
      if (deps.jest || deps['ts-jest']) return 'jest';
      if (deps.mocha) return 'mocha';
      return 'node:test';
    } catch {
      return 'node:test';
    }
  }

  async generateUnitTests(baseBranch: string): Promise<UnitTestGenerationResult> {
    const changedFiles = this.getChangedFiles(baseBranch);
    const relevantFiles = this.filterRelevantFiles(changedFiles);

    if (relevantFiles.length === 0) {
      return { files: [], framework: this.detectTestFramework(), notes: ['No relevant source files changed.'] };
    }

    const plans = this.buildTestPlans(baseBranch, relevantFiles);
    if (plans.length === 0) {
      return { files: [], framework: this.detectTestFramework(), notes: ['No valid source files available for test generation.'] };
    }

    const llm = this.createTestModel();
    const generatedFiles: GeneratedTestFile[] = [];
    const notes: string[] = [];

    for (const plan of plans) {
      try {
        const firstResponse = await llm.invoke([
          new SystemMessage(this.getSystemPrompt()),
          new HumanMessage(this.buildFilePrompt(plan)),
        ]);

        const firstContent = this.extractContent(firstResponse.content);
        const firstParsed = this.parseJson(firstContent);
        if (!firstParsed || !firstParsed.content) {
          notes.push(`Failed to parse generated tests for ${plan.sourcePath}.`);
          continue;
        }

        let generated = String(firstParsed.content).trimEnd();
        if (!generated) {
          notes.push(`Empty test content generated for ${plan.sourcePath}.`);
          continue;
        }

        let validation = this.validateGeneratedTest(plan, generated);
        if (!validation.valid) {
          const revised = await this.reviseGeneratedTest(llm, plan, generated, validation.issues);
          if (revised) {
            generated = revised;
            validation = this.validateGeneratedTest(plan, generated);
          }
        }

        if (!validation.valid) {
          notes.push(`Low quality tests for ${plan.sourcePath}: ${validation.issues.join(' | ')}`);
          continue;
        }

        generatedFiles.push({
          path: plan.testPath,
          content: generated,
          reason: firstParsed.reason ? String(firstParsed.reason) : undefined,
        });
      } catch {
        notes.push(`Failed to generate tests for ${plan.sourcePath}.`);
      }
    }

    const missingPlans = plans.filter((plan) => !generatedFiles.some((file) => file.path === plan.testPath));
    for (const missing of missingPlans) {
      notes.push(`No generated test file for ${missing.sourcePath} (${missing.testPath}).`);
    }

    return {
      files: generatedFiles,
      framework: this.detectTestFramework(),
      notes,
    };
  }

  private buildTestPlans(baseBranch: string, sourceFiles: string[]): SourceTestPlan[] {
    const plans: SourceTestPlan[] = [];
    const fs = require('fs');

    for (const sourcePath of sourceFiles) {
      const language = this.getLanguageForFile(sourcePath);
      if (!language) continue;
      if (!fs.existsSync(sourcePath)) continue;

      const sourceContent = this.readFileSafely(sourcePath, 10000);
      if (!sourceContent.trim()) continue;

      const testPath = this.resolveTestPath(sourcePath, language);
      const existingTest = fs.existsSync(testPath);
      const existingTestContent = existingTest ? this.readFileSafely(testPath, 10000) : '';
      const fileDiff = this.getFileDiff(baseBranch, sourcePath, 8000);
      const changedSymbols = this.extractChangedSymbols(fileDiff, language);

      plans.push({
        sourcePath,
        testPath,
        language,
        framework: this.detectFrameworkForLanguage(language),
        sourceContent,
        existingTestContent,
        existingTest,
        fileDiff,
        changedSymbols,
      });
    }

    return plans;
  }

  private resolveTestPath(sourcePath: string, language: 'javascript' | 'java' | 'python'): string {
    if (language === 'java') {
      if (sourcePath.includes('/src/main/java/')) {
        return sourcePath.replace('/src/main/java/', '/src/test/java/').replace(/\.java$/, 'Test.java');
      }
      return sourcePath.replace(/\.java$/, 'Test.java');
    }

    if (language === 'python') {
      const normalized = sourcePath.startsWith('src/') ? sourcePath.slice(4) : sourcePath;
      const fileName = normalized.split('/').pop() || 'module.py';
      return `tests/test_${fileName.replace(/\.py$/, '')}.py`;
    }

    return sourcePath.replace(/\.(ts|tsx|js|jsx)$/, '.spec.ts');
  }

  private getFileDiff(baseBranch: string, filePath: string, maxChars = 8000): string {
    const cwd = process.cwd();
    const parts = [
      this.execGit(`git diff ${baseBranch}..HEAD -- "${filePath}"`, cwd),
      this.execGit(`git diff --cached -- "${filePath}"`, cwd),
      this.execGit(`git diff -- "${filePath}"`, cwd),
    ].filter((p) => p.trim());

    const combined = parts.join('\n\n');
    if (!combined.trim()) return '';
    return combined.length > maxChars ? combined.slice(0, maxChars) + '\n... (diff truncated)' : combined;
  }

  private filterRelevantFiles(files: string[]): string[] {
    return files.filter((f) => {
      if (!/\.(ts|tsx|js|jsx|java|py)$/.test(f)) return false;
      if (/(\.spec\.|\.test\.)/.test(f)) return false;
      if (/src\/test\/|__tests__|tests\/|test_.*\.py$|.*_test\.py$|.*Test\.java$/.test(f)) return false;
      if (f.startsWith('dist/') || f.startsWith('node_modules/')) return false;
      return true;
    });
  }

  private getSystemPrompt(): string {
    return [
      'You are a senior test engineer.',
      'Generate deterministic and high-value unit tests only.',
      'Avoid trivial tests that only assert definition/existence.',
      'Prefer behavior-oriented assertions and edge cases.',
      'Never return placeholders or TODOs.',
    ].join(' ');
  }

  private buildFilePrompt(plan: SourceTestPlan): string {
    const changedSymbols = plan.changedSymbols.length > 0 ? plan.changedSymbols.join(', ') : '(none detected)';
    const existingLabel = plan.existingTest ? 'EXISTING TEST FILE (update this file completely)' : 'NO EXISTING TEST FILE (create new file)';
    const existingContent = plan.existingTestContent || '(empty)';
    const diff = plan.fileDiff || '(no textual diff available, rely on source code)';

    return `Goal:
Generate or update unit tests for one source file.

Language: ${plan.language}
Framework: ${plan.framework}
Source file: ${plan.sourcePath}
Target test file path: ${plan.testPath}
Status: ${existingLabel}
Changed symbols that MUST be covered when applicable: ${changedSymbols}

Source code (truncated):
${plan.sourceContent}

Source diff (truncated):
${diff}

Current test file content (truncated):
${existingContent}

Rules:
- Return the full test file content for ${plan.testPath}.
- If test file exists, preserve useful existing tests and add coverage for new/changed behavior.
- Create at least one test case for each changed symbol when testable.
- Add a short comment immediately above each test case explaining what is validated.
- Use correct comment syntax: // for javascript/java, # for python.
- Unit tests only, no integration/E2E.
- Mock external dependencies and I/O.
- Include at least one happy-path test and one edge/error-path test when applicable.
- Every test case must contain meaningful assertions.
- Keep imports and setup minimal, compile-ready, and framework-correct.
- Do not use placeholders like TODO, FIXME, or "to be implemented".

OUTPUT FORMAT (JSON):
\`\`\`json
{
  "content": "full file content",
  "reason": "short summary"
}
\`\`\``;
  }

  private async reviseGeneratedTest(
    llm: any,
    plan: SourceTestPlan,
    previousContent: string,
    issues: string[],
  ): Promise<string | null> {
    try {
      const response = await llm.invoke([
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(this.buildRevisionPrompt(plan, previousContent, issues)),
      ]);

      const content = this.extractContent(response.content);
      const parsed = this.parseJson(content);
      if (!parsed || !parsed.content) return null;
      const revised = String(parsed.content).trimEnd();
      return revised || null;
    } catch {
      return null;
    }
  }

  private buildRevisionPrompt(plan: SourceTestPlan, previousContent: string, issues: string[]): string {
    return `The previous test output for ${plan.testPath} did not pass quality checks.

Issues to fix:
${issues.map((issue, idx) => `${idx + 1}. ${issue}`).join('\n')}

Return a corrected full file, keeping the same target path.

Previous content:
${previousContent}

OUTPUT FORMAT (JSON):
\`\`\`json
{
  "content": "full corrected file content",
  "reason": "short summary"
}
\`\`\``;
  }

  private parseJson(content: string): any | null {
    const match = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[1] || match[0]);
    } catch {
      return null;
    }
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

  private execGit(command: string, cwd: string): string {
    try {
      return execSync(command, { cwd, encoding: 'utf-8' });
    } catch {
      return '';
    }
  }

  private createTestModel() {
    try {
      return this.multiLlmService.createModel('tester');
    } catch {
      return this.multiLlmService.createModel('cheap');
    }
  }

  private getLanguageForFile(file: string): 'javascript' | 'java' | 'python' | null {
    if (/\.(ts|tsx|js|jsx)$/.test(file)) return 'javascript';
    if (/\.java$/.test(file)) return 'java';
    if (/\.py$/.test(file)) return 'python';
    return null;
  }

  private detectFrameworkForLanguage(language: 'javascript' | 'java' | 'python'): string {
    if (language === 'java') {
      return this.detectJavaFramework();
    }
    if (language === 'python') {
      return this.detectPythonFramework();
    }
    return this.detectTestFramework();
  }

  private detectJavaFramework(): string {
    try {
      const fs = require('fs');
      if (fs.existsSync('build.gradle') || fs.existsSync('build.gradle.kts')) return 'junit5 (gradle)';
      if (fs.existsSync('pom.xml')) return 'junit5 (maven)';
    } catch {}
    return 'junit5';
  }

  private detectPythonFramework(): string {
    try {
      const fs = require('fs');
      if (fs.existsSync('pyproject.toml')) {
        const raw = fs.readFileSync('pyproject.toml', 'utf-8');
        if (raw.includes('pytest')) return 'pytest';
      }
      if (fs.existsSync('requirements.txt')) {
        const raw = fs.readFileSync('requirements.txt', 'utf-8');
        if (raw.toLowerCase().includes('pytest')) return 'pytest';
      }
    } catch {}
    return 'pytest';
  }

  private readFileSafely(filePath: string, maxChars = 10000): string {
    try {
      const fs = require('fs');
      const raw = fs.readFileSync(filePath, 'utf-8');
      return raw.length > maxChars ? raw.slice(0, maxChars) + '\n... (file truncated)' : raw;
    } catch {
      return '';
    }
  }

  private extractChangedSymbols(
    diff: string,
    language: 'javascript' | 'java' | 'python',
  ): string[] {
    if (!diff.trim()) return [];
    const lines = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    const symbols = new Set<string>();

    for (const line of lines) {
      const text = line.slice(1);
      const matches = this.extractSymbolsFromLine(text, language);
      for (const symbol of matches) {
        symbols.add(symbol);
      }
    }

    return Array.from(symbols).slice(0, 20);
  }

  private extractSymbolsFromLine(
    line: string,
    language: 'javascript' | 'java' | 'python',
  ): string[] {
    const symbols: string[] = [];

    if (language === 'python') {
      const fn = line.match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (fn?.[1]) symbols.push(fn[1]);
      return symbols;
    }

    const classMatch = line.match(/^\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (classMatch?.[1]) symbols.push(classMatch[1]);

    const fnDecl = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (fnDecl?.[1]) symbols.push(fnDecl[1]);

    const varFn = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/);
    if (varFn?.[1]) symbols.push(varFn[1]);

    const method = line.match(/^\s*(?:public|private|protected|static|async|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/);
    if (method?.[1] && !['if', 'for', 'while', 'switch', 'catch'].includes(method[1])) {
      symbols.push(method[1]);
    }

    return symbols;
  }

  private getMissingSymbols(symbols: string[], generatedTestContent: string): string[] {
    if (symbols.length === 0) return [];
    const lowered = generatedTestContent.toLowerCase();
    return symbols.filter((symbol) => !lowered.includes(symbol.toLowerCase()));
  }

  private validateGeneratedTest(plan: SourceTestPlan, content: string): TestValidationResult {
    const issues: string[] = [];

    if (/\bTODO\b|\bFIXME\b|to be implemented/i.test(content)) {
      issues.push('contains placeholders (TODO/FIXME)');
    }

    if (content.trim().length < 120) {
      issues.push('content too short');
    }

    const missingSymbols = this.getMissingSymbols(plan.changedSymbols, content);
    if (missingSymbols.length > 0) {
      issues.push(`missing changed symbols: ${missingSymbols.join(', ')}`);
    }

    const languageChecks = this.validateByLanguage(plan.language, content);
    issues.push(...languageChecks);

    return { valid: issues.length === 0, issues };
  }

  private validateByLanguage(language: 'javascript' | 'java' | 'python', content: string): string[] {
    if (language === 'python') {
      return this.validatePythonTest(content);
    }
    if (language === 'java') {
      return this.validateJavaTest(content);
    }
    return this.validateJsTest(content);
  }

  private validateJsTest(content: string): string[] {
    const issues: string[] = [];
    const tests = this.getMatchingLines(content, /^\s*(?:it|test)\s*\(/gm);
    if (tests.length === 0) {
      issues.push('no test cases found (it/test)');
      return issues;
    }

    if (!/(expect\s*\(|assert\.)/.test(content)) {
      issues.push('no meaningful assertions found');
    }

    if (!this.hasCommentsAboveTests(content, tests, '//')) {
      issues.push('missing short comment above test case');
    }

    return issues;
  }

  private validateJavaTest(content: string): string[] {
    const issues: string[] = [];
    const tests = this.getMatchingLines(content, /^\s*@Test\b/gm);
    if (tests.length === 0) {
      issues.push('no @Test methods found');
      return issues;
    }

    if (!/\bassert[A-Za-z]+\s*\(/.test(content)) {
      issues.push('no JUnit assertions found');
    }

    if (!this.hasCommentsAboveTests(content, tests, '//')) {
      issues.push('missing short comment above test case');
    }

    return issues;
  }

  private validatePythonTest(content: string): string[] {
    const issues: string[] = [];
    const tests = this.getMatchingLines(content, /^\s*def\s+test_[A-Za-z0-9_]*\s*\(/gm);
    if (tests.length === 0) {
      issues.push('no pytest test functions found');
      return issues;
    }

    if (!/\bassert\b/.test(content)) {
      issues.push('no assert statements found');
    }

    if (!this.hasCommentsAboveTests(content, tests, '#')) {
      issues.push('missing short comment above test case');
    }

    return issues;
  }

  private getMatchingLines(content: string, pattern: RegExp): number[] {
    const lines = content.split('\n');
    const matched: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matched.push(i);
      }
      pattern.lastIndex = 0;
    }
    return matched;
  }

  private hasCommentsAboveTests(content: string, testLineIndexes: number[], commentPrefix: string): boolean {
    const lines = content.split('\n');
    for (const testIdx of testLineIndexes) {
      let prev = testIdx - 1;
      while (prev >= 0 && lines[prev].trim() === '') {
        prev--;
      }
      if (prev < 0) return false;
      if (!lines[prev].trim().startsWith(commentPrefix)) {
        return false;
      }
    }
    return true;
  }
}
