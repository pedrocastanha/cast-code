import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE } from '../../../common/constants';
import { AgentDefinition } from '../../agents/types';
import { getTemplate } from '../../mcp/catalog/mcp-templates';
import type { McpConfig } from '../../mcp/types';
import { normalizeSkillContentForCast } from '../../skills/services/skill-content-normalizer';
import type { SkillDefinition, SkillRisk, SkillScannerFinding, SkillSource, SkillTrust } from '../../skills/types';
import { PlatformMcpPayload, RemoteAgentPayload, RemoteSkillPayload } from '../types';

@Injectable()
export class RemoteDefinitionAdapterService {
  adaptSkills(skills: RemoteSkillPayload[]): SkillDefinition[] {
    return skills.map((skill) => {
      const parsed = matter(skill.content || '');
      return {
        name: String(parsed.data.name || skill.name),
        description: String(parsed.data.description || ''),
        tools: Array.isArray(parsed.data.tools) ? parsed.data.tools.map(String) : [],
        guidelines: normalizeSkillContentForCast(parsed.content),
        source: normalizeSkillSource(readMetadata<string>(skill.source, parsed.data.source, 'remote')),
        sourcePath: readOptionalString(skill.sourcePath, parsed.data.sourcePath),
        trust: readMetadata<SkillTrust>(skill.trust, parsed.data.trust),
        risk: readMetadata<SkillRisk>(skill.risk, parsed.data.risk),
        tags: readStringArray(skill.tags, parsed.data.tags),
        environments: readStringArray(skill.environments, parsed.data.environments),
        scannerFindings: readScannerFindings(skill.scannerFindings, parsed.data.scannerFindings),
        isActive: typeof skill.isActive === 'boolean' ? skill.isActive : readOptionalBoolean(parsed.data.isActive),
        updatedAt: skill.updatedAt,
      };
    });
  }

  adaptAgents(agents: RemoteAgentPayload[]): AgentDefinition[] {
    return agents.map((agent) => {
      const parsed = matter(agent.systemPrompt || '');
      return {
        name: String(parsed.data.name || agent.role),
        description: String(parsed.data.description || 'Remote platform agent'),
        model: agent.model || DEFAULT_MODEL,
        temperature: typeof parsed.data.temperature === 'number' ? parsed.data.temperature : DEFAULT_TEMPERATURE,
        skills: Array.isArray(parsed.data.skills) ? parsed.data.skills.map(String) : [],
        mcp: Array.isArray(parsed.data.mcp) ? parsed.data.mcp.map(String) : [],
        systemPrompt: parsed.content,
        source: 'remote',
        updatedAt: agent.updatedAt,
      };
    });
  }

  adaptMcpConfigs(connectors: PlatformMcpPayload[]): Record<string, McpConfig> {
    const configs: Record<string, McpConfig> = {};

    for (const connector of connectors) {
      if (!connector.serverId || connector.isEnabled === false) {
        continue;
      }
      const config = this.adaptMcpConfig(connector);
      if (config) {
        configs[connector.serverId] = config;
      }
    }

    return configs;
  }

  private adaptMcpConfig(connector: PlatformMcpPayload): McpConfig | null {
    const remoteConfig = connector.config ?? {};
    const publicConfig = isRecord(remoteConfig.publicConfig) ? remoteConfig.publicConfig : {};
    const commandRef = readOptionalString(remoteConfig.commandRef, undefined);
    const templateId = commandRef?.startsWith('builtin:')
      ? commandRef.slice('builtin:'.length)
      : connector.serverId;
    const template = getTemplate(templateId) ?? getTemplate(connector.serverId);
    const endpoint = readUnknownString(publicConfig.endpoint)
      ?? readUnknownString(publicConfig.url);
    const baseConfig = template ? cloneMcpConfig(template.config) : null;

    if (!baseConfig && !endpoint) {
      return null;
    }

    const config: McpConfig = endpoint
      ? { ...(baseConfig ?? { type: 'http' as const }), type: 'http', endpoint }
      : baseConfig!;
    const env = resolveReferencedEnv(remoteConfig.envVarNames, config.env);

    return {
      ...config,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }
}

function normalizeSkillSource(source?: string): SkillSource {
  if (source === 'builtin' || source === 'local' || source === 'remote') {
    return source;
  }
  return 'remote';
}

function readMetadata<T extends string>(primary: T | null | undefined, fallback: unknown, defaultValue?: T): T | undefined {
  if (primary) return primary;
  if (typeof fallback === 'string' && fallback.length > 0) return fallback as T;
  return defaultValue;
}

function readOptionalString(primary: string | null | undefined, fallback: unknown): string | undefined {
  if (primary) return primary;
  return typeof fallback === 'string' && fallback.length > 0 ? fallback : undefined;
}

function readStringArray(primary: string[] | null | undefined, fallback: unknown): string[] {
  if (Array.isArray(primary)) return primary.map(String);
  return Array.isArray(fallback) ? fallback.map(String) : [];
}

function readScannerFindings(
  primary: SkillScannerFinding[] | null | undefined,
  fallback: unknown,
): SkillScannerFinding[] {
  if (Array.isArray(primary)) return primary;
  return Array.isArray(fallback) ? fallback as SkillScannerFinding[] : [];
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function cloneMcpConfig(config: McpConfig): McpConfig {
  return {
    type: config.type,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.command ? { command: config.command } : {}),
    ...(config.args ? { args: [...config.args] } : {}),
    ...(config.env ? { env: { ...config.env } } : {}),
  };
}

function resolveReferencedEnv(envVarNames: string[] | undefined, baseEnv: Record<string, string> | undefined): Record<string, string> {
  const env: Record<string, string> = { ...(baseEnv ?? {}) };
  for (const envVarName of [...new Set(envVarNames ?? [])]) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(envVarName)) {
      continue;
    }
    const value = process.env[envVarName];
    if (typeof value === 'string') {
      env[envVarName] = value;
    }
  }
  return env;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readUnknownString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
