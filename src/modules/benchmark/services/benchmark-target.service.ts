import { Injectable, Optional } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MultiLlmService } from '../../../common/services/multi-llm.service';
import {
  BenchmarkAgentExecutor,
  BenchmarkTargetType,
  TargetExecutionInput,
  TargetExecutionResult,
} from '../types';

const DISABLED_TARGET_MESSAGES: Partial<Record<BenchmarkTargetType, string>> = {
  rag_answer: 'Target type rag_answer requires the RAG benchmark adapter from the platform/memory integration phase.',
  mcp_tool: 'Target type mcp_tool requires the MCP benchmark adapter from the connector phase.',
  environment_task: 'Target type environment_task requires the environment benchmark adapter from the domain-pack phase.',
  scheduler_job: 'Target type scheduler_job requires the scheduler benchmark adapter from the automation phase.',
};

@Injectable()
export class BenchmarkTargetService {
  private agentExecutor?: BenchmarkAgentExecutor;

  constructor(
    @Optional()
    private readonly multiLlmService?: MultiLlmService,
  ) {}

  setAgentExecutor(executor: BenchmarkAgentExecutor): void {
    this.agentExecutor = executor;
  }

  async execute(input: TargetExecutionInput): Promise<TargetExecutionResult> {
    switch (input.target.type) {
    case 'model_prompt':
      return this.executeModelPrompt(input);
    case 'api_endpoint':
      return this.executeApiEndpoint(input);
    case 'agent_workflow':
      return this.executeAgentWorkflow(input);
    case 'rag_answer':
    case 'mcp_tool':
    case 'environment_task':
    case 'scheduler_job':
      throw new Error(DISABLED_TARGET_MESSAGES[input.target.type]);
    default:
      throw new Error(`Unsupported benchmark target type: ${(input.target as any).type}`);
    }
  }

  private async executeModelPrompt(input: TargetExecutionInput): Promise<TargetExecutionResult> {
    const staticOutput = input.target.config.staticOutput;
    if (typeof staticOutput === 'string') {
      return {
        output: this.renderTemplate(staticOutput, input.benchmarkCase.input),
        tokens: this.estimateTokens(String(input.benchmarkCase.input) + staticOutput),
        cost: 0,
      };
    }

    if (!this.multiLlmService) {
      throw new Error('Target type model_prompt requires a configured model provider.');
    }

    const prompt = this.renderTemplate(
      String(input.target.config.prompt ?? '{{input}}'),
      input.benchmarkCase.input,
    );
    const systemPrompt = typeof input.target.config.systemPrompt === 'string'
      ? input.target.config.systemPrompt
      : undefined;

    const model = this.multiLlmService.createModel('default', false);
    const messages = systemPrompt
      ? [new SystemMessage(systemPrompt), new HumanMessage(prompt)]
      : [new HumanMessage(prompt)];
    const response = await model.invoke(messages);
    const output = this.extractText((response as any)?.content ?? response);
    const usage = this.extractUsage(response);

    return {
      output,
      tokens: usage.input + usage.output || this.estimateTokens(prompt + output),
      cost: 0,
      model: (model as any).modelName || (model as any).model,
    };
  }

  private async executeApiEndpoint(input: TargetExecutionInput): Promise<TargetExecutionResult> {
    const url = String(input.target.config.url ?? '');
    if (!url) {
      throw new Error('Target type api_endpoint requires config.url.');
    }

    const method = String(input.target.config.method ?? 'POST').toUpperCase();
    const timeoutMs = Number(input.target.config.timeoutMs ?? 30_000);
    const bodyTemplate = input.target.config.body ?? { input: '{{input}}' };
    const headers = {
      'content-type': 'application/json',
      ...(typeof input.target.config.headers === 'object' && input.target.config.headers
        ? input.target.config.headers as Record<string, string>
        : {}),
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'GET' ? undefined : JSON.stringify(this.renderTemplateDeep(bodyTemplate, input.benchmarkCase.input)),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`api_endpoint returned HTTP ${response.status}: ${text.slice(0, 500)}`);
      }
      return {
        output: text,
        tokens: this.estimateTokens(text),
        cost: 0,
        metadata: { status: response.status },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeAgentWorkflow(input: TargetExecutionInput): Promise<TargetExecutionResult> {
    if (!this.agentExecutor) {
      throw new Error('Target type agent_workflow requires the active DeepAgent benchmark executor.');
    }

    const prompt = this.renderTemplate(String(input.target.config.prompt ?? '{{input}}'), input.benchmarkCase.input);
    return this.agentExecutor.runBenchmarkPrompt(prompt);
  }

  private renderTemplate(template: string, value: string): string {
    return template.replace(/\{\{\s*input\s*\}\}/g, value);
  }

  private renderTemplateDeep(value: unknown, input: string): unknown {
    if (typeof value === 'string') {
      return this.renderTemplate(value, input);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.renderTemplateDeep(item, input));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, this.renderTemplateDeep(nested, input)]),
      );
    }
    return value;
  }

  private extractText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((part: any) => typeof part === 'string' ? part : part?.text ?? JSON.stringify(part)).join('');
    }
    return value === undefined || value === null ? '' : String(value);
  }

  private extractUsage(output: any): { input: number; output: number } {
    const usage = output?.usage_metadata
      || output?.usageMetadata
      || output?.response_metadata?.usage
      || output?.additional_kwargs?.usage;
    return {
      input: usage?.input_tokens || usage?.prompt_tokens || usage?.inputTokens || 0,
      output: usage?.output_tokens || usage?.completion_tokens || usage?.outputTokens || 0,
    };
  }

  private estimateTokens(text: string): number {
    return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
  }
}
