import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { createDeepAgent } from 'deepagents';
import { ConfigService } from './config.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { ProjectLoaderService } from '../../project/services/project-loader.service';
import { ProjectContextService } from '../../project/services/project-context.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { ProjectInitResult } from '../../project/types';

@Injectable()
export class DeepAgentService implements OnModuleInit {
  private agent: any;
  private messages: BaseMessage[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly projectLoader: ProjectLoaderService,
    private readonly projectContext: ProjectContextService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async onModuleInit() {
    await this.configService.loadGlobalConfig();
  }

  async initialize(): Promise<ProjectInitResult> {
    const projectPath = await this.projectLoader.detectProject();

    if (projectPath) {
      const projectConfig = await this.projectLoader.loadProject(projectPath);

      if (projectConfig.context) {
        this.projectContext.setContext(projectConfig.context);
      }

      if (projectConfig.mcpConfigs) {
        this.mcpRegistry.loadConfigs(projectConfig.mcpConfigs);
        await this.mcpRegistry.connectAll();
      }

      const agentsOverridePath = this.projectLoader.getAgentsOverridePath(projectPath);
      await this.agentRegistry.loadProjectAgents(agentsOverridePath);

      const skillsOverridePath = this.projectLoader.getSkillsOverridePath(projectPath);
      await this.skillRegistry.loadProjectSkills(skillsOverridePath);
    }

    const model = new ChatOpenAI({
      modelName: this.configService.getModel(),
      temperature: this.configService.getTemperature(),
      openAIApiKey: this.configService.getApiKey(),
      streaming: true,
    });

    const contextPrompt = this.projectContext.getContextPrompt();
    const subagents = this.agentRegistry.getSubagentDefinitions(contextPrompt);
    const tools = this.toolsRegistry.getAllTools();
    const mcpTools = this.mcpRegistry.getAllMcpTools();
    const systemPrompt = this.buildSystemPrompt(contextPrompt);

    this.agent = createDeepAgent({
      model,
      systemPrompt,
      tools: [...tools, ...mcpTools],
      subagents,
    });

    return {
      projectPath,
      hasContext: this.projectContext.hasContext(),
      agentCount: subagents.length,
      toolCount: tools.length + mcpTools.length,
    };
  }

  private buildSystemPrompt(contextPrompt: string): string {
    const parts = [
      `You are Cast, an AI coding assistant.`,
      `You help developers with software engineering tasks.`,
      ``,
      `# Available Tools`,
      `- read_file: Read file contents`,
      `- write_file: Write content to a file`,
      `- edit_file: Edit files by replacing strings`,
      `- glob: Find files matching patterns`,
      `- grep: Search for patterns in files`,
      `- ls: List directory contents`,
      `- shell: Execute shell commands`,
      ``,
      `# Guidelines`,
      `- ALWAYS use the available tools to complete tasks`,
      `- Use 'ls' or 'glob' to check if files exist before operations`,
      `- Use 'read_file' before editing files`,
      `- Use 'shell' for file operations like deleting files (rm command)`,
      `- Be proactive in using tools to gather information`,
      `- Preserve existing code style and conventions`,
      `- Be concise in responses`,
      ``,
      `# Working Directory`,
      `Current directory: ${process.cwd()}`,
    ];

    if (contextPrompt) {
      parts.push('', contextPrompt);
    }

    return parts.join('\n');
  }

  async *chat(message: string): AsyncGenerator<string> {
    this.messages.push(new HumanMessage(message));

    const stream = this.agent.streamEvents(
      {
        messages: this.messages,
      },
      {
        version: 'v2',
      }
    );

    let fullResponse = '';

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
        const content = event.data.chunk.content;
        if (typeof content === 'string' && content) {
          yield content;
          fullResponse += content;
        }
      }

      if (event.event === 'on_tool_start') {
        const toolName = event.name;
        yield `\n[Usando ferramenta: ${toolName}]\n`;
      }

      if (event.event === 'on_tool_end') {
        const output = event.data?.output;
        if (output && typeof output === 'string') {
          yield `\n[Resultado: ${output.substring(0, 200)}${output.length > 200 ? '...' : ''}]\n`;
        }
      }

      if (event.event === 'on_tool_error') {
        const error = event.data?.error;
        yield `\n[Erro na ferramenta: ${error?.message || 'Erro desconhecido'}]\n`;
      }
    }

    if (fullResponse) {
      this.messages.push(new AIMessage(fullResponse));
    }
  }

  clearHistory() {
    this.messages = [];
  }

  getHistory(): BaseMessage[] {
    return this.messages;
  }
}
