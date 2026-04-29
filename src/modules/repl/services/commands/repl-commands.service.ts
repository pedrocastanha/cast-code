import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
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
  getProviderEndpointLabel,
  getRecommendedModel,
  isRecommendedModelForPurpose,
  MODEL_PURPOSES,
  ModelPurpose,
  ProviderType,
  PROVIDER_METADATA,
  providerAllowsOptionalApiKey,
  providerRequiresBaseUrl,
} from '../../../config/types/config.types';
import { ISmartInput } from '../smart-input';

@Injectable()
export class ReplCommandsService {
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
    const w = (s: string) => process.stdout.write(s + '\r\n');

    // Section header — clean, minimal
    const section = (title: string) => {
      w('');
      w(`  ${colorize(title, 'muted')}`);
    };

    // Command row
    const cmd = (name: string, desc: string, nameWidth = 18) => {
      const padded = name.padEnd(nameWidth);
      process.stdout.write(`    ${colorize(padded, 'cyan')}${colorize(desc, 'muted')}\r\n`);
    };

    w('');
    w(`  ${colorize('cast', 'primary')}${colorize('code', 'bold')} ${colorize('— command reference', 'muted')}`);
    w('');

    section('General');
    cmd('/help', 'show this reference');
    cmd('/clear', 'clear conversation history');
    cmd('/compact', 'summarize and compress history');
    cmd('/context', 'show session info');
    cmd('/exit', 'quit');

    section('Git');
    cmd('/status', 'git status');
    cmd('/diff [ref]', 'git diff');
    cmd('/log', 'recent commits');
    cmd('/commit [msg]', 'AI-assisted or manual commit');
    cmd('/up', 'smart commit & push');
    cmd('/split-up', 'split into multiple commits');
    cmd('/pr', 'create PR with AI description');
    cmd('/unit-test', 'generate tests for branch changes');
    cmd('/review [files]', 'code review');
    cmd('/fix <file>', 'auto-fix code issues');
    cmd('/ident', 'format all code files');
    cmd('/release [tag]', 'generate release notes');

    section('Agents & Skills');
    cmd('/agents', 'list loaded agents');
    cmd('/agents create', 'create new agent');
    cmd('/skills', 'list loaded skills');
    cmd('/skills create', 'create new skill');

    section('Project & Config');
    cmd('/init', 'analyze project & generate context');
    cmd('/project show', 'display current project context');
    cmd('/project edit', 'open project context in editor');
    cmd('/project-deep', 'deep analysis + agent brief');
    cmd('/model', 'show or change models');
    cmd('/config', 'show/edit configuration');

    section('Tools & MCP');
    cmd('/tools', 'list available tools');
    cmd('/mcp list', 'list MCP servers');
    cmd('/mcp tools', 'list MCP tools');
    cmd('/mcp add', 'add MCP server');
    cmd('/mcp help', 'MCP setup guide');
    cmd('/kanban', 'open kanban task board');
    cmd('/remote', 'start remote web interface via ngrok');

    section('Session & History');
    cmd('/rollback [file]', 'restore file from snapshot');
    cmd('/stats', 'show session token & cost stats');
    cmd('/replay [list|save|show]', 'save/view session replays');
    cmd('/vault [list|show|promote]', 'manage code snippet vault');

    section('Context Mentions  (@)');
    cmd('@file.ts', 'inject file content');
    cmd('@dir/', 'inject directory listing');
    cmd('@git:status', 'inject git status');
    cmd('@git:diff', 'inject git diff');
    cmd('@https://url', 'fetch and inject URL');

    section('Keyboard shortcuts');
    process.stdout.write(`    ${colorize('Tab', 'cyan')}                accept autocomplete suggestion\r\n`);
    process.stdout.write(`    ${colorize('↑ / ↓', 'cyan')}             navigate suggestions or history\r\n`);
    process.stdout.write(`    ${colorize('Ctrl+C', 'cyan')}            cancel current operation\r\n`);
    process.stdout.write(`    ${colorize('Ctrl+D', 'cyan')}            exit\r\n`);

    w('');
  }

  cmdClear(welcomeScreen: { printBanner: () => void }): void {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1bc');
    welcomeScreen.printBanner();
    process.stdout.write(`  ${colorize(Icons.check, 'success')} ${colorize('Conversation cleared', 'muted')}\r\n\r\n`);
  }

  cmdContext(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(`  ${colorize('Session', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(36), 'subtle')}\r\n`);
    w('\r\n');

    w(`  ${colorize('Messages', 'muted')}    ${this.deepAgent.getMessageCount()}\r\n`);
    w(`  ${colorize('Tokens', 'muted')}      ${colorize(this.deepAgent.getTokenCount().toLocaleString(), 'cyan')}\r\n`);
    w(`  ${colorize('CWD', 'muted')}         ${colorize(process.cwd(), 'accent')}\r\n`);
    w(`  ${colorize('Model', 'muted')}       ${colorize(this.configService.getProvider() + '/' + this.configService.getModel(), 'cyan')}\r\n`);

    w('\r\n');

    const mcpSummaries = this.mcpRegistry.getServerSummaries();
    const mcpConnected = mcpSummaries.filter(s => s.status === 'connected').length;
    const mcpTotal = mcpSummaries.length;
    const mcpTools = mcpSummaries.reduce((sum, s) => sum + s.toolCount, 0);

    const mcpStatus = mcpConnected > 0
      ? colorize(`${mcpConnected}/${mcpTotal}`, 'success')
      : colorize(`${mcpConnected}/${mcpTotal}`, 'muted');
    const mcpToolsStr = mcpTools > 0 ? colorize(` (${mcpTools} tools)`, 'muted') : '';
    w(`  ${colorize('MCP', 'muted')}         ${mcpStatus}${mcpToolsStr}\r\n`);

    if (mcpSummaries.length > 0) {
      for (const s of mcpSummaries) {
        const icon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'muted');
        w(`    ${icon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.toolCount} tools)`, 'muted')}\r\n`);
      }
    }

    w('\r\n');

    const agents = this.agentLoader.getAllAgents();
    w(`  ${colorize('Agents', 'muted')}      ${colorize(agents.length.toString(), 'cyan')}`);
    if (agents.length > 0) {
      const names = agents.slice(0, 5).map(a => a.name).join(', ');
      const more = agents.length > 5 ? ` +${agents.length - 5}` : '';
      w(`  ${colorize(names + more, 'muted')}`);
    }
    w('\r\n');

    const skills = this.skillRegistry.getAllSkills();
    w(`  ${colorize('Skills', 'muted')}      ${colorize(skills.length.toString(), 'cyan')}`);
    if (skills.length > 0) {
      const names = skills.slice(0, 5).map(s => s.name).join(', ');
      const more = skills.length > 5 ? ` +${skills.length - 5}` : '';
      w(`  ${colorize(names + more, 'muted')}`);
    }
    w('\r\n\r\n');

    const hasContext = this.projectContext.hasContext();
    w(`  ${colorize('Project', 'muted')}     ${hasContext ? colorize('loaded', 'success') : colorize('not loaded — run /init', 'muted')}\r\n`);

    const memOk = this.memoryService.isInitialized();
    w(`  ${colorize('Memory', 'muted')}      ${memOk ? colorize('enabled', 'success') : colorize('not configured', 'muted')}\r\n`);

    w('\r\n');
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
    process.stdout.write('\r\n');
    process.stdout.write(`  ${colorize('Models', 'bold')}\r\n`);
    process.stdout.write(`  ${colorize(Box.horizontal.repeat(28), 'subtle')}\r\n\r\n`);

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

      process.stdout.write(
        `  ${colorize(purpose.label.padEnd(12), 'muted')} ${colorize(`${modelConfig.provider}/${modelConfig.model}`, 'cyan')}\r\n`,
      );
      process.stdout.write(
        `  ${colorize(' '.repeat(12), 'muted')} ${colorize(`${endpointLabel} · ${recommended}`, 'subtle')}\r\n`,
      );
    }

    process.stdout.write('\r\n');
    process.stdout.write(
      `  ${colorize('Tip:', 'muted')} run ${colorize('/model', 'cyan')} to change quickly or ${colorize('/model reviewer', 'cyan')} for a specific purpose. Any configured provider can be used for any purpose.\r\n\r\n`,
    );
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
      process.stdout.write(
        `\r\n  ${colorize('Provider setup cancelled. Model unchanged.', 'warning')}\r\n\r\n`,
      );
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

    process.stdout.write('\r\n');
    process.stdout.write(
      `  ${colorize(Icons.check, 'success')} ${colorize(
        `${purpose} -> ${provider}/${model}`,
        'muted',
      )}\r\n`,
    );
    process.stdout.write('\r\n');
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
    process.stdout.write('\r\n');
    process.stdout.write(
      `  ${colorize(`Configuring ${meta.name} inline`, 'warning')}\r\n`,
    );

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
      process.stdout.write(
        `  ${colorize(Icons.check, 'success')} ${colorize(`${meta.name} configured`, 'muted')}\r\n\r\n`,
      );
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
    process.stdout.write(
      `  ${colorize(Icons.check, 'success')} ${colorize(`${meta.name} configured`, 'muted')}\r\n\r\n`,
    );
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
    const w = (s: string) => process.stdout.write(s + '\r\n');
    const row = (name: string, desc: string, w2 = 22) =>
      process.stdout.write(`    ${colorize(name.padEnd(w2), 'cyan')}${colorize(desc, 'muted')}\r\n`);

    w('');
    w(`  ${colorize('Mentions', 'bold')} ${colorize('— inject context with @', 'muted')}`);
    w(`  ${colorize(Box.horizontal.repeat(36), 'subtle')}`);
    w('');
    row('@path/to/file.ts', 'inject file content');
    row('@path/to/dir/', 'inject directory listing');
    row('@https://url.com', 'fetch and inject URL');
    row('@git:status', 'git status');
    row('@git:diff', 'git diff');
    row('@git:log', 'git log');
    row('@git:branch', 'list branches');
    w('');
    w(`  ${colorize('Example:', 'muted')} "Explain ${colorize('@src/main.ts', 'cyan')}"`);
    w(`  ${colorize('Tip:', 'muted')}    Type ${colorize('@', 'cyan')} and suggestions appear automatically`);
    w('');
  }
}
