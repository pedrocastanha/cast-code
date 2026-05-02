declare module '@langchain/core/tools' {
  export interface StructuredTool {
    name: string;
    description: string;
    invoke(input: unknown): Promise<unknown>;
    [key: string]: unknown;
  }

  export function tool(
    handler: (input: any) => unknown | Promise<unknown>,
    fields: {
      name: string;
      description: string;
      schema?: unknown;
      [key: string]: unknown;
    },
  ): StructuredTool;
}
