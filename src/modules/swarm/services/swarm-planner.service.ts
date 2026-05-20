import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { SkillScopeResolverService } from '../../skills/services/skill-scope-resolver.service';
import { ProjectLoaderService } from '../../project/services/project-loader.service';
import { ProjectContextService } from '../../project/services/project-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import { TraceContextService } from '../../trace/services/trace-context.service';
import type { TraceEventType } from '../../trace/types/trace.types';
import type {
  CreateSwarmPlanInput,
  SwarmFileOwnership,
  SwarmPlan,
  SwarmTaskPlan,
  SwarmVerificationStep,
  SwarmWorkerSpec,
} from '../types';
import { SwarmBridgeRuntimeService } from './swarm-bridge-runtime.service';
import { SwarmRunStoreService } from './swarm-run-store.service';
import { SwarmSuggestionService } from './swarm-suggestion.service';
import { SwarmValidationService } from './swarm-validation.service';

type WorkUnitTemplate = {
  id: string;
  title: string;
  pattern: RegExp;
  agentName?: string;
  role: string;
  ownership: SwarmFileOwnership[];
  injectedSkills: string[];
  discoverableSkills: string[];
  allowedTools: string[];
  focusedVerification?: SwarmVerificationStep[];
};

const DEFAULT_TOOLS = ['read_file', 'edit_file', 'glob', 'grep', 'ls', 'shell'];

const WORK_UNITS: WorkUnitTemplate[] = [
  {
    id: 'backend',
    title: 'Backend implementation',
    pattern: /\b(backend|api|server|database|postgres|graphql|rest)\b/i,
    agentName: 'backend',
    role: 'Backend engineer',
    ownership: [{ glob: '../backend/**' }, { glob: 'src/modules/**' }],
    injectedSkills: ['senior-backend'],
    discoverableSkills: ['systematic-debugging', 'test-driven-development'],
    allowedTools: DEFAULT_TOOLS,
    focusedVerification: [{ command: 'npm test', label: 'backend tests' }],
  },
  {
    id: 'frontend',
    title: 'Frontend / web implementation',
    pattern: /\b(frontend|web|ui|react|next\.?js|dashboard|component)\b/i,
    agentName: 'frontend',
    role: 'Frontend engineer',
    ownership: [{ glob: '../web/**' }],
    injectedSkills: ['frontend-design'],
    discoverableSkills: ['systematic-debugging', 'test-driven-development'],
    allowedTools: DEFAULT_TOOLS,
    focusedVerification: [{ command: 'npm test', label: 'web tests' }],
  },
  {
    id: 'cli',
    title: 'CLI implementation',
    pattern: /\b(cli|cast-code|command|repl|slash)\b/i,
    agentName: 'coder',
    role: 'CLI engineer',
    ownership: [{ glob: 'src/**' }],
    injectedSkills: ['senior-backend'],
    discoverableSkills: ['systematic-debugging', 'test-driven-development'],
    allowedTools: DEFAULT_TOOLS,
    focusedVerification: [{ command: 'npm test', label: 'cli tests' }],
  },
  {
    id: 'tests',
    title: 'Test coverage and verification',
    pattern: /\b(test|tests|spec|coverage|e2e|integration test)\b/i,
    agentName: 'tester',
    role: 'Test engineer',
    ownership: [{ glob: '**/*.spec.ts' }, { glob: '**/*.test.ts' }],
    injectedSkills: ['test-driven-development'],
    discoverableSkills: ['systematic-debugging'],
    allowedTools: ['read_file', 'edit_file', 'glob', 'grep', 'shell'],
    focusedVerification: [{ command: 'npm test', label: 'test suite' }],
  },
  {
    id: 'devops',
    title: 'DevOps and infrastructure',
    pattern: /\b(devops|docker|k8s|kubernetes|ci|cd|deploy|terraform)\b/i,
    agentName: 'devops',
    role: 'DevOps engineer',
    ownership: [{ glob: 'docker/**' }, { glob: '.github/**' }, { glob: 'k8s/**' }],
    injectedSkills: [],
    discoverableSkills: ['systematic-debugging'],
    allowedTools: DEFAULT_TOOLS,
  },
];

@Injectable()
export class SwarmPlannerService {
  constructor(
    private readonly store: SwarmRunStoreService,
    private readonly suggestion: SwarmSuggestionService,
    private readonly validation: SwarmValidationService,
    private readonly bridgeRuntime: SwarmBridgeRuntimeService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly skillScope: SkillScopeResolverService,
    private readonly projectLoader: ProjectLoaderService,
    private readonly projectContext: ProjectContextService,
    private readonly traceWriter: TraceWriterService,
    private readonly traceContext: TraceContextService,
  ) {}

  evaluateSuggestion(prompt: string) {
    return this.suggestion.evaluate(prompt);
  }

  async generatePlan(input: CreateSwarmPlanInput): Promise<SwarmPlan> {
    const projectRoot = path.resolve(input.projectRoot ?? process.cwd());
    const workspaceRoot = path.resolve(input.workspaceRoot ?? await this.projectLoader.detectWorkspaceRoot(projectRoot));
    const runtimePolicy = input.runtimePolicy ?? this.bridgeRuntime.resolveDefaultPolicy();
    const suggestion = this.suggestion.evaluate(input.goal);
    const matchedUnits = this.matchWorkUnits(input.goal, projectRoot, workspaceRoot);
    const tasks = matchedUnits.map((unit, index) => this.buildTask(unit, input.goal, projectRoot, index));

    const globalConstraints = this.bridgeRuntime.applyPolicyToConstraints(runtimePolicy, {
      maxWorkers: input.globalConstraints?.maxWorkers ?? (runtimePolicy.kind === 'bridge' ? runtimePolicy.maxConcurrentSessions : 4),
      maxRuntimeMsPerTask: input.globalConstraints?.maxRuntimeMsPerTask ?? 1_800_000,
      denyPaths: input.globalConstraints?.denyPaths ?? ['.env', '.env.*', '**/*.pem', '**/*secret*'],
    });

    const plan: SwarmPlan = {
      id: crypto.randomUUID(),
      projectRoot,
      workspaceRoot,
      goal: input.goal.trim(),
      reasonForSwarm: suggestion.reason,
      status: 'draft',
      integrationMode: input.integrationMode ?? 'apply_safe',
      runtimePolicy,
      globalConstraints,
      tasks,
      finalVerification: [{ command: 'npm run typecheck', label: 'workspace typecheck' }, { command: 'npm test', label: 'workspace tests' }],
      createdAt: new Date().toISOString(),
    };

    const errors = this.validation.validatePlan(plan);
    if (errors.length > 0) {
      throw new Error(`Invalid swarm plan: ${errors.join('; ')}`);
    }

    const saved = await this.store.savePlan(plan);
    this.emitTrace('swarm.plan.created', {
      planId: saved.id,
      taskCount: saved.tasks.length,
      integrationMode: saved.integrationMode,
      runtimePolicy: saved.runtimePolicy.kind,
      maxWorkers: saved.globalConstraints.maxWorkers,
    });
    return saved;
  }

  private matchWorkUnits(goal: string, projectRoot: string, workspaceRoot: string): WorkUnitTemplate[] {
    const matched = WORK_UNITS.filter((unit) => unit.pattern.test(goal));
    if (matched.length > 0) {
      return this.filterOwnershipByExistingPaths(matched, projectRoot, workspaceRoot);
    }

    return this.filterOwnershipByExistingPaths(
      [
        {
          ...WORK_UNITS[2],
          id: 'implementation',
          title: 'Primary implementation',
          pattern: /.*/,
        },
      ],
      projectRoot,
      workspaceRoot,
    );
  }

  private filterOwnershipByExistingPaths(
    units: WorkUnitTemplate[],
    projectRoot: string,
    workspaceRoot: string,
  ): WorkUnitTemplate[] {
    return units.map((unit) => ({
      ...unit,
      ownership: unit.ownership.filter((entry) => this.ownershipTargetExists(entry.glob, projectRoot, workspaceRoot)),
    })).filter((unit) => unit.ownership.length > 0);
  }

  private ownershipTargetExists(glob: string, projectRoot: string, workspaceRoot: string): boolean {
    const normalized = glob.replace(/^\.\.\//, '');
    const candidates = [
      path.join(projectRoot, normalized.split('/')[0] === '**' ? '.' : normalized),
      path.join(workspaceRoot, normalized.split('/')[0] === '**' ? '.' : normalized),
      path.join(projectRoot, normalized.replace(/\*\*/g, '').replace(/\/$/, '')),
      path.join(workspaceRoot, normalized.replace(/\*\*/g, '').replace(/\/$/, '')),
    ];

    return candidates.some((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    }) || glob.startsWith('src/') || glob.includes('**');
  }

  private buildTask(unit: WorkUnitTemplate, goal: string, projectRoot: string, index: number): SwarmTaskPlan {
    const worker = this.buildWorker(unit, goal, projectRoot);
    return {
      id: unit.id,
      title: unit.title,
      description: `${unit.title} for swarm goal: ${goal}`,
      dependsOn: index === 0 ? [] : [],
      worker,
      fileOwnership: unit.ownership,
      allowedTools: unit.allowedTools,
      injectedSkills: this.filterAllowedSkills(unit.injectedSkills, projectRoot),
      discoverableSkills: this.filterAllowedSkills(unit.discoverableSkills, projectRoot),
      acceptanceCriteria: [
        `Complete ${unit.title.toLowerCase()} within approved file ownership.`,
        'Return a structured handoff with changed files and verification results.',
      ],
      focusedVerification: unit.focusedVerification ?? [],
    };
  }

  private buildWorker(unit: WorkUnitTemplate, goal: string, projectRoot: string): SwarmWorkerSpec {
    const baseAgent = unit.agentName ? this.agentRegistry.resolveAgent(unit.agentName, this.projectContext.getContextPrompt()) : undefined;
    const promptParts = [
      `# Role\nYou are the ${unit.role} for an Agent Swarm run.`,
      `# Task scope\n${goal}`,
      baseAgent?.systemPrompt ? `# Base agent\n${baseAgent.systemPrompt}` : '',
      '# Constraints\n- Stay inside approved file ownership.\n- Use only allowed tools.\n- Do not expand scope without an expansion request.',
    ].filter(Boolean);

    return {
      id: `${unit.id}-worker`,
      kind: baseAgent ? 'existing_agent' : 'ephemeral_agent',
      baseAgentName: baseAgent?.name,
      name: baseAgent?.name ?? `${unit.id}-engineer`,
      role: unit.role,
      systemPrompt: promptParts.join('\n\n'),
      model: baseAgent?.model,
      effort: 'medium',
      handoffFormat: {
        summaryMaxChars: 1200,
        includeDecisions: true,
        includeTestsRun: true,
      },
    };
  }

  private filterAllowedSkills(skillNames: string[], projectRoot: string): string[] {
    const skills = this.skillRegistry.getAllSkills();
    return skillNames.filter((name) => {
      const record = this.skillScope.resolveSkill(name, skills, { projectRoot });
      return record?.status === 'active';
    });
  }

  private emitTrace(type: TraceEventType, payload: Record<string, unknown>): void {
    try {
      const context = this.traceContext.getCurrent();
      this.traceWriter.append({
        eventId: crypto.randomUUID(),
        sessionId: context.sessionId,
        runId: context.rootRunId,
        type,
        payload,
      });
    } catch {
      // trace is best-effort during planning
    }
  }
}
