import { z } from 'zod';

export type CastEnvironmentSource = 'builtin' | 'project';
export type CastEnvironmentPermissionMode = 'read-only' | 'balanced' | 'custom';
export type EnvironmentReadinessStatus = 'ready' | 'warning' | 'blocked';
export type EnvironmentReadinessCheckKind = 'agent' | 'skill' | 'mcp' | 'rag' | 'benchmark';

const stringArraySchema = z.array(z.string().trim().min(1)).default([]);
const environmentMemberSchema = z.object({
  required: stringArraySchema,
  optional: stringArraySchema,
}).default({ required: [], optional: [] });
const environmentMcpSchema = z.object({
  recommended: stringArraySchema,
  required: stringArraySchema.optional().default([]),
}).default({ recommended: [], required: [] });
const environmentPermissionsSchema = z.object({
  defaultMode: z.enum(['read-only', 'balanced', 'custom']).default('balanced'),
  requireApproval: stringArraySchema,
}).default({ defaultMode: 'balanced', requireApproval: [] });
const environmentRagSchema = z.object({
  recommendedSources: stringArraySchema,
}).default({ recommendedSources: [] });
const environmentBenchmarksSchema = z.object({
  smoke: stringArraySchema,
}).default({ smoke: [] });
const environmentSchedulesSchema = z.object({
  suggested: stringArraySchema,
}).default({ suggested: [] });

export const castEnvironmentIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Environment id must be lowercase kebab-case.');

export const castEnvironmentProfileIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Profile id must be lowercase kebab-case.');

export const castEnvironmentProfileSchema = z.object({
  description: z.string().trim().default(''),
  defaultAgent: z.string().trim().min(1).optional(),
  agents: environmentMemberSchema.optional(),
  skills: environmentMemberSchema.optional(),
  mcp: environmentMcpSchema.optional(),
  permissions: environmentPermissionsSchema.optional(),
  rag: environmentRagSchema.optional(),
  benchmarks: environmentBenchmarksSchema.optional(),
  schedules: environmentSchedulesSchema.optional(),
});

export const castEnvironmentManifestSchema = z.object({
  version: z.literal(1),
  source: z.enum(['builtin', 'project']).optional(),
  id: castEnvironmentIdSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  defaultAgent: z.string().trim().min(1),
  agents: environmentMemberSchema,
  skills: environmentMemberSchema,
  profiles: z.record(castEnvironmentProfileIdSchema, castEnvironmentProfileSchema).default({}),
  mcp: environmentMcpSchema,
  permissions: environmentPermissionsSchema,
  rag: environmentRagSchema,
  benchmarks: environmentBenchmarksSchema,
  schedules: environmentSchedulesSchema,
});

export type CastEnvironmentManifest = z.infer<typeof castEnvironmentManifestSchema>;
export type CastEnvironmentProfile = z.infer<typeof castEnvironmentProfileSchema>;

export interface ResolvedCastEnvironmentManifest extends CastEnvironmentManifest {
  source: CastEnvironmentSource;
  filePath?: string;
  activeProfile?: string;
}

export interface EnvironmentActivation {
  projectRoot: string;
  environmentId: string;
  profileId?: string;
  manifestSource: CastEnvironmentSource;
  activatedAt: string;
  manifest?: ResolvedCastEnvironmentManifest;
}

export interface EnvironmentReadinessCheck {
  kind: EnvironmentReadinessCheckKind;
  id: string;
  status: EnvironmentReadinessStatus;
  message: string;
}

export interface EnvironmentReadinessReport {
  environmentId: string;
  status: EnvironmentReadinessStatus;
  checks: EnvironmentReadinessCheck[];
}
