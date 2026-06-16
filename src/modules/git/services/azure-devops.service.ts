import { Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedAzureConfig } from '../../config/types/config.types';
import type { BranchSplitManifest, CreatedBranch } from './branch-split.service';

export interface AzurePrInput {
  organizationUrl: string;
  project: string;
  repository: string;
  sourceBranch: string;
  targetBranch?: string;
  title: string;
  description: string;
  reviewers?: string[];
  pat: string;
}

export interface AzurePrResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface AzureRemoteInfo {
  organizationUrl?: string;
  project?: string;
  repository?: string;
}

export interface CommandRunResult {
  stdout: string;
  status: number;
  stderr?: string;
}

/** Runs a CLI command; `pat` is injected into the env, never into argv. */
export type AzureCommandRunner = (
  command: string,
  args: string[],
  opts: { cwd: string; pat?: string },
) => CommandRunResult;

const defaultRunner: AzureCommandRunner = (command, args, opts) => {
  try {
    const stdout = execFileSync(command, args, {
      cwd: opts.cwd,
      encoding: 'utf-8',
      env: opts.pat ? { ...process.env, AZURE_DEVOPS_EXT_PAT: opts.pat } : process.env,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const e = error as { status?: number; stderr?: Buffer | string; message?: string };
    return {
      stdout: '',
      status: typeof e.status === 'number' ? e.status : 1,
      stderr: (e.stderr ? e.stderr.toString() : e.message) || 'command failed',
    };
  }
};

@Injectable()
export class AzureDevopsService {
  /** Overridable for tests; defaults to a real CLI runner. */
  private run: AzureCommandRunner = defaultRunner;

  /** Swap the command runner (test seam). Returns this for chaining. */
  setRunner(runner: AzureCommandRunner): this {
    this.run = runner;
    return this;
  }

  isAzAvailable(cwd: string = process.cwd()): boolean {
    return this.run('az', ['--version'], { cwd }).status === 0;
  }

  /**
   * Parse an Azure DevOps git remote into organization URL, project and repository.
   * Supports dev.azure.com HTTPS/SSH and legacy *.visualstudio.com forms.
   */
  parseAzureRemote(remoteUrl: string): AzureRemoteInfo {
    if (!remoteUrl) return {};
    const url = remoteUrl.trim();
    const dec = (s: string): string => {
      try { return decodeURIComponent(s); } catch { return s; }
    };

    // git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
    const ssh = url.match(/ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (ssh) {
      return {
        organizationUrl: `https://dev.azure.com/${dec(ssh[1])}`,
        project: dec(ssh[2]),
        repository: dec(ssh[3]),
      };
    }

    // https://[user@]dev.azure.com/{org}/{project}/_git/{repo}
    const https = url.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/i);
    if (https) {
      return {
        organizationUrl: `https://dev.azure.com/${dec(https[1])}`,
        project: dec(https[2]),
        repository: dec(https[3]),
      };
    }

    // https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}
    const vs = url.match(/https?:\/\/([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)(?:\.git)?$/i);
    if (vs) {
      return {
        organizationUrl: `https://${dec(vs[1])}.visualstudio.com`,
        project: dec(vs[2]),
        repository: dec(vs[3]),
      };
    }

    return {};
  }

  buildCreateArgs(input: AzurePrInput): string[] {
    const args = [
      'repos', 'pr', 'create',
      '--organization', input.organizationUrl,
      '--project', input.project,
      '--repository', input.repository,
      '--source-branch', input.sourceBranch,
      '--title', input.title,
      '--description', input.description,
      '--output', 'json',
    ];
    if (input.targetBranch) {
      args.push('--target-branch', input.targetBranch);
    }
    const reviewers = (input.reviewers || []).filter((r) => r.trim().length > 0);
    if (reviewers.length > 0) {
      args.push('--required-reviewers', ...reviewers);
    }
    return args;
  }

  private webUrl(input: AzurePrInput, pullRequestId: number | string): string {
    return `${input.organizationUrl}/${encodeURIComponent(input.project)}/_git/${encodeURIComponent(
      input.repository,
    )}/pullrequest/${pullRequestId}`;
  }

  createPr(input: AzurePrInput, cwd: string = process.cwd()): AzurePrResult {
    if (!this.isAzAvailable(cwd)) {
      return { success: false, error: 'Azure CLI (az) not found. Install from https://aka.ms/azure-cli' };
    }

    const result = this.run('az', this.buildCreateArgs(input), { cwd, pat: input.pat });
    if (result.status !== 0) {
      return { success: false, error: (result.stderr || 'az repos pr create failed').trim() };
    }

    try {
      const parsed = JSON.parse(result.stdout) as { pullRequestId?: number; url?: string };
      if (parsed.pullRequestId != null) {
        return { success: true, url: this.webUrl(input, parsed.pullRequestId) };
      }
      return { success: true, url: parsed.url };
    } catch {
      return { success: true };
    }
  }

  /**
   * Open one PR per stacked branch on Azure DevOps, preserving chained bases.
   * Pushes each branch before opening its PR.
   */
  createStackedPrs(
    manifest: BranchSplitManifest,
    cfg: ResolvedAzureConfig,
    cwd: string = process.cwd(),
  ): { created: CreatedBranch[]; failed: Array<{ branch: string; error: string }> } {
    const created: CreatedBranch[] = [];
    const failed: Array<{ branch: string; error: string }> = [];
    const repository = cfg.repository;
    if (!repository) {
      return { created, failed: [{ branch: manifest.current, error: 'Azure repository is not configured' }] };
    }

    const push = (branch: string): CommandRunResult =>
      this.run('git', ['push', '-u', 'origin', branch], { cwd });

    for (const entry of manifest.branches) {
      try {
        if (entry.prUrl) { created.push(entry); continue; }
        const pushed = push(entry.branch);
        if (pushed.status !== 0) throw new Error((pushed.stderr || 'git push failed').trim());

        const bodyFile = path.join(cwd, '.branches', entry.dir, 'PR.md');
        const description = fs.existsSync(bodyFile)
          ? fs.readFileSync(bodyFile, 'utf-8')
          : entry.responsibility;

        const pr = this.createPr({
          organizationUrl: cfg.organizationUrl,
          project: cfg.project,
          repository,
          sourceBranch: entry.branch,
          targetBranch: entry.base,
          title: entry.title ?? entry.commit,
          description,
          reviewers: cfg.reviewers,
          pat: cfg.pat,
        }, cwd);

        if (!pr.success) throw new Error(pr.error || 'PR creation failed');
        entry.prUrl = pr.url;
        created.push(entry);
      } catch (error) {
        failed.push({ branch: entry.branch, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { created, failed };
  }
}
