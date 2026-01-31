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
      `# Capabilities`,
      `- Read, write, and edit files`,
      `- Execute shell commands`,
      `- Search the codebase`,
      `- Delegate specialized tasks to subagents`,
      ``,
      `# Guidelines`,
      `- Always read files before editing`,
      `- Preserve existing code style and conventions`,
      `- Be concise in responses`,
      `- Use subagents for complex specialized tasks`,
    ];

    if (contextPrompt) {
      parts.push('', contextPrompt);
    }

    return parts.join('\n');
  }

  async *chat(message: string): AsyncGenerator<string> {
    this.messages.push(new HumanMessage(message));

    const stream = await this.agent.stream({
      messages: this.messages,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (chunk.agent?.messages) {
        for (const msg of chunk.agent.messages) {
          if (typeof msg.content === 'string') {
            yield msg.content;
            fullResponse += msg.content;
          }
        }
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
