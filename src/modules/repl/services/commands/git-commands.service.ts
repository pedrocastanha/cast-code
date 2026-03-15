import { Injectable } from '@nestjs/common';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { CommitGeneratorService } from '../../../git/services/commit-generator.service';
import { MonorepoDetectorService } from '../../../git/services/monorepo-detector.service';
import { PrGeneratorService } from '../../../git/services/pr-generator.service';
import { CodeReviewService } from '../../../git/services/code-review.service';
import { ReleaseNotesService } from '../../../git/services/release-notes.service';
import { UnitTestGeneratorService } from '../../../git/services/unit-test-generator.service';
import { ISmartInput } from '../smart-input';

@Injectable()
export class GitCommandsService {
  constructor(
    private readonly commitGenerator: CommitGeneratorService,
    private readonly monorepoDetector: MonorepoDetectorService,
    private readonly prGenerator: PrGeneratorService,
    private readonly codeReviewService: CodeReviewService,
    private readonly releaseNotesService: ReleaseNotesService,
    private readonly unitTestGenerator: UnitTestGeneratorService,
  ) {}

  private w(s: string): void {
    process.stdout.write(s);
  }

  runGit(cmd: string): void {
    const check = spawnSync('git', ['--version'], { encoding: 'utf-8' });
    if (check.error) {
      const code = (check.error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.w(`${Colors.red}  git not found in PATH${Colors.reset}\r\n`);
      } else if (code === 'EPERM' || code === 'EACCES') {
        this.w(`${Colors.red}  cannot execute git in this environment (${code})${Colors.reset}\r\n`);
      } else {
        this.w(`${Colors.red}  git unavailable: ${code}${Colors.reset}\r\n`);
      }
      return;
    }

    try {
      const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      this.w(output ? `\r\n${output}\r\n\r\n` : `  ${colorize('(no output)', 'muted')}\r\n`);
    } catch (e: any) {
      const stderr: string = e.stderr?.toString().trim() || '';
      const msg = stderr || e.message || 'git command failed';
      this.w(`${Colors.red}  ${msg}${Colors.reset}\r\n`);
    }
  }

  async cmdCommit(args: string[], smartInput: ISmartInput): Promise<void> {
    const msg = args.join(' ');
    if (msg) {
      if (!this.commitGenerator.hasChanges()) {
        this.w(`${Colors.yellow}  Nothing to commit${Colors.reset}\r\n\r\n`);
        return;
      }
      try {
        execSync('git add -A', { cwd: process.cwd() });
        execSync('git commit -F -', { cwd: process.cwd(), input: `${msg}\n`, encoding: 'utf-8' });
        this.w(`${Colors.green}✓ Committed: ${msg}${Colors.reset}\r\n\r\n`);
      } catch (e: any) {
        const errorMessage = e.stderr?.toString().trim() || e.message || 'git commit failed';
        this.w(`${Colors.red}  ✗ ${errorMessage}${Colors.reset}\r\n\r\n`);
      }
      return;
    }

    if (!this.commitGenerator.hasChanges()) {
      this.w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.cyan}🤖 Analyzing changes...${Colors.reset}\r\n`);

    const message = await this.commitGenerator.generateCommitMessage();
    if (!message) {
      this.w(`${Colors.red}  Failed to generate commit message${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.green}✓ Generated:${Colors.reset} ${colorize(message, 'cyan')}\r\n\r\n`);

    const confirm = await smartInput.askChoice('Commit?', [
      { key: 'y', label: 'yes', description: 'Commit with this message' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit message' },
    ]);

    if (confirm === 'n') {
      this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    let finalMessage = message;
    if (confirm === 'e') {
      const newMsg = await smartInput.question(colorize('  Message: ', 'cyan'));
      if (!newMsg.trim()) {
        this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
        return;
      }
      finalMessage = newMsg.trim();
    }

    const success = this.commitGenerator.executeCommit(finalMessage);
    this.w(success
      ? `${Colors.green}✓ Committed${Colors.reset}\r\n\r\n`
      : `${Colors.red}✗ Commit failed${Colors.reset}\r\n\r\n`);
  }

  async cmdUp(smartInput: ISmartInput): Promise<void> {

    if (!this.commitGenerator.hasChanges()) {
      this.w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.cyan}🤖 Analyzing changes...${Colors.reset}\r\n`);

    const message = await this.commitGenerator.generateCommitMessage();
    if (!message) {
      this.w(`${Colors.red}  Failed to generate commit message${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.green}✓ Generated:${Colors.reset}\r\n  ${colorize(message, 'cyan')}\r\n\r\n`);

    const confirm = await smartInput.askChoice('Confirm and push?', [
      { key: 'y', label: 'yes', description: 'Commit and push' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit message' },
    ]);

    if (confirm === 'n') {
      this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    let finalMessage = message;

    if (confirm === 'e') {
      const instructions = await smartInput.question(colorize('  Instructions for AI: ', 'cyan'));
      if (!instructions.trim()) {
        this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
        return;
      }

      this.w(`\r\n${Colors.cyan}🤖 Regenerating...${Colors.reset}\r\n`);
      const diffInfo = this.commitGenerator.getDiffInfo();
      if (diffInfo) {
        const refined = await this.commitGenerator.refineCommitMessage(message, instructions.trim(), diffInfo);
        this.w(`\r\n${Colors.green}✓ Refined:${Colors.reset}\r\n  ${colorize(refined, 'cyan')}\r\n\r\n`);

        const confirmRefined = await smartInput.askChoice('Use this?', [
          { key: 'y', label: 'yes', description: 'Commit and push' },
          { key: 'n', label: 'no', description: 'Cancel' },
        ]);

        if (confirmRefined === 'n') {
          this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
          return;
        }
        finalMessage = refined;
      } else {
        this.w(`${Colors.yellow}  Could not retrieve diff, using original message${Colors.reset}\r\n`);
      }
    }

    this.w(colorize('  Committing...\r\n', 'muted'));
    const commitSuccess = this.commitGenerator.executeCommit(finalMessage, true);
    if (!commitSuccess) {
      this.w(`${Colors.red}  ✗ Commit failed${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`${Colors.green}  ✓ Committed${Colors.reset}\r\n`);
    this.w(colorize('  Pushing...\r\n', 'muted'));

    const pushResult = this.commitGenerator.executePush();
    if (pushResult.success) {
      this.w(`${Colors.green}  ✓ Pushed${Colors.reset}\r\n\r\n`);
    } else {
      this.w(`${Colors.red}  ✗ Push failed:${Colors.reset} ${pushResult.error}\r\n\r\n`);
    }
  }

  async cmdSplitUp(smartInput: ISmartInput): Promise<void> {

    if (!this.commitGenerator.hasChanges()) {
      this.w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.cyan}🤖 Analyzing for split...${Colors.reset}\r\n`);

    const proposedCommits = await this.commitGenerator.splitCommits();
    const commits = (proposedCommits || []).filter(c => c.files && c.files.length > 0);

    if (commits.length === 0) {
      this.w(`${Colors.red}  Failed to split commits${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.green}✓ Proposed ${commits.length} commits:${Colors.reset}\r\n\r\n`);
    
    const cols = process.stdout.columns || 80;
    const filesMax = Math.max(20, cols - 12);
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const filesStr = commit.files.join(', ');
      const filesDisplay = filesStr.length > filesMax ? filesStr.slice(0, filesMax - 1) + '…' : filesStr;
      this.w(`  ${colorize((i + 1).toString() + '.', 'cyan')} ${commit.message}\r\n`);
      this.w(`     ${colorize('Files: ' + filesDisplay, 'muted')}\r\n`);
    }

    this.w('\r\n');

    const confirm = await smartInput.askChoice('Execute these commits?', [
      { key: 'y', label: 'yes', description: `Commit all ${commits.length}` },
      { key: 'n', label: 'no', description: 'Cancel' },
    ]);

    if (confirm !== 'y') {
      this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    this.w(colorize('  Executing...\r\n', 'muted'));
    const result = this.commitGenerator.executeSplitCommits(commits);

    if (result.success) {
      this.w(`${Colors.green}  ✓ ${result.committed} commits executed${Colors.reset}\r\n\r\n`);

      try {
        const log = execSync(`git log --oneline -${result.committed}`, { cwd: process.cwd(), encoding: 'utf-8' });
        this.w(colorize('  Commits created:\r\n', 'bold'));
        log.split('\n').filter(l => l.trim()).forEach((line: string) => {
          this.w(`    ${colorize(line, 'muted')}\r\n`);
        });
        this.w('\r\n');
      } catch {}

      const confirmPush = await smartInput.askChoice(`Push ${result.committed} commit(s) to remote? [y/N]`, [
        { key: 'y', label: 'yes', description: 'Push to remote' },
        { key: 'n', label: 'no', description: 'Skip push' },
      ]);

      if (confirmPush === 'y') {
        this.w(colorize('  Pushing...\r\n', 'muted'));
        const pushResult = this.commitGenerator.executePush();

        if (pushResult.success) {
          this.w(`${Colors.green}  ✓ Pushed${Colors.reset}\r\n\r\n`);
        } else {
          this.w(`${Colors.red}  ✗ Push failed:${Colors.reset} ${pushResult.error}\r\n\r\n`);
        }
      } else {
        this.w(colorize('  Push skipped\r\n\r\n', 'muted'));
      }
    } else {
      this.w(`${Colors.red}  ✗ Failed after ${result.committed} commit(s):${Colors.reset} ${result.error}\r\n`);

      if (result.originalHead && result.committed > 0) {
        this.w(`${colorize('  Rollback available:', 'warning')}\r\n`);
        this.w(`  ${colorize(`git reset --soft ${result.originalHead}`, 'cyan')}\r\n\r\n`);
      } else {
        this.w('\r\n');
      }
    }
  }

  async cmdPr(smartInput: ISmartInput): Promise<void> {

    const branch = this.prGenerator.getCurrentBranch();
    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      this.w(`${Colors.yellow}  Cannot create PR from ${branch} branch${Colors.reset}\r\n\r\n`);
      return;
    }

    const detectedBase = this.prGenerator.detectDefaultBaseBranch();
    const baseInput = await smartInput.question(colorize(`  Base branch (default: ${detectedBase}): `, 'cyan'));
    const baseBranch = baseInput.trim() || detectedBase;

    this.w(`\r\n${Colors.cyan}🔍 Analyzing commits...${Colors.reset}\r\n`);

    const commits = this.prGenerator.getCommitsNotInBase(baseBranch);
    if (commits.length === 0) {
      this.w(`${Colors.yellow}  No commits found between ${branch} and ${baseBranch}${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.green}✓ Found ${commits.length} commit(s):${Colors.reset}\r\n`);
    for (const commit of commits) {
      this.w(`  ${colorize(commit.hash.slice(0, 7), 'muted')} ${commit.message.slice(0, 50)}${commit.message.length > 50 ? '...' : ''}\r\n`);
    }

    this.w(`\r\n${Colors.cyan}🤖 Generating PR description...${Colors.reset}\r\n`);

    const prDescription = await this.prGenerator.generatePRDescription(branch, commits, baseBranch);

    this.w(`\r\n${colorize('─'.repeat(50), 'subtle')}\r\n`);
    this.w(colorize('Pull Request Preview:', 'bold') + '\r\n');
    this.w(colorize('─'.repeat(50), 'subtle') + '\r\n\r\n');
    this.w(`${colorize('Title:', 'bold')}\r\n  ${colorize(prDescription.title, 'cyan')}\r\n\r\n`);
    
    const descLines = prDescription.description.split('\n');
    for (const line of descLines.slice(0, 25)) {
      this.w(`  ${line}\r\n`);
    }
    if (descLines.length > 25) {
      this.w(`  ${colorize(`... (${descLines.length - 25} more lines)`, 'muted')}\r\n`);
    }
    
    this.w(`\r\n${colorize('─'.repeat(50), 'subtle')}\r\n\r\n`);

    const confirm = await smartInput.askChoice('Create this PR?', [
      { key: 'y', label: 'yes', description: 'Create PR on GitHub' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit title/description' },
    ]);

    if (confirm === 'n') {
      this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
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
        const tempFile = `/tmp/pr-desc-${Date.now()}.md`;
        fs.writeFileSync(tempFile, finalDescription);
        
        const editor = process.env.EDITOR || 'nano';
        try {
          execSync(`${editor} "${tempFile}"`, { stdio: 'inherit' });
          finalDescription = fs.readFileSync(tempFile, 'utf-8');
        } catch {
          this.w(colorize('  Could not open editor\r\n', 'yellow'));
        } finally {
          try { fs.unlinkSync(tempFile); } catch {}
        }
      }
    }

    const { platform } = this.prGenerator.detectPlatform();
    
    if (platform === 'github') {
      try {
        execSync(`git push origin ${branch}`, { cwd: process.cwd() });
      } catch (e: any) {
        const errorMessage = (e as any).stderr?.toString().trim() || (e as any).message || 'unknown error';
        this.w(`${Colors.red}  ✗ Push failed: ${errorMessage}${Colors.reset}\r\n\r\n`);
        return;
      }
    }

    const result = await this.prGenerator.createPR(finalTitle, finalDescription, baseBranch);

    if (result.success && result.url) {
      this.w(`\r\n${Colors.green}✓ Pull Request created!${Colors.reset}\r\n`);
      this.w(`  ${colorize(result.url, 'cyan')}\r\n\r\n`);
    } else {
      if (result.description) {
        const copied = this.prGenerator.copyToClipboard(result.description);
        this.w(`\r\n${colorize('PR Description:', 'bold')}\r\n`);
        this.w(colorize('─'.repeat(50), 'subtle') + '\r\n');
        this.w(result.description.split('\n').slice(0, 30).join('\r\n') + '\r\n');
        this.w(colorize('─'.repeat(50), 'subtle') + '\r\n\r\n');
        
        if (copied) {
          this.w(`${colorize('✓', 'success')} Copied to clipboard\r\n`);
        }

        const createUrl = this.prGenerator.getPRCreateUrl(platform, baseBranch);
        if (createUrl) {
          this.w(`\r\n  ${colorize('Open to create PR:', 'muted')}\r\n`);
          this.w(`  ${colorize(createUrl, 'cyan')}\r\n`);
        }
      }
      this.w('\r\n');
    }
  }

  async cmdReview(args: string[]): Promise<void> {

    let files: string[] = [];
    
    if (args.length > 0) {
      files = args.filter(a => !a.startsWith('/'));
    } else {
      this.w(`\r\n${Colors.cyan}🔍 Analyzing staged files...${Colors.reset}\r\n`);
      files = this.codeReviewService.getChangedFiles(true);
    }

    if (files.length === 0) {
      this.w(`${Colors.yellow}  No files to review${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.cyan}🤖 Reviewing ${files.length} file(s)...${Colors.reset}\r\n`);

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
      
      this.w(`\r\n${colorize(result.file, 'bold')} ${colorize(result.score + '/100', scoreColor)}\r\n`);
      this.w(`  ${colorize(result.summary, 'muted')}\r\n`);

      if (errors > 0) this.w(`  ${colorize('✗ ' + errors + ' errors', 'error')}  `);
      if (warnings > 0) this.w(`${colorize('⚠ ' + warnings + ' warnings', 'warning')}  `);
      if (suggestions > 0) this.w(`${colorize('💡 ' + suggestions + ' suggestions', 'muted')}`);
      if (errors > 0 || warnings > 0 || suggestions > 0) this.w('\r\n');

      const topIssues = result.issues.filter(i => i.severity !== 'praise').slice(0, 3);
      for (const issue of topIssues) {
        const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : '💡';
        const color = issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'muted';
        const line = issue.line ? colorize(':' + issue.line, 'muted') : '';
        this.w(`  ${colorize(icon, color)} ${issue.message}${line}\r\n`);
      }

      if (result.issues.length > 3) {
        this.w(`  ${colorize('... and ' + (result.issues.length - 3) + ' more', 'muted')}\r\n`);
      }
    }

    const avgScore = Math.round(totalScore / results.length);
    const avgColor = avgScore >= 80 ? 'success' : avgScore >= 60 ? 'warning' : 'error';
    
    this.w(`\r\n${colorize('Summary:', 'bold')} ${colorize(avgScore + '/100', avgColor)} | ${totalIssues} issue(s)\r\n\r\n`);
  }

  async cmdFix(args: string[]): Promise<void> {

    if (args.length === 0) {
      this.w(`${Colors.yellow}  Usage: /fix <file>${Colors.reset}\r\n\r\n`);
      return;
    }

    const filePath = args[0];
    this.w(`\r\n${Colors.cyan}🔧 Fixing ${filePath}...${Colors.reset}\r\n`);

    const result = await this.codeReviewService.fixFile(filePath);

    if (result.success) {
      this.w(`${Colors.green}  ✓ File fixed${Colors.reset}\r\n\r\n`);
    } else {
      this.w(`${Colors.red}  ✗ Failed: ${result.error}${Colors.reset}\r\n\r\n`);
    }
  }

  async cmdIdent(): Promise<void> {
    this.w(`\r\n${Colors.cyan}🎨 Formatting code files...${Colors.reset}\r\n`);

    const result = await this.codeReviewService.indentAll();

    this.w(`${Colors.green}  ✓ ${result.success} file(s) formatted${Colors.reset}\r\n`);
    if (result.failed > 0) {
      this.w(`${Colors.yellow}  ⚠ ${result.failed} file(s) failed${Colors.reset}\r\n`);
    }
    this.w('\r\n');
  }

  async cmdRelease(args: string[]): Promise<void> {
    const sinceTag = args[0];

    this.w(`\r\n${Colors.cyan}📝 Generating release notes...${Colors.reset}\r\n`);

    const result = await this.releaseNotesService.generateReleaseNotes(sinceTag);

    if (result.success && result.filePath) {
      this.w(`${Colors.green}  ✓ Release notes generated!${Colors.reset}\r\n`);
      this.w(`  ${colorize(result.filePath, 'accent')}\r\n\r\n`);

      if (result.content) {
        this.w(`${colorize('Preview:', 'bold')}\r\n`);
        const lines = result.content.split('\n').slice(0, 15);
        for (const line of lines) {
          this.w(`  ${line}\r\n`);
        }
        if (result.content.split('\n').length > 15) {
          this.w(`  ${colorize('...', 'muted')}\r\n`);
        }
        this.w('\r\n');
      }
    } else {
      this.w(`${Colors.red}  ✗ Failed: ${result.error}${Colors.reset}\r\n\r\n`);
    }
  }

  async cmdUnitTest(smartInput: ISmartInput): Promise<void> {

    const detectedBase = this.unitTestGenerator.detectDefaultBaseBranch();
    const baseInput = await smartInput.question(colorize(`  Base branch (default: ${detectedBase}): `, 'cyan'));
    const baseBranch = baseInput.trim() || detectedBase;

    this.w(`\r\n${Colors.cyan}🔍 Analyzing branch changes...${Colors.reset}\r\n`);
    const changedFiles = this.unitTestGenerator.getChangedFiles(baseBranch);
    if (changedFiles.length === 0) {
      this.w(`${Colors.yellow}  No changes found between HEAD and ${baseBranch}${Colors.reset}\r\n\r\n`);
      return;
    }

    this.w(`\r\n${Colors.cyan}🤖 Generating unit tests...${Colors.reset}\r\n`);
    const frames = ['◐', '◓', '◑', '◒'];
    let frame = 0;
    let progressText = 'Starting...';
    const spinner = setInterval(() => {
      const icon = frames[frame++ % frames.length];
      this.w(`\r  ${colorize(icon, 'cyan')} ${colorize(progressText, 'muted')}`);
    }, 90);

    let result;
    try {
      result = await this.unitTestGenerator.generateUnitTests(
        baseBranch,
        ({ current, total, sourcePath }) => {
          const shortPath = sourcePath.length > 64 ? `...${sourcePath.slice(-61)}` : sourcePath;
          progressText = `[${current}/${total}] ${shortPath}`;
        },
      );
    } catch (error: any) {
      const message = error?.message || 'unknown error';
      clearInterval(spinner);
      this.w('\r\x1b[K');
      this.w(`${Colors.red}  Failed to generate unit tests: ${message}${Colors.reset}\r\n\r\n`);
      return;
    } finally {
      clearInterval(spinner);
      this.w('\r\x1b[K');
    }

    if (!result.files.length) {
      this.w(`${Colors.yellow}  No unit tests generated${Colors.reset}\r\n`);
      if (result.notes.length > 0) {
        for (const note of result.notes) {
          this.w(`  ${colorize(note, 'muted')}\r\n`);
        }
      }
      this.w('\r\n');
      return;
    }

    this.w(`\r\n${Colors.green}✓ Generated ${result.files.length} test file(s)${Colors.reset}\r\n`);
    for (const file of result.files) {
      const reason = file.reason ? ` - ${file.reason}` : '';
      this.w(`  ${colorize(file.path, 'cyan')}${colorize(reason, 'muted')}\r\n`);
    }

    if (result.notes.length > 0) {
      this.w(`\r\n${colorize('Coverage notes:', 'bold')}\r\n`);
      for (const note of result.notes) {
        this.w(`  ${colorize('- ' + note, 'muted')}\r\n`);
      }
    }

    const confirm = await smartInput.askChoice('Write unit tests to disk?', [
      { key: 'y', label: 'yes', description: 'Create and update test files' },
      { key: 'n', label: 'no', description: 'Cancel' },
    ]);
    if (confirm === 'n') {
      this.w(colorize('  Cancelled\r\n\r\n', 'muted'));
      return;
    }

    let written = 0;
    for (const file of result.files) {
      try {
        const dir = path.dirname(file.path);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file.path, file.content + '\n', 'utf-8');
        written++;
      } catch {}
    }

    this.w(`\r\n${Colors.green}✓ Wrote ${written} test file(s)${Colors.reset}\r\n\r\n`);
  }
}
