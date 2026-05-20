import { Injectable } from '@nestjs/common';
import { Colors, colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import { ConfigService } from '../../../../common/services/config.service';
import { ConfigManagerService } from '../../../config/services/config-manager.service';
import { DeepAgentService } from '../../../core/services/deep-agent.service';
import { McpRegistryService } from '../../../mcp/services/mcp-registry.service';
import { AgentLoaderService } from '../../../agents/services/agent-loader.service';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service';
import { ProjectContextService } from '../../../project/services/project-context.service';
import { MemoryService } from '../../../memory/services/memory.service';
import {
  getModelChoicesForPurpose,
  EFFORT_PROFILES,
  EffortLevel,
  getProviderEndpointLabel,
  getEffortProfile,
  getRecommendedModel,
  isRecommendedModelForPurpose,
  MODEL_PURPOSES,
  ModelPurpose,
  normalizeEffortLevel,
  ProviderType,
  PROVIDER_METADATA,
  providerAllowsOptionalApiKey,
  providerRequiresBaseUrl,
} from '../../../config/types/config.types';
import { getModelContextUsage } from '../../../config/utils/model-context';
import { ISmartInput } from '../smart-input';
import { formatBridgeProviderList } from '../../../bridge/providers/claude-bridge-adapter';

@Injectable()
export class ReplCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly deepAgent: DeepAgentService,
    private readonly configService: ConfigService,
    private readonly configManager: ConfigManagerService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly agentLoader: AgentLoaderService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly projectContext: ProjectContextService,
    private readonly memoryService: MemoryService,
  ) {}

  printHelp(): void {
    const commandSection = (title: string, rows: Array<[string, string]>) => ({
      title,
      lines: rows.map(([name, desc]) => `${colorize(name.padEnd(18), 'cyan')} ${colorize(desc, 'muted')}`),
    });

    process.stdout.write(this.ui.panel({
      title: 'cast code',
      subtitle: 'command reference',
      sections: [
        commandSection('General', [
          ['/help', 'show this reference'],
          ['/clear', 'clear conversation history'],
          ['/compact', 'summarize and compress history'],
          ['/context', 'show session info'],
          ['/effort', 'change runtime budget and quality'],
          ['/exit', 'quit'],
        ]),
        commandSection('Git and Code', [
          ['/status', 'git status'],
          ['/diff [ref]', 'git diff'],
          ['/log', 'recent commits'],
          ['/up', 'smart commit and push'],
          ['/split-up', 'split into multiple commits'],
          ['/pr', 'create PR with AI description'],
          ['/unit-test', 'generate tests for branch changes'],
          ['/review [files]', 'code review'],
          ['/fix <file>', 'auto-fix code issues'],
          ['/ident', 'format all code files'],
          ['/release [tag]', 'generate release notes'],
        ]),
        commandSection('Agents, Project, Config', [
          ['/agents', 'list loaded agents'],
          ['/skills', 'list loaded skills'],
          ['/init', 'analyze project and generate context'],
          ['/project', 'project context commands'],
          ['/project-deep', 'deep analysis and agent brief'],
          ['/env', 'domain environment packs'],
          ['/model', 'show or change models'],
          ['/config', 'show/edit configuration'],
          ['/platform', 'configure Cast Platform'],
        ]),
        commandSection('Tools and History', [
          ['/tools', 'list available tools'],
          ['/mcp', 'MCP servers and tools'],
          ['/kanban', 'open task board'],
          ['/remote', 'start remote web interface'],
          ['/bridge <provider>', 'run Cast through a logged-in provider CLI'],
          ['/bridge status', 'show provider bridge status'],
          ['/bridge stop', 'return prompts to normal Cast runtime'],
          ['/benchmark', 'local benchmark lab'],
          ['/rollback [file]', 'restore file from snapshot'],
          ['/stats', 'show token and cost stats'],
          ['/replay', 'save/view session replays'],
          ['/vault', 'manage code snippet vault'],
        ]),
        commandSection('Mentions and Keys', [
          ['@file.ts', 'inject file content'],
          ['@dir/', 'inject directory listing'],
          ['@git:diff', 'inject git diff'],
          ['Tab', 'accept autocomplete suggestion'],
          ['↑ / ↓', 'navigate suggestions, history, and menus'],
          ['Ctrl+C', 'cancel current operation'],
        ]),
      ],
      footer: `Bridge providers: ${formatBridgeProviderList().replace(/\|/g, ', ')}. Use /effort for runtime budget.`,
    }));
  }

  cmdClear(welcomeScreen: { printBanner: () => void }): void {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1bc');
    welcomeScreen.printBanner();
    process.stdout.write(this.ui.success('Conversation cleared'));
  }

  cmdContext(): void {
    const mcpSummaries = this.mcpRegistry.getServerSummaries();
    const mcpConnected = mcpSummaries.filter(s => s.status === 'connected').length;
    const mcpTotal = mcpSummaries.length;
    const mcpTools = mcpSummaries.reduce((sum, s) => sum + s.toolCount, 0);

    const mcpStatus = mcpConnected > 0
      ? colorize(`${mcpConnected}/${mcpTotal}`, 'success')
      : colorize(`${mcpConnected}/${mcpTotal}`, 'muted');
    const mcpToolsStr = mcpTools > 0 ? colorize(` (${mcpTools} tools)`, 'muted') : '';
    const mcpLines = mcpSummaries.length > 0
      ? mcpSummaries.map((s) => {
        const icon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'muted');
        return `${icon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.toolCount} tools)`, 'muted')}`;
      })
      : [colorize('No MCP servers configured.', 'muted')];

    const agents = this.agentLoader.getAllAgents();
    const skills = this.skillRegistry.getAllSkills();
    const previewNames = (names: string[]) => {
      if (names.length === 0) return colorize('none', 'muted');
      return colorize(names.slice(0, 5).join(', ') + (names.length > 5 ? ` +${names.length - 5}` : ''), 'muted');
    };

    const hasContext = this.projectContext.hasContext();
    const memOk = this.memoryService.isInitialized();
    const modelConfig = this.getActiveModelConfig();
    const tokenCount = this.deepAgent.getTokenCount();
    const contextUsage = getModelContextUsage(modelConfig.provider, modelConfig.model, tokenCount);

    process.stdout.write(this.ui.panel({
      title: 'Session',
      subtitle: 'runtime context',
      sections: [
        {
          title: 'Conversation',
          rows: [
            { label: 'Messages', value: this.deepAgent.getMessageCount().toString() },
            { label: 'Tokens', value: colorize(tokenCount.toLocaleString(), 'cyan') },
            {
              label: 'Context',
              value: contextUsage
                ? colorize(`${contextUsage.remainingPercentLabel} livre`, 'cyan')
                : colorize('unknown', 'muted'),
              hint: contextUsage
                ? `${tokenCount.toLocaleString()} usados de ${contextUsage.windowLabel}`
                : 'janela nao mapeada',
            },
            { label: 'CWD', value: colorize(process.cwd(), 'accent') },
            { label: 'Model', value: colorize(`${modelConfig.provider}/${modelConfig.model}`, 'cyan') },
          ],
        },
        {
          title: 'MCP',
          rows: [{ label: 'Servers', value: `${mcpStatus}${mcpToolsStr}` }],
          lines: mcpLines,
        },
        {
          title: 'Extensions',
          rows: [
            { label: 'Agents', value: colorize(agents.length.toString(), 'cyan'), hint: previewNames(agents.map((agent) => agent.name)) },
            { label: 'Skills', value: colorize(skills.length.toString(), 'cyan'), hint: previewNames(skills.map((skill) => skill.name)) },
            { label: 'Project', value: hasContext ? colorize('loaded', 'success') : colorize('not loaded - run /init', 'muted') },
            { label: 'Memory', value: memOk ? colorize('enabled', 'success') : colorize('not configured', 'muted') },
          ],
        },
      ],
    }));
  }

  private getActiveModelDisplayName(): string {
    const modelConfig = this.getActiveModelConfig();
    return `${modelConfig.provider}/${modelConfig.model}`;
  }

  private getActiveModelConfig(): { provider: ProviderType; model: string } {
    const modelConfig = this.configManager.getModelConfig('default');
    if (modelConfig?.provider && modelConfig?.model) {
      return {
        provider: modelConfig.provider,
        model: modelConfig.model,
      };
    }

    return {
      provider: this.configService.getProvider() as ProviderType,
      model: this.configService.getModel(),
    };
  }

  async cmdEffort(args: string[], smartInput?: ISmartInput): Promise<boolean> {
    await this.configManager.loadConfig();
    const requested = args[0]?.toLowerCase();

    if (requested === 'show' || requested === 'list') {
      this.printEffortSummary();
      return false;
    }

    const direct = normalizeEffortLevel(requested);
    if (direct) {
      await this.configManager.setEffort(direct);
      this.printEffortSummary(direct);
      return true;
    }

    this.printEffortSummary();

    if (!smartInput) {
      return false;
    }

    const selected = await smartInput.askChoice('Effort level', Object.values(EFFORT_PROFILES).map((profile) => ({
      key: profile.level,
      label: profile.label,
      description: `${profile.maxToolCalls} tools · ${profile.maxOutputTokens.toLocaleString()} tokens`,
    })));

    const level = normalizeEffortLevel(selected);
    if (!level) {
      return false;
    }

    await this.configManager.setEffort(level);
    this.printEffortSummary(level);
    return true;
  }

  private printEffortSummary(selected?: EffortLevel): void {
    const current = selected || this.configManager.getEffort();
    const profile = getEffortProfile(current);
    process.stdout.write(this.ui.panel({
      title: 'Effort',
      subtitle: 'runtime budget',
      sections: [
        {
          title: 'Current',
          rows: [
            { label: 'Mode', value: colorize(profile.label, 'cyan'), hint: profile.description },
            { label: 'Tools', value: `${profile.maxToolCalls}` },
            { label: 'Output', value: `${profile.maxOutputTokens.toLocaleString()} tokens` },
            { label: 'Planning', value: profile.planning },
            { label: 'Review', value: profile.review ? 'enabled' : 'manual' },
          ],
        },
      ],
      footer: 'Run /effort and use ↑/↓ + Enter, or /effort fast|balanced|deep|max.',
    }));
  }

  async cmdModel(args: string[], smartInput?: ISmartInput): Promise<boolean> {
    await this.configManager.loadConfig();

    const subcommand = args[0]?.toLowerCase();

    if (!smartInput || subcommand === 'show' || subcommand === 'list') {
      this.printModelSummary();
      return false;
    }

    if (subcommand && MODEL_PURPOSES.some((purpose) => purpose.value === subcommand)) {
      return this.changeModelForPurpose(subcommand as ModelPurpose, smartInput);
    }

    this.printModelSummary();

    const action = await smartInput.askChoice('Model actions', [
      { key: 'default', label: 'Change default model', description: 'Primary conversation model' },
      { key: 'purpose', label: 'Change purpose-specific model', description: 'Coder, reviewer, planner, etc.' },
      { key: 'show', label: 'Keep current setup', description: 'Exit without changes' },
    ]);

    if (action === 'default') {
      return this.changeModelForPurpose('default', smartInput);
    }

    if (action === 'purpose') {
      const purpose = await smartInput.askChoice(
        'Which purpose do you want to change?',
        MODEL_PURPOSES.map((entry) => ({
          key: entry.value,
          label: entry.label,
          description: entry.description,
        })),
      );

      return this.changeModelForPurpose(purpose as ModelPurpose, smartInput);
    }

    return false;
  }

  private printModelSummary(): void {
    const config = this.configManager.getConfig();
    const lines: string[] = [];

    for (const purpose of MODEL_PURPOSES) {
      const modelConfig = config.models[purpose.value];
      if (!modelConfig) {
        continue;
      }

      const endpointLabel = getProviderEndpointLabel(modelConfig.provider);
      const recommended = isRecommendedModelForPurpose(
        modelConfig.provider,
        purpose.value,
        modelConfig.model,
      )
        ? colorize('recommended', 'success')
        : colorize('custom', 'warning');

      lines.push(`${colorize(purpose.label.padEnd(12), 'muted')} ${colorize(`${modelConfig.provider}/${modelConfig.model}`, 'cyan')} ${colorize(endpointLabel, 'subtle')} ${recommended}`);
    }

    process.stdout.write(this.ui.panel({
      title: 'Models',
      subtitle: 'routing',
      sections: [{ lines }],
      footer: 'Run /model to change quickly, or /model reviewer for one purpose.',
    }));
  }

  private async changeModelForPurpose(
    purpose: ModelPurpose,
    smartInput: ISmartInput,
  ): Promise<boolean> {
    const providerCatalog = Object.keys(PROVIDER_METADATA) as ProviderType[];

    const currentConfig = this.configManager.getModelConfig(purpose);
    const currentProvider = currentConfig?.provider ?? this.configService.getProvider();
    const currentModel = currentConfig?.model ?? this.configService.getModel();

    const provider = await smartInput.askChoice(
      `Provider for ${purpose}:`,
      providerCatalog.map((providerKey) => ({
        key: providerKey,
        label: PROVIDER_METADATA[providerKey].name,
        description: [
          getProviderEndpointLabel(providerKey),
          getRecommendedModel(providerKey, purpose)
            ? `rec ${getRecommendedModel(providerKey, purpose)}`
            : '',
          this.configManager.isProviderConfigured(providerKey) ? 'configured' : 'needs setup',
          providerKey === currentProvider ? 'current provider' : '',
        ].filter(Boolean).join(' · '),
      })),
    ) as ProviderType;

    const providerReady = await this.ensureProviderConfigured(provider, smartInput);
    if (!providerReady) {
      process.stdout.write(this.ui.warning('Provider setup cancelled. Model unchanged.'));
      return false;
    }

    const recommendedModel = getRecommendedModel(provider, purpose);
    const modelChoices = getModelChoicesForPurpose(provider, purpose);

    const selectedModel = await smartInput.askChoice(
      `Model for ${purpose}:`,
      [
        ...modelChoices.map((choice) => ({
          key: choice.value,
          label: choice.label,
          description: [
            choice.value === currentModel && provider === currentProvider ? 'current' : '',
            recommendedModel === choice.value ? 'best fit for this provider' : '',
          ].filter(Boolean).join(' · '),
        })),
        { key: '__custom__', label: 'Custom model', description: 'Type any model id manually' },
      ],
    );

    let model = selectedModel;
    if (selectedModel === '__custom__') {
      const typed = await smartInput.question(
        `${Colors.yellow}Model name${recommendedModel ? ` (empty = ${recommendedModel})` : ''}:${Colors.reset}`,
      );
      model = typed.trim() || recommendedModel || currentModel;
    }

    await this.configManager.setModel(purpose, {
      provider,
      model,
    });

    process.stdout.write(this.ui.success(`${purpose} -> ${provider}/${model}`));
    return true;
  }

  private async ensureProviderConfigured(
    provider: ProviderType,
    smartInput: ISmartInput,
  ): Promise<boolean> {
    if (this.configManager.isProviderConfigured(provider)) {
      return true;
    }

    const meta = PROVIDER_METADATA[provider];
    process.stdout.write(this.ui.warning(`Configuring ${meta.name} inline`));

    if (meta.setupHints?.length) {
      for (const hint of meta.setupHints) {
        process.stdout.write(`  ${colorize(`→ ${hint}`, 'muted')}\r\n`);
      }
    }

    if (meta.exampleBaseUrls?.length) {
      process.stdout.write(
        `  ${colorize(`→ Examples: ${meta.exampleBaseUrls.join('  |  ')}`, 'muted')}\r\n`,
      );
    }

    if (providerRequiresBaseUrl(provider)) {
      const defaultBaseUrl = meta.defaultBaseUrl || '';
      const baseUrl = await this.askRequiredValue(
        smartInput,
        `Base URL${defaultBaseUrl ? ` (empty = ${defaultBaseUrl})` : ''}:`,
        defaultBaseUrl,
      );
      if (baseUrl === null) {
        return false;
      }

      let apiKey: string | undefined;
      if (providerAllowsOptionalApiKey(provider)) {
        const maybeApiKey = await smartInput.question(
          `${Colors.yellow}API key (optional):${Colors.reset} `,
        );
        apiKey = maybeApiKey.trim() || undefined;
      }

      await this.configManager.addProvider(provider, { baseUrl, apiKey });
      process.stdout.write(this.ui.success(`${meta.name} configured`));
      return true;
    }

    process.stdout.write(
      `  ${colorize(`→ Get your API key at ${meta.websiteUrl}`, 'muted')}\r\n`,
    );
    const apiKey = await this.askRequiredValue(
      smartInput,
      'API key:',
    );
    if (apiKey === null) {
      return false;
    }

    const wantsCustomUrl = await smartInput.askChoice('Custom API URL?', [
      { key: 'default', label: 'Use default URL', description: meta.defaultBaseUrl || 'provider default' },
      { key: 'custom', label: 'Set custom URL', description: 'Proxy, gateway, alternate endpoint' },
    ]);

    let baseUrl: string | undefined;
    if (wantsCustomUrl === 'custom') {
      const customBaseUrl = await this.askRequiredValue(
        smartInput,
        `API URL${meta.defaultBaseUrl ? ` (empty = ${meta.defaultBaseUrl})` : ''}:`,
        meta.defaultBaseUrl,
      );
      if (customBaseUrl === null) {
        return false;
      }
      baseUrl = customBaseUrl;
    }

    await this.configManager.addProvider(provider, { apiKey, baseUrl });
    process.stdout.write(this.ui.success(`${meta.name} configured`));
    return true;
  }

  private async askRequiredValue(
    smartInput: ISmartInput,
    label: string,
    fallback?: string,
  ): Promise<string | null> {
    while (true) {
      const raw = await smartInput.question(`${Colors.yellow}${label}${Colors.reset} `);
      const value = raw.trim() || fallback || '';

      if (value) {
        return value;
      }

      const action = await smartInput.askChoice('Value required', [
        { key: 'retry', label: 'Try again', description: 'Enter a value' },
        { key: 'cancel', label: 'Cancel', description: 'Abort provider setup' },
      ]);

      if (action === 'cancel') {
        return null;
      }
    }
  }

  cmdMentionsHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Mentions',
      subtitle: 'inject context with @',
      sections: [
        {
          lines: [
            `${colorize('@path/to/file.ts', 'cyan')}   ${colorize('inject file content', 'muted')}`,
            `${colorize('@path/to/dir/', 'cyan')}      ${colorize('inject directory listing', 'muted')}`,
            `${colorize('@https://url.com', 'cyan')}   ${colorize('fetch and inject URL', 'muted')}`,
            `${colorize('@git:status', 'cyan')}        ${colorize('git status', 'muted')}`,
            `${colorize('@git:diff', 'cyan')}          ${colorize('git diff', 'muted')}`,
            `${colorize('@git:log', 'cyan')}           ${colorize('git log', 'muted')}`,
            `${colorize('@git:branch', 'cyan')}        ${colorize('list branches', 'muted')}`,
          ],
        },
      ],
      footer: 'Example: "Explain @src/main.ts". Type @ to see suggestions.',
    }));
  }
}
