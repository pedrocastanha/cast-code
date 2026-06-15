import { Injectable } from '@nestjs/common';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import { CommitGeneratorService } from '../../../git/services/commit-generator.service';
import { PrGeneratorService } from '../../../git/services/pr-generator.service';
import { CodeReviewService } from '../../../git/services/code-review.service';
import { ReleaseNotesService } from '../../../git/services/release-notes.service';
import { UnitTestGeneratorService } from '../../../git/services/unit-test-generator.service';
import { BranchSplitService } from '../../../git/services/branch-split.service';
import { ISmartInput } from '../smart-input';

@Injectable()
export class GitCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly commitGenerator: CommitGeneratorService,
    private readonly prGenerator: PrGeneratorService,
    private readonly codeReviewService: CodeReviewService,
    private readonly releaseNotesService: ReleaseNotesService,
    private readonly unitTestGenerator: UnitTestGeneratorService,
    private readonly branchSplit: BranchSplitService,
  ) {}

  private w(s: string): void {
    process.stdout.write(s);
  }

  private success(message: string): void {
    this.w(this.ui.success(message));
  }

  private warning(message: string): void {
    this.w(this.ui.warning(message));
  }

  private error(message: string): void {
    this.w(this.ui.error(message));
  }

  private info(message: string): void {
    this.w(`\r\n  ${colorize(message, 'info')}\r\n`);
  }

  private providerErrorMessage(error: unknown): string {
    if (error && typeof error === 'object') {
      const typed = error as {
        message?: string;
        status?: number;
        error?: {
          message?: string;
          metadata?: { raw?: string; provider_name?: string };
        };
      };
      const raw = typed.error?.metadata?.raw || typed.error?.message || typed.message;
      if (raw) {
        const prefix = typed.status ? `Provider error ${typed.status}` : 'Provider error';
        return `${prefix}: ${raw}`;
      }
    }

    return error instanceof Error ? error.message : String(error);
  }

  runGit(cmd: string): void {
    const check = spawnSync('git', ['--version'], { encoding: 'utf-8' });
    if (check.error) {
      const code = (check.error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.error('git not found in PATH');
      } else if (code === 'EPERM' || code === 'EACCES') {
        this.error(`cannot execute git in this environment (${code})`);
      } else {
        this.error(`git unavailable: ${code}`);
      }
      return;
    }

    try {
      const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      this.w(output ? `\r\n${output}\r\n\r\n` : `  ${colorize('(no output)', 'muted')}\r\n`);
    } catch (e: any) {
      const stderr: string = e.stderr?.toString().trim() || '';
      const msg = stderr || e.message || 'git command failed';
      this.error(msg);
    }
  }

  async cmdCommit(args: string[], smartInput: ISmartInput): Promise<void> {
    const msg = args.join(' ');
    if (msg) {
      if (!this.commitGenerator.hasChanges()) {
        this.warning('Nothing to commit');
        return;
      }
      try {
        execSync('git add -A', { cwd: process.cwd() });
        execSync('git commit -F -', { cwd: process.cwd(), input: `${msg}\n`, encoding: 'utf-8' });
        this.success(`Committed: ${msg}`);
      } catch (e: any) {
        const errorMessage = e.stderr?.toString().trim() || e.message || 'git commit failed';
        this.error(errorMessage);
      }
      return;
    }

    if (!this.commitGenerator.hasChanges()) {
      this.warning('No changes to commit');
      return;
    }

    this.info('Analyzing changes...');

    const message = await this.commitGenerator.generateCommitMessage();
    if (!message) {
      this.error('Failed to generate commit message');
      return;
    }

    this.w(this.ui.panel({
      title: 'Commit Message',
      subtitle: 'generated',
      sections: [{ lines: [colorize(message, 'cyan')] }],
    }));

    const confirm = await smartInput.askChoice('Commit?', [
      { key: 'y', label: 'yes', description: 'Commit with this message' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit message' },
    ]);

    if (confirm === 'n') {
      this.warning('Cancelled');
      return;
    }

    let finalMessage = message;
    if (confirm === 'e') {
      const newMsg = await smartInput.question(colorize('  Message: ', 'cyan'));
      if (!newMsg.trim()) {
        this.warning('Cancelled');
        return;
      }
      finalMessage = newMsg.trim();
    }

    const success = this.commitGenerator.executeCommit(finalMessage);
    success ? this.success('Committed') : this.error('Commit failed');
  }

  async cmdUp(smartInput: ISmartInput, opts?: { push?: boolean }): Promise<boolean> {
    const shouldPush = opts?.push !== false;

    if (!this.commitGenerator.hasChanges()) {
      this.warning('No changes to commit');
      return true;
    }

    this.info('Analyzing changes...');

    const message = await this.commitGenerator.generateCommitMessage();
    if (!message) {
      this.error('Failed to generate commit message');
      return false;
    }

    this.w(this.ui.panel({
      title: 'Commit Message',
      subtitle: 'generated',
      sections: [{ lines: [colorize(message, 'cyan')] }],
    }));

    const confirm = await smartInput.askChoice(shouldPush ? 'Confirm and push?' : 'Confirm commit?', [
      { key: 'y', label: 'yes', description: shouldPush ? 'Commit and push' : 'Commit' },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit message' },
    ]);

    if (confirm === 'n') {
      this.warning('Cancelled');
      return true;
    }

    let finalMessage = message;

    if (confirm === 'e') {
      const instructions = await smartInput.question(colorize('  Instructions for AI: ', 'cyan'));
      if (!instructions.trim()) {
        this.warning('Cancelled');
        return true;
      }

      this.info('Regenerating...');
      const diffInfo = this.commitGenerator.getDiffInfo();
      if (diffInfo) {
        const refined = await this.commitGenerator.refineCommitMessage(message, instructions.trim(), diffInfo);
        this.w(this.ui.panel({
          title: 'Commit Message',
          subtitle: 'refined',
          sections: [{ lines: [colorize(refined, 'cyan')] }],
        }));

        const confirmRefined = await smartInput.askChoice('Use this?', [
          { key: 'y', label: 'yes', description: shouldPush ? 'Commit and push' : 'Commit' },
          { key: 'n', label: 'no', description: 'Cancel' },
        ]);

        if (confirmRefined === 'n') {
          this.warning('Cancelled');
          return true;
        }
        finalMessage = refined;
      } else {
        this.warning('Could not retrieve diff, using original message');
      }
    }

    this.w(colorize('  Committing...\r\n', 'muted'));
    const commitSuccess = this.commitGenerator.executeCommit(finalMessage, true);
    if (!commitSuccess) {
      this.error('Commit failed');
      return false;
    }

    this.success('Committed');

    if (!shouldPush) {
      this.w(colorize('  Push skipped (--no-push)\r\n', 'muted'));
      return true;
    }

    this.w(colorize('  Pushing...\r\n', 'muted'));

    const pushResult = this.commitGenerator.executePush();
    if (pushResult.success) {
      this.success('Pushed');
      return true;
    } else {
      this.error(`Push failed: ${pushResult.error}`);
      return false;
    }
  }

  async cmdSplitUp(smartInput: ISmartInput): Promise<boolean> {

    if (!this.commitGenerator.hasChanges()) {
      this.warning('No changes to commit');
      return true;
    }

    const frames = ['◐', '◓', '◑', '◒'];
    let frame = 0;
    let progressText = 'Analyzing changes for split commits...';
    const spinner = setInterval(() => {
      const icon = frames[frame++ % frames.length];
      this.w(`\r  ${colorize(icon, 'cyan')} ${colorize(progressText, 'muted')}\x1b[K`);
    }, 90);

    let proposedCommits;
    try {
      proposedCommits = await this.commitGenerator.splitCommits(({ current, total, label }) => {
        const shortLabel = label.length > 48 ? `...${label.slice(-45)}` : label;
        progressText = `Writing commit messages [${current}/${total}] ${shortLabel}`;
      });
    } catch (error) {
      this.error(`Failed to split commits: ${this.providerErrorMessage(error)}`);
      return false;
    } finally {
      clearInterval(spinner);
      this.w('\r\x1b[K');
    }
    const commits = (proposedCommits || []).filter(c => c.files && c.files.length > 0);

    if (commits.length === 0) {
      this.error('Failed to split commits');
      return false;
    }

    this.w(this.ui.panel({
      title: 'Split Commits',
      subtitle: `${commits.length} proposed`,
      sections: [
        {
          lines: commits.map((commit, index) => {
            const filesStr = commit.files.join(', ');
            const filesDisplay = filesStr.length > 52 ? filesStr.slice(0, 51) + '...' : filesStr;
            return `${colorize(`${index + 1}.`, 'cyan')} ${commit.message} ${colorize(`(${filesDisplay})`, 'muted')}`;
          }),
        },
      ],
    }));

    const confirm = await smartInput.askChoice('Execute these commits?', [
      { key: 'y', label: 'yes', description: `Commit all ${commits.length}` },
      { key: 'n', label: 'no', description: 'Cancel' },
    ]);

    if (confirm !== 'y') {
      this.warning('Cancelled');
      return true;
    }

    this.w(colorize('  Executing...\r\n', 'muted'));
    const result = this.commitGenerator.executeSplitCommits(commits);

    if (result.success) {
      this.success(`${result.committed} commits executed`);

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
          this.success('Pushed');
          return true;
        } else {
          this.error(`Push failed: ${pushResult.error}`);
          return false;
        }
      } else {
        this.w(colorize('  Push skipped\r\n\r\n', 'muted'));
        return true;
      }
    } else {
      this.error(`Failed after ${result.committed} commit(s): ${result.error}`);

      if (result.originalHead && result.committed > 0) {
        this.w(`${colorize('  Rollback available:', 'warning')}\r\n`);
        this.w(`  ${colorize(`git reset --soft ${result.originalHead}`, 'cyan')}\r\n\r\n`);
      } else {
        this.w('\r\n');
      }
      return false;
    }
  }

  async cmdPr(smartInput: ISmartInput): Promise<void> {

    const branch = this.prGenerator.getCurrentBranch();
    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      this.warning(`Cannot create PR from ${branch} branch`);
      return;
    }

    const detectedBase = this.prGenerator.detectDefaultBaseBranch();
    const baseInput = await smartInput.question(colorize(`  Base branch (default: ${detectedBase}): `, 'cyan'));
    const baseBranch = baseInput.trim() || detectedBase;

    this.info('Analyzing commits...');

    const commits = this.prGenerator.getCommitsNotInBase(baseBranch);
    if (commits.length === 0) {
      this.warning(`No commits found between ${branch} and ${baseBranch}`);
      return;
    }

    this.w(this.ui.panel({
      title: 'Pull Request',
      subtitle: `${commits.length} commit(s) found`,
      sections: [
        {
          lines: commits.map((commit) => `${colorize(commit.hash.slice(0, 7), 'muted')} ${commit.message.slice(0, 70)}${commit.message.length > 70 ? '...' : ''}`),
        },
      ],
    }));

    this.info('Generating PR description...');

    const prDescription = await this.prGenerator.generatePRDescription(branch, commits, baseBranch);

    const descLines = prDescription.description.split('\n');
    const previewLines = [
      `${colorize('Title', 'muted')} ${colorize(prDescription.title, 'cyan')}`,
      '',
      ...descLines.slice(0, 25),
    ];
    if (descLines.length > 25) {
      previewLines.push(colorize(`... (${descLines.length - 25} more lines)`, 'muted'));
    }

    this.w(this.ui.panel({
      title: 'Pull Request Preview',
      sections: [{ lines: previewLines }],
      width: 88,
    }));

    const { platform } = this.prGenerator.detectPlatform();
    const canCreateAutomatically = platform === 'github';

    const confirm = await smartInput.askChoice(canCreateAutomatically ? 'Create this PR?' : 'Copy PR description?', [
      {
        key: 'y',
        label: canCreateAutomatically ? 'yes' : 'copy',
        description: canCreateAutomatically ? 'Create PR on GitHub' : `Copy description for ${platform} PR`,
      },
      { key: 'n', label: 'no', description: 'Cancel' },
      { key: 'e', label: 'edit', description: 'Edit title/description' },
    ]);

    if (confirm === 'n') {
      this.warning('Cancelled');
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
          this.warning('Could not open editor');
        } finally {
          try { fs.unlinkSync(tempFile); } catch {}
        }
      }
    }

    if (platform === 'github') {
      try {
        execSync(`git push origin ${branch}`, { cwd: process.cwd() });
      } catch (e: any) {
        const errorMessage = (e as any).stderr?.toString().trim() || (e as any).message || 'unknown error';
        this.error(`Push failed: ${errorMessage}`);
        return;
      }
    }

    const result = await this.prGenerator.createPR(finalTitle, finalDescription, baseBranch);

    if (result.success && result.url) {
      this.success(`Pull Request created: ${result.url}`);
    } else {
      if (result.description) {
        const copied = this.prGenerator.copyToClipboard(result.description);
        this.w(this.ui.panel({
          title: 'PR Description',
          sections: [{ lines: result.description.split('\n').slice(0, 30) }],
          width: 88,
        }));
        
        if (copied) {
          this.success('Copied to clipboard');
        } else {
          this.warning('Could not access clipboard. Install wl-clipboard, xclip, or xsel, or copy the description above.');
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
      this.info('Analyzing staged files...');
      files = this.codeReviewService.getChangedFiles(true);
    }

    if (files.length === 0) {
      this.warning('No files to review');
      return;
    }

    this.info(`Reviewing ${files.length} file(s)...`);

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
    
    this.w(this.ui.panel({
      title: 'Review Summary',
      sections: [
        {
          rows: [
            { label: 'Score', value: colorize(avgScore + '/100', avgColor) },
            { label: 'Issues', value: totalIssues.toString() },
          ],
        },
      ],
    }));
  }

  async cmdFix(args: string[]): Promise<void> {

    if (args.length === 0) {
      this.warning('Usage: /fix <file>');
      return;
    }

    const filePath = args[0];
    this.info(`Fixing ${filePath}...`);

    const result = await this.codeReviewService.fixFile(filePath);

    if (result.success) {
      this.success('File fixed');
    } else {
      this.error(`Failed: ${result.error}`);
    }
  }

  async cmdIdent(): Promise<void> {
    this.info('Formatting code files...');

    const result = await this.codeReviewService.indentAll();

    this.success(`${result.success} file(s) formatted`);
    if (result.failed > 0) {
      this.warning(`${result.failed} file(s) failed`);
    }
  }

  async cmdRelease(args: string[]): Promise<void> {
    const sinceTag = args[0];

    this.info('Generating release notes...');

    const result = await this.releaseNotesService.generateReleaseNotes(sinceTag);

    if (result.success && result.filePath) {
      this.success(`Release notes generated: ${result.filePath}`);

      if (result.content) {
        const lines = result.content.split('\n').slice(0, 15);
        const previewLines = [...lines];
        if (result.content.split('\n').length > 15) {
          previewLines.push(colorize('...', 'muted'));
        }
        this.w(this.ui.panel({
          title: 'Release Notes Preview',
          sections: [{ lines: previewLines }],
          width: 88,
        }));
      }
    } else {
      this.error(`Failed: ${result.error}`);
    }
  }

  async cmdUnitTest(smartInput: ISmartInput): Promise<void> {

    const detectedBase = this.unitTestGenerator.detectDefaultBaseBranch();
    const baseInput = await smartInput.question(colorize(`  Base branch (default: ${detectedBase}): `, 'cyan'));
    const baseBranch = baseInput.trim() || detectedBase;

    this.info('Analyzing branch changes...');
    const changedFiles = this.unitTestGenerator.getChangedFiles(baseBranch);
    if (changedFiles.length === 0) {
      this.warning(`No changes found between HEAD and ${baseBranch}`);
      return;
    }

    this.info('Generating unit tests...');
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
      this.error(`Failed to generate unit tests: ${message}`);
      return;
    } finally {
      clearInterval(spinner);
      this.w('\r\x1b[K');
    }

    if (!result.files.length) {
      this.warning('No unit tests generated');
      if (result.notes.length > 0) {
        for (const note of result.notes) {
          this.w(`  ${colorize(note, 'muted')}\r\n`);
        }
      }
      this.w('\r\n');
      return;
    }

    this.w(this.ui.panel({
      title: 'Generated Unit Tests',
      subtitle: `${result.files.length} file(s)`,
      sections: [
        {
          lines: result.files.map((file) => {
            const reason = file.reason ? ` - ${file.reason}` : '';
            return `${colorize(file.path, 'cyan')}${colorize(reason, 'muted')}`;
          }),
        },
      ],
    }));

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
      this.warning('Cancelled');
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

    this.success(`Wrote ${written} test file(s)`);
  }

  async cmdBranchSplit(args: string[], smartInput: ISmartInput): Promise<void> {
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');
    const positional = args.filter((a) => !a.startsWith('--'));

    if (positional[0] === 'create') {
      await this.runBranchSplitCreate();
      return;
    }

    if (this.commitGenerator.hasChanges()) {
      this.warning('Uncommitted changes detected. Commit them first with /split-up (or /up), then run /branch-split.');
      return;
    }

    let target = positional[0];
    if (!target) {
      const detected = this.prGenerator.detectDefaultBaseBranch();
      const input = await smartInput.question(colorize(`  Target branch (default: ${detected}): `, 'cyan'));
      target = input.trim() || detected;
    }

    let analysis;
    try {
      analysis = this.branchSplit.analyzeDiff(target);
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      return;
    }

    const totalLines = analysis.fileDiffs.reduce(
      (sum, fd) => sum + fd.hunks.reduce((s, h) => s + h.added + h.deleted, 0),
      0,
    );
    if (totalLines <= 300) {
      this.success(`Branch has ${totalLines} changed lines vs ${target} — no split needed (target: 200-300 per PR).`);
      return;
    }

    this.info(`Grouping ${totalLines} changed lines into a dependency-ordered stack...`);
    let groups;
    try {
      groups = await this.branchSplit.groupHunks(analysis);
    } catch (error) {
      this.error(this.providerErrorMessage(error));
      return;
    }

    for (const oversized of groups.filter((g) => g.linesAdded + g.linesDeleted > 300 && g.hunks.length > 1)) {
      this.warning(`Slice "${oversized.name}" has ${oversized.linesAdded + oversized.linesDeleted} lines (>300) — review for further splitting.`);
    }

    this.w(this.ui.panel({
      title: 'Stacked split plan',
      subtitle: `${analysis.target} ← ${groups.length} PRs (stacked on ${analysis.current})`,
      sections: [{
        lines: groups.map((g, i) =>
          `${colorize(`${i + 1}.`, 'cyan')} ${this.branchSplit.splitBranchName(analysis.current, i + 1, g.name)} ` +
          `${colorize(`(+${g.linesAdded} −${g.linesDeleted})`, 'muted')} — ${g.responsibility}`),
      }],
      ...(dryRun ? { footer: 'Dry run: nothing will be created.' } : {}),
    }));

    if (dryRun) return;

    const confirm = await smartInput.askChoice(`Create ${groups.length} stacked branches?`, [
      { key: 'y', label: 'yes', description: 'Create stacked branches and .branches/ docs' },
      { key: 'n', label: 'no', description: 'Cancel' },
    ]);
    if (confirm !== 'y') { this.warning('Cancelled'); return; }

    let created;
    try {
      created = this.branchSplit.createStackedBranches(analysis, groups, process.cwd(), { force });
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      return;
    }

    this.info('Generating PR descriptions...');
    const prDescriptions: Array<{ title: string; description: string }> = [];
    for (const entry of created) {
      try {
        const commits = [{
          hash: '', message: entry.commit, author: '', date: '',
          files: entry.files, diff: '',
        }];
        const pr = await this.prGenerator.generatePRDescription(entry.branch, commits, entry.base);
        prDescriptions.push({ title: pr.title, description: pr.description });
      } catch {
        prDescriptions.push({ title: entry.commit, description: entry.responsibility });
      }
    }

    this.branchSplit.writeArtifacts(analysis, created, prDescriptions);

    const { platform } = this.prGenerator.detectPlatform();
    if (platform === 'github') {
      const confirm = await smartInput.askChoice(`Create ${created.length} stacked PRs on GitHub now?`, [
        { key: 'y', label: 'yes', description: 'Push branches and open all PRs' },
        { key: 'n', label: 'no', description: 'Just keep the docs locally' },
      ]);
      if (confirm === 'y') {
        await this.runBranchSplitCreate();
        return;
      }
    }

    this.success(`${created.length} stacked branches created.`);
    this.w(`  ${colorize('Docs:', 'bold')} ${colorize(path.join(process.cwd(), '.branches'), 'cyan')}\r\n`);
    this.w(`  ${colorize('Open the PRs later with:', 'muted')} ${colorize('cast branch-split-create', 'cyan')}\r\n\r\n`);
  }

  private async runBranchSplitCreate(): Promise<void> {
    this.info('Pushing branches and opening pull requests...');

    let result;
    try {
      result = await this.branchSplit.createPullRequests();
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      return;
    }

    for (const entry of result.created) {
      this.w(`    ${colorize('✓', 'success')} ${entry.branch} ${colorize('→', 'muted')} ${colorize(entry.prUrl ?? '', 'cyan')}\r\n`);
    }
    for (const entry of result.failed) {
      this.w(`    ${colorize('✗', 'error')} ${entry.branch}: ${colorize(entry.error, 'muted')}\r\n`);
    }
    if (result.umbrellaUrl) {
      this.w(`    ${colorize('★', 'cyan')} ${colorize('umbrella', 'bold')} ${colorize('→', 'muted')} ${colorize(result.umbrellaUrl, 'cyan')}\r\n`);
    }
    this.w('\r\n');

    if (result.failed.length === 0) {
      try { fs.rmSync(path.join(process.cwd(), '.branches'), { recursive: true, force: true }); } catch {}
      this.success(`${result.created.length} pull request(s) created.`);
    } else {
      this.warning(`${result.failed.length} PR(s) failed. Docs kept in .branches/ — retry with: cast branch-split-create`);
    }
  }
}
