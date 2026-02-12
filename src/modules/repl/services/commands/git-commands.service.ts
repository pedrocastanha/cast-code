import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { CommitGeneratorService } from '../../../git/services/commit-generator.service';
import { MonorepoDetectorService } from '../../../git/services/monorepo-detector.service';
import { PrGeneratorService } from '../../../git/services/pr-generator.service';
import { CodeReviewService } from '../../../git/services/code-review.service';
import { ReleaseNotesService } from '../../../git/services/release-notes.service';

interface SmartInput {
  askChoice: (question: string, choices: { key: string; label: string; description: string }[]) => Promise<string>;
  question: (prompt: string) => Promise<string>;
}

@Injectable()
export class GitCommandsService {
  constructor(
    private readonly commitGenerator: CommitGeneratorService,
    private readonly monorepoDetector: MonorepoDetectorService,
    private readonly prGenerator: PrGeneratorService,
    private readonly codeReviewService: CodeReviewService,
    private readonly releaseNotesService: ReleaseNotesService,
  ) {}

  runGit(cmd: string): void {
    const { execSync } = require('child_process');
    try {
      const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      process.stdout.write(output ? `\r\n${output}\r\n\r\n` : `  ${colorize('(no output)', 'muted')}\r\n`);
    } catch (e) {
      process.stdout.write(`${Colors.red}  ${(e as Error).message}${Colors.reset}\r\n`);
    }
  }

  async cmdCommit(args: string[], smartInput: SmartInput): Promise<void> {
    const msg = args.join(' ');
    if (!msg) {
      await this.generateAndCommit(smartInput);
    } else {
      const { execSync } = require('child_process');
      try {
        execSync(`git add -A && git commit -m "${msg.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
      } catch {}
    }
  }

  private async generateAndCommit(smartInput: SmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    if (!this.commitGenerator.hasChanges()) {
      w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.cyan}🤖 Analyzing changes...${Colors.reset}\r\n`);

    const message = await this.commitGenerator.generateCommitMessage();
    if (!message) {
      w(`${Colors.red}  Failed to generate commit message${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.green}✓ Generated:${Colors.reset} ${colorize(message, 'cyan')}\r\n\r\n`);

    const confirm = await smartInput.askChoice('Commit?', [
      { key: 'y', label: 'yes', description: 'Commit with this message' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit message' },
    ]);

    if (confirm === 'n') {
      w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    let finalMessage = message;

    if (confirm === 'e') {
      const newMsg = await smartInput.question(colorize('  Message: ', 'cyan'));
      if (!newMsg.trim()) {
        w(colorize('  Cancelled\r\n\r\n', 'muted'));
        return;
      }
      finalMessage = newMsg.trim();
    }

    const success = this.commitGenerator.executeCommit(finalMessage);
    if (success) {
      w(`${Colors.green}✓ Committed${Colors.reset}\r\n\r\n`);
    } else {
      w(`${Colors.red}✗ Commit failed${Colors.reset}\r\n\r\n`);
    }
  }

  async cmdUp(smartInput: SmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    if (!this.commitGenerator.hasChanges()) {
      w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    if (monorepoInfo.isMonorepo) {
      w(`\r\n${colorize('Monorepo:', 'muted')} ${monorepoInfo.modules.join(', ')}\r\n`);
    }

    w(`\r\n${Colors.cyan}🤖 Analyzing changes...${Colors.reset}\r\n`);

    const message = await this.commitGenerator.generateCommitMessage();
    if (!message) {
      w(`${Colors.red}  Failed to generate commit message${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.green}✓ Generated:${Colors.reset}\r\n  ${colorize(message, 'cyan')}\r\n\r\n`);

    const confirm = await smartInput.askChoice('Confirm and push?', [
      { key: 'y', label: 'yes', description: 'Commit and push' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit message' },
    ]);

    if (confirm === 'n') {
      w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    let finalMessage = message;

    if (confirm === 'e') {
      const instructions = await smartInput.question(colorize('  Instructions for AI: ', 'cyan'));
      if (!instructions.trim()) {
        w(colorize('  Cancelled\r\n\r\n', 'muted'));
        return;
      }

      w(`\r\n${Colors.cyan}🤖 Regenerating...${Colors.reset}\r\n`);
      const diffInfo = this.commitGenerator.getDiffInfo();
      if (diffInfo) {
        const refined = await this.commitGenerator.refineCommitMessage(message, instructions.trim(), diffInfo);
        w(`\r\n${Colors.green}✓ Refined:${Colors.reset}\r\n  ${colorize(refined, 'cyan')}\r\n\r\n`);

        const confirmRefined = await smartInput.askChoice('Use this?', [
          { key: 'y', label: 'yes', description: 'Commit and push' },
          { key: 'n', label: 'no', description: 'Cancel' },
        ]);

        if (confirmRefined === 'n') {
          w(colorize('  Cancelled\r\n\r\n', 'muted'));
          return;
        }
        finalMessage = refined;
      }
    }

    w(colorize('  Committing...\r\n', 'muted'));
    const commitSuccess = this.commitGenerator.executeCommit(finalMessage, true);
    if (!commitSuccess) {
      w(`${Colors.red}  ✗ Commit failed${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`${Colors.green}  ✓ Committed${Colors.reset}\r\n`);
    w(colorize('  Pushing...\r\n', 'muted'));

    const pushResult = this.commitGenerator.executePush();
    if (pushResult.success) {
      w(`${Colors.green}  ✓ Pushed${Colors.reset}\r\n\r\n`);
    } else {
      w(`${Colors.red}  ✗ Push failed:${Colors.reset} ${pushResult.error}\r\n\r\n`);
    }
  }

  async cmdSplitUp(smartInput: SmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    if (!this.commitGenerator.hasChanges()) {
      w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.cyan}🤖 Analyzing for split...${Colors.reset}\r\n`);

    const commits = await this.commitGenerator.splitCommits();
    if (!commits || commits.length === 0) {
      w(`${Colors.red}  Failed to split commits${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.green}✓ Proposed ${commits.length} commits:${Colors.reset}\r\n\r\n`);
    
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      w(`  ${colorize((i + 1).toString() + '.', 'cyan')} ${commit.message}\r\n`);
      w(`     ${colorize('Files: ' + commit.files.join(', '), 'muted')}\r\n`);
    }

    w('\r\n');

    const confirm = await smartInput.askChoice('Execute these commits?', [
      { key: 'y', label: 'yes', description: `Commit all ${commits.length}` },
      { key: 'n', label: 'no', description: 'Cancel' },
    ]);

    if (confirm !== 'y') {
      w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    w(colorize('  Executing...\r\n', 'muted'));
    const result = this.commitGenerator.executeSplitCommits(commits);

    if (result.success) {
      w(`${Colors.green}  ✓ ${result.committed} commits executed${Colors.reset}\r\n`);
      
      w(colorize('  Pushing...\r\n', 'muted'));
      const pushResult = this.commitGenerator.executePush();

      if (pushResult.success) {
        w(`${Colors.green}  ✓ Pushed${Colors.reset}\r\n\r\n`);
      } else {
        w(`${Colors.red}  ✗ Push failed:${Colors.reset} ${pushResult.error}\r\n\r\n`);
      }
    } else {
      w(`${Colors.red}  ✗ Failed:${Colors.reset} ${result.error}\r\n\r\n`);
    }
  }

  async cmdPr(smartInput: SmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    const branch = this.prGenerator.getCurrentBranch();
    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      w(`${Colors.yellow}  Cannot create PR from ${branch} branch${Colors.reset}\r\n\r\n`);
      return;
    }

    const detectedBase = this.prGenerator.detectDefaultBaseBranch();
    const baseInput = await smartInput.question(colorize(`  Base branch (default: ${detectedBase}): `, 'cyan'));
    const baseBranch = baseInput.trim() || detectedBase;

    w(`\r\n${Colors.cyan}🔍 Analyzing commits...${Colors.reset}\r\n`);

    const commits = this.prGenerator.getCommitsNotInBase(baseBranch);
    if (commits.length === 0) {
      w(`${Colors.yellow}  No commits found between ${branch} and ${baseBranch}${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.green}✓ Found ${commits.length} commit(s):${Colors.reset}\r\n`);
    for (const commit of commits) {
      w(`  ${colorize(commit.hash.slice(0, 7), 'muted')} ${commit.message.slice(0, 50)}${commit.message.length > 50 ? '...' : ''}\r\n`);
    }

    w(`\r\n${Colors.cyan}🤖 Generating PR description...${Colors.reset}\r\n`);

    const prDescription = await this.prGenerator.generatePRDescription(branch, commits, baseBranch);

    w(`\r\n${colorize('─'.repeat(50), 'subtle')}\r\n`);
    w(colorize('Pull Request Preview:', 'bold') + '\r\n');
    w(colorize('─'.repeat(50), 'subtle') + '\r\n\r\n');
    w(`${colorize('Title:', 'bold')}\r\n  ${colorize(prDescription.title, 'cyan')}\r\n\r\n`);
    
    const descLines = prDescription.description.split('\n');
    for (const line of descLines.slice(0, 25)) {
      w(`  ${line}\r\n`);
    }
    if (descLines.length > 25) {
      w(`  ${colorize(`... (${descLines.length - 25} more lines)`, 'muted')}\r\n`);
    }
    
    w(`\r\n${colorize('─'.repeat(50), 'subtle')}\r\n\r\n`);

    const confirm = await smartInput.askChoice('Create this PR?', [
      { key: 'y', label: 'yes', description: 'Create PR on GitHub' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit title/description' },
    ]);

    if (confirm === 'n') {
      w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    let finalTitle = prDescription.title;
    let finalDescription = prDescription.description;

    if (confirm === 'e') {
      const newTitle = await smartInput.question(colorize('  Title (empty to keep): ', 'cyan'));
      if (newTitle.trim()) {
        finalTitle = newTitle.trim();
      }

      const editDesc = await smartInput.askChoice('Edit description?', [
        { key: 'y', label: 'yes', description: 'Open in editor' },
        { key: 'n', label: 'no', description: 'Keep as is' },
      ]);

      if (editDesc === 'y') {
        const fs = require('fs');
        const { execSync } = require('child_process');
        const tempFile = `/tmp/pr-desc-${Date.now()}.md`;
        fs.writeFileSync(tempFile, finalDescription);
        
        const editor = process.env.EDITOR || 'nano';
        try {
          execSync(`${editor} "${tempFile}"`, { stdio: 'inherit' });
          finalDescription = fs.readFileSync(tempFile, 'utf-8');
        } catch {
          w(colorize('  Could not open editor\r\n', 'yellow'));
        } finally {
          try { fs.unlinkSync(tempFile); } catch {}
        }
      }
    }

    const { platform } = this.prGenerator.detectPlatform();
    
    if (platform === 'github') {
      try {
        const { execSync } = require('child_process');
        execSync(`git push origin ${branch}`, { cwd: process.cwd() });
      } catch {}
    }

    const result = await this.prGenerator.createPR(finalTitle, finalDescription, baseBranch);

    if (result.success && result.url) {
      w(`\r\n${Colors.green}✓ Pull Request created!${Colors.reset}\r\n`);
      w(`  ${colorize(result.url, 'cyan')}\r\n\r\n`);
    } else {
      if (result.description) {
        const copied = this.prGenerator.copyToClipboard(result.description);
        w(`\r\n${colorize('PR Description:', 'bold')}\r\n`);
        w(colorize('─'.repeat(50), 'subtle') + '\r\n');
        w(result.description.split('\n').slice(0, 30).join('\r\n') + '\r\n');
        w(colorize('─'.repeat(50), 'subtle') + '\r\n\r\n');
        
        if (copied) {
          w(`${colorize('✓', 'success')} Copied to clipboard\r\n`);
        }

        const createUrl = this.prGenerator.getPRCreateUrl(platform, baseBranch);
        if (createUrl) {
          w(`\r\n  ${colorize('Open to create PR:', 'muted')}\r\n`);
          w(`  ${colorize(createUrl, 'cyan')}\r\n`);
        }
      }
      w('\r\n');
    }
  }

  async cmdReview(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    let files: string[] = [];
    
    if (args.length > 0) {
      files = args.filter(a => !a.startsWith('/'));
    } else {
      w(`\r\n${Colors.cyan}🔍 Analyzing staged files...${Colors.reset}\r\n`);
      files = this.codeReviewService['getChangedFiles'](true);
    }

    if (files.length === 0) {
      w(`${Colors.yellow}  No files to review${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.cyan}🤖 Reviewing ${files.length} file(s)...${Colors.reset}\r\n`);

    const results = await this.codeReviewService.reviewFiles(files);

    let totalIssues = 0;
    let totalScore = 0;

    for (const result of results) {
      totalScore += result.score;
      const errors = result.issues.filter(i => i.severity === 'error').length;
      const warnings = result.issues.filter(i => i.severity === 'warning').length;
      const suggestions = result.issues.filter(i => i.severity === 'suggestion').length;
      totalIssues += result.issues.length;

      const scoreColor = result.score >= 80 ? 'success' : result.score >= 60 ? 'warning' : 'error';
      
      w(`\r\n${colorize(result.file, 'bold')} ${colorize(result.score + '/100', scoreColor)}\r\n`);
      w(`  ${colorize(result.summary, 'muted')}\r\n`);

      if (errors > 0) w(`  ${colorize('✗ ' + errors + ' errors', 'error')}  `);
      if (warnings > 0) w(`${colorize('⚠ ' + warnings + ' warnings', 'warning')}  `);
      if (suggestions > 0) w(`${colorize('💡 ' + suggestions + ' suggestions', 'muted')}`);
      if (errors > 0 || warnings > 0 || suggestions > 0) w('\r\n');

      const topIssues = result.issues.filter(i => i.severity !== 'praise').slice(0, 3);
      for (const issue of topIssues) {
        const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : '💡';
        const color = issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'muted';
        const line = issue.line ? colorize(':' + issue.line, 'muted') : '';
        w(`  ${colorize(icon, color)} ${issue.message}${line}\r\n`);
      }

      if (result.issues.length > 3) {
        w(`  ${colorize('... and ' + (result.issues.length - 3) + ' more', 'muted')}\r\n`);
      }
    }

    const avgScore = Math.round(totalScore / results.length);
    const avgColor = avgScore >= 80 ? 'success' : avgScore >= 60 ? 'warning' : 'error';
    
    w(`\r\n${colorize('Summary:', 'bold')} ${colorize(avgScore + '/100', avgColor)} | ${totalIssues} issue(s)\r\n\r\n`);
  }

  async cmdFix(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    if (args.length === 0) {
      w(`${Colors.yellow}  Usage: /fix <file>${Colors.reset}\r\n\r\n`);
      return;
    }

    const filePath = args[0];
    w(`\r\n${Colors.cyan}🔧 Fixing ${filePath}...${Colors.reset}\r\n`);

    const result = await this.codeReviewService.fixFile(filePath);

    if (result.success) {
      w(`${Colors.green}  ✓ File fixed${Colors.reset}\r\n\r\n`);
    } else {
      w(`${Colors.red}  ✗ Failed: ${result.error}${Colors.reset}\r\n\r\n`);
    }
  }

  async cmdIdent(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${Colors.cyan}🎨 Formatting code files...${Colors.reset}\r\n`);

    const result = await this.codeReviewService.indentAll();

    w(`${Colors.green}  ✓ ${result.success} file(s) formatted${Colors.reset}\r\n`);
    if (result.failed > 0) {
      w(`${Colors.yellow}  ⚠ ${result.failed} file(s) failed${Colors.reset}\r\n`);
    }
    w('\r\n');
  }

  async cmdRelease(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const sinceTag = args[0];

    w(`\r\n${Colors.cyan}📝 Generating release notes...${Colors.reset}\r\n`);

    const result = await this.releaseNotesService.generateReleaseNotes(sinceTag);

    if (result.success && result.filePath) {
      w(`${Colors.green}  ✓ Release notes generated!${Colors.reset}\r\n`);
      w(`  ${colorize(result.filePath, 'accent')}\r\n\r\n`);

      if (result.content) {
        w(`${colorize('Preview:', 'bold')}\r\n`);
        const lines = result.content.split('\n').slice(0, 15);
        for (const line of lines) {
          w(`  ${line}\r\n`);
        }
        if (result.content.split('\n').length > 15) {
          w(`  ${colorize('...', 'muted')}\r\n`);
        }
        w('\r\n');
      }
    } else {
      w(`${Colors.red}  ✗ Failed: ${result.error}${Colors.reset}\r\n\r\n`);
    }
  }
}
