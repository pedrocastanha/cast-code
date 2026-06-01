import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { AgentLoaderService } from '../../agents/services/agent-loader.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';
import { EnvironmentActivation, ResolvedCastEnvironmentManifest } from '../types';
import { EnvironmentLoaderService } from './environment-loader.service';
import { EnvironmentReadinessService } from './environment-readiness.service';
import { EnvironmentResolverService } from './environment-resolver.service';

const EXPECTED_ENVIRONMENTS = [
  'backend',
  'design',
  'devops',
  'engineering',
  'frontend',
  'marketing',
  'qa',
  'security',
];

const ENVIRONMENT_EXPECTATIONS: Record<string, {
  skills: string[];
  agents: string[];
  excludedSkills: string[];
}> = {
  backend: {
    skills: ['api-design', 'database-operations', 'rest-graphql-debug', 'systematic-debugging'],
    agents: ['backend', 'coder'],
    excludedSkills: ['popular-web-designs', 'docker-management', 'oss-forensics'],
  },
  design: {
    skills: ['frontend-bootstrap', 'react-patterns', 'popular-web-designs', 'claude-design', 'design-md'],
    agents: ['frontend', 'tester', 'reviewer'],
    excludedSkills: ['docker-management', 'oss-forensics'],
  },
  devops: {
    skills: ['docker-management', 'watchers', 'kanban-orchestrator', 'webhook-subscriptions'],
    agents: ['devops', 'backend', 'reviewer'],
    excludedSkills: ['popular-web-designs', 'oss-forensics'],
  },
  engineering: {
    skills: ['test-driven-development', 'systematic-debugging', 'github-code-review', 'subagent-driven-development'],
    agents: ['coder', 'reviewer', 'tester', 'architect'],
    excludedSkills: ['popular-web-designs', 'oss-forensics'],
  },
  frontend: {
    skills: ['frontend-bootstrap', 'react-patterns', 'visual-qa', 'popular-web-designs', 'page-agent'],
    agents: ['frontend', 'coder', 'tester'],
    excludedSkills: ['docker-management', 'oss-forensics'],
  },
  marketing: {
    skills: ['marketing-campaign', 'brand-voice', 'performance-analysis', 'ideation', 'youtube-content'],
    agents: ['coder', 'reviewer'],
    excludedSkills: ['rest-graphql-debug', 'docker-management', 'oss-forensics'],
  },
  qa: {
    skills: ['testing-strategies', 'test-driven-development', 'systematic-debugging', 'requesting-code-review'],
    agents: ['tester', 'reviewer', 'coder'],
    excludedSkills: ['popular-web-designs', 'docker-management', 'oss-forensics'],
  },
  security: {
    skills: ['code-review', 'github-code-review', 'oss-forensics', '1password', 'sherlock'],
    agents: ['reviewer', 'backend', 'devops'],
    excludedSkills: ['popular-web-designs', 'docker-management'],
  },
};

describe('EnvironmentResolverService built-in environment scopes', () => {
  test('activates every built-in environment with the expected agents and skills', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-env-resolver-'));
    const parser = new MarkdownParserService();
    const agentLoader = new AgentLoaderService(parser);
    const skillLoader = new SkillLoaderService(parser);
    await agentLoader.loadAgents();
    await skillLoader.loadSkills();

    let activeEnvironmentId: string | null = null;
    const loader = new EnvironmentLoaderService();
    const activation = {
      getActive: async (root: string): Promise<EnvironmentActivation | null> => {
        if (!activeEnvironmentId) {
          return null;
        }
        return {
          projectRoot: root,
          environmentId: activeEnvironmentId,
          manifestSource: 'builtin',
          activatedAt: new Date(0).toISOString(),
        };
      },
    };
    const agentRegistry = {
      setActiveEnvironmentScope: (environmentId: string, agentNames: string[]) =>
        agentLoader.setActiveEnvironmentScope(environmentId, agentNames),
      clearActiveEnvironmentScope: () => agentLoader.clearActiveEnvironmentScope(),
      getUnscopedAgentNames: () => agentLoader.getUnscopedAgentNames(),
    };
    const mcpRegistry = {
      setActiveEnvironmentScope: () => undefined,
      clearActiveEnvironmentScope: () => undefined,
      getUnscopedServerNames: () => [],
    };
    const benchmarkStore = {
      listDefinitions: async () => [],
    };
    const readiness = new EnvironmentReadinessService(
      agentRegistry as any,
      skillLoader,
      mcpRegistry as any,
      benchmarkStore as any,
    );
    const resolver = new EnvironmentResolverService(
      loader,
      activation as any,
      readiness,
      agentRegistry as any,
      skillLoader,
      mcpRegistry as any,
    );

    try {
      const environments = await loader.list(projectRoot);
      const byId = new Map(environments.map((environment) => [environment.id, environment]));
      assert.deepEqual([...byId.keys()].sort(), EXPECTED_ENVIRONMENTS);

      for (const environmentId of EXPECTED_ENVIRONMENTS) {
        const environment = byId.get(environmentId);
        assert(environment, `missing ${environmentId} environment`);
        activeEnvironmentId = environmentId;

        await resolver.applyActiveScope(projectRoot);
        assertEnvironmentScope(environment, agentLoader, skillLoader);

        const scopedSkills = new Set(skillLoader.getAllSkills().map((skill) => skill.name));
        const scopedAgents = new Set(agentLoader.getAllAgents().map((agent) => agent.name));
        const expected = ENVIRONMENT_EXPECTATIONS[environmentId];

        for (const skillName of expected.skills) {
          assert(scopedSkills.has(skillName), `${environmentId} should inject skill ${skillName}`);
        }
        for (const agentName of expected.agents) {
          assert(scopedAgents.has(agentName), `${environmentId} should expose agent ${agentName}`);
        }
        for (const skillName of expected.excludedSkills) {
          assert(!scopedSkills.has(skillName), `${environmentId} should not inject unrelated skill ${skillName}`);
        }

        const inspection = await resolver.inspect(projectRoot, environmentId);
        assert(inspection, `${environmentId} should inspect`);
        const blocked = inspection.readiness.checks.filter((check) => check.status === 'blocked');
        assert.deepEqual(blocked, [], `${environmentId} should not have blocked readiness checks`);

        const prompt = await resolver.buildActiveEnvironmentPrompt(projectRoot);
        assert.match(prompt, new RegExp(`- Id: ${environmentId}`));
        for (const skillName of [...environment.skills.required, ...environment.skills.optional]) {
          assert.match(prompt, new RegExp(`\\b${escapeRegExp(skillName)}\\b`), `${environmentId} prompt should include ${skillName}`);
        }
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('applies active environment profiles as a narrower scope', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-env-profile-'));
    const parser = new MarkdownParserService();
    const agentLoader = new AgentLoaderService(parser);
    const skillLoader = new SkillLoaderService(parser);
    await agentLoader.loadAgents();
    await skillLoader.loadSkills();

    const loader = new EnvironmentLoaderService();
    const activation = {
      getActive: async (root: string): Promise<EnvironmentActivation | null> => ({
        projectRoot: root,
        environmentId: 'engineering',
        profileId: 'bugfix',
        manifestSource: 'builtin',
        activatedAt: new Date(0).toISOString(),
      }),
    };
    const agentRegistry = {
      setActiveEnvironmentScope: (environmentId: string, agentNames: string[]) =>
        agentLoader.setActiveEnvironmentScope(environmentId, agentNames),
      clearActiveEnvironmentScope: () => agentLoader.clearActiveEnvironmentScope(),
      getUnscopedAgentNames: () => agentLoader.getUnscopedAgentNames(),
    };
    const mcpRegistry = {
      setActiveEnvironmentScope: () => undefined,
      clearActiveEnvironmentScope: () => undefined,
      getUnscopedServerNames: () => [],
    };
    const readiness = new EnvironmentReadinessService(
      agentRegistry as any,
      skillLoader,
      mcpRegistry as any,
      { listDefinitions: async () => [] } as any,
    );
    const resolver = new EnvironmentResolverService(
      loader,
      activation as any,
      readiness,
      agentRegistry as any,
      skillLoader,
      mcpRegistry as any,
    );

    try {
      const engineering = await loader.get('engineering', projectRoot);
      assert(engineering);
      assert(engineering.profiles.bugfix);

      const profiled = await resolver.applyActiveScope(projectRoot);
      assert.equal(profiled?.activeProfile, 'bugfix');

      const scopedSkills = new Set(skillLoader.getAllSkills().map((skill) => skill.name));
      assert(scopedSkills.has('test-driven-development'));
      assert(scopedSkills.has('systematic-debugging'));
      assert(!scopedSkills.has('subagent-driven-development'));

      const prompt = await resolver.buildActiveEnvironmentPrompt(projectRoot);
      assert.match(prompt, /- Profile: bugfix/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

function assertEnvironmentScope(
  environment: ResolvedCastEnvironmentManifest,
  agentLoader: AgentLoaderService,
  skillLoader: SkillLoaderService,
): void {
  const scopedAgents = new Set(agentLoader.getAllAgents().map((agent) => agent.name));
  const scopedSkills = new Set(skillLoader.getAllSkills().map((skill) => skill.name));

  for (const agentName of [environment.defaultAgent, ...environment.agents.required, ...environment.agents.optional]) {
    assert(scopedAgents.has(agentName), `${environment.id} should expose configured agent ${agentName}`);
  }

  for (const skillName of [...environment.skills.required, ...environment.skills.optional]) {
    assert(scopedSkills.has(skillName), `${environment.id} should expose configured skill ${skillName}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
