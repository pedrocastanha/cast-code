import { z } from 'zod';

export type CastEnvironmentSource = 'builtin' | 'project';
export type CastEnvironmentPermissionMode = 'read-only' | 'balanced' | 'custom';
export type EnvironmentReadinessStatus = 'ready' | 'warning' | 'blocked';
export type EnvironmentReadinessCheckKind = 'agent' | 'skill' | 'mcp' | 'rag' | 'benchmark';

const stringArraySchema = z.array(z.string().trim().min(1)).default([]);

export const castEnvironmentIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Environment id must be lowercase kebab-case.');

export const castEnvironmentManifestSchema = z.object({
  version: z.literal(1),
  source: z.enum(['builtin', 'project']).optional(),
  id: castEnvironmentIdSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  defaultAgent: z.string().trim().min(1),
  agents: z.object({
    required: stringArraySchema,
    optional: stringArraySchema,
  }).default({ required: [], optional: [] }),
  skills: z.object({
    required: stringArraySchema,
    optional: stringArraySchema,
  }).default({ required: [], optional: [] }),
  mcp: z.object({
    recommended: stringArraySchema,
    required: stringArraySchema.optional().default([]),
  }).default({ recommended: [], required: [] }),
  permissions: z.object({
    defaultMode: z.enum(['read-only', 'balanced', 'custom']).default('balanced'),
    requireApproval: stringArraySchema,
  }).default({ defaultMode: 'balanced', requireApproval: [] }),
  rag: z.object({
    recommendedSources: stringArraySchema,
  }).default({ recommendedSources: [] }),
  benchmarks: z.object({
    smoke: stringArraySchema,
  }).default({ smoke: [] }),
  schedules: z.object({
    suggested: stringArraySchema,
  }).default({ suggested: [] }),
});

export type CastEnvironmentManifest = z.infer<typeof castEnvironmentManifestSchema>;

export interface ResolvedCastEnvironmentManifest extends CastEnvironmentManifest {
  source: CastEnvironmentSource;
  filePath?: string;
}

export interface EnvironmentActivation {
  projectRoot: string;
  environmentId: string;
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
