import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface CastTool<TInput = unknown> {
  name: string;
  description: string;
  schema: ZodSchema<TInput>;
  execute(input: unknown): Promise<string>;
  invoke(input: unknown): Promise<string>;
}

export interface CastToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function castTool<TInput>(
  fn: (input: TInput) => Promise<string>,
  config: { name: string; description: string; schema: ZodSchema<TInput> },
): CastTool<TInput> {
  const execute = async (input: unknown) => fn(config.schema.parse(input) as TInput);
  return {
    ...config,
    execute,
    invoke: execute,
  };
}

export function toolToDefinition(tool: CastTool): CastToolDefinition {
  const convertSchema = zodToJsonSchema as unknown as (
    schema: ZodSchema,
    options: { target: 'openApi3' },
  ) => Record<string, unknown>;

  return {
    name: tool.name,
    description: tool.description,
    parameters: convertSchema(tool.schema, { target: 'openApi3' }),
  };
}
