import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  PermissionScope,
  PermissionResponse,
  PermissionRule,
  PermissionsConfig,
  DangerLevel,
} from '../types/permission.types';
import { PromptService } from './prompt.service';

@Injectable()
export class PermissionService {
  private config: PermissionsConfig;
  private configPath: string;
  private sessionRules: Map<string, PermissionRule> = new Map();

  private readonly DANGER_PATTERNS = {
    [DangerLevel.DANGEROUS]: [
      /rm\s+(-rf|--recursive\s+--force)/,
      /dd\s+if=.*of=/,
      /mkfs/,
      /:(){ :|:& };:/,
      /curl.*\|\s*(bash|sh)/,
      /wget.*\|\s*(bash|sh)/,
      />\s*\/dev\/sd[a-z]/,  
    ],
    [DangerLevel.CAUTIOUS]: [
      /^rm\s/,
      /^mv\s/,
      /^chmod\s/,
      /^chown\s/,                          
      /npm\s+install.*-g/,
      /sudo\s/,
      /git\s+push.*--force/,
      /git\s+reset.*--hard/,
    ],
    [DangerLevel.SAFE]: [],
  };

  constructor(private promptService: PromptService) {
    this.configPath = path.join(os.homedir(), '.cast', 'permissions.json');
    this.config = {
      rules: [],
      sessionRules: [],
      dangerPatterns: this.DANGER_PATTERNS,
    };
  }

  async initialize(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      try {
        const content = await fs.readFile(this.configPath, 'utf-8');
        const saved = JSON.parse(content);
        this.config.rules = saved.rules || [];
      } catch {
        // Arquivo não existe ainda, usar config padrão
      }
    } catch (error) {
      console.error('Error initializing permissions:', error);
    }
  }
  async checkPermission(command: string): Promise<boolean> {
    const dangerLevel = this.getDangerLevel(command);

    if (dangerLevel === DangerLevel.SAFE) {
      return true;
    }

    const existingRule = this.findMatchingRule(command);
    if (existingRule && existingRule.allowed) {
      return true;
    }
    if (existingRule && !existingRule.allowed) {
      this.promptService.error('Command denied by saved rule');
      return false;
    }

    const response = await this.requestPermission(command, dangerLevel);

    if (response.scope !== PermissionScope.ONCE) {
      await this.saveRule(command, response);
    }

    return response.allowed;
  }

  private getDangerLevel(command: string): DangerLevel {
    for (const pattern of this.DANGER_PATTERNS[DangerLevel.DANGEROUS]) {
      if (pattern.test(command)) {
        return DangerLevel.DANGEROUS;
      }
    }

    for (const pattern of this.DANGER_PATTERNS[DangerLevel.CAUTIOUS]) {
      if (pattern.test(command)) {
        return DangerLevel.CAUTIOUS;
      }
    }

    return DangerLevel.SAFE;
  }

  private findMatchingRule(command: string): PermissionRule | null {
    const sessionRule = this.sessionRules.get(command);
    if (sessionRule) return sessionRule;

    for (const rule of this.config.rules) {
      if (this.matchesPattern(command, rule.pattern)) {
        return rule;
      }
    }

    return null;
  }

  private matchesPattern(command: string, pattern: string): boolean {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(command);
    }

    return command === pattern;
  }

  private async requestPermission(
    command: string,
    dangerLevel: DangerLevel,
  ): Promise<PermissionResponse> {
    console.log('');
    this.promptService.warn(`Permission required to execute command:`);
    console.log(`  ${command}`);
    console.log('');

    if (dangerLevel === DangerLevel.DANGEROUS) {
      this.promptService.error('⚠️  WARNING: This command is potentially DANGEROUS!');
    }

    const choices = [
      { key: 'allow-once', label: 'Allow once', description: 'Execute just this time' },
      {
        key: 'allow-session',
        label: 'Allow for session',
        description: 'Allow during this session',
      },
      ...(dangerLevel !== DangerLevel.DANGEROUS
        ? [
            {
              key: 'allow-always',
              label: 'Always allow',
              description: 'Never ask again for this command',
            },
          ]
        : []),
      { key: 'deny', label: 'Deny', description: 'Do not execute' },
    ];

    const choice = await this.promptService.choice('What do you want to do?', choices);

    switch (choice) {
      case 'allow-once':
        return { allowed: true, scope: PermissionScope.ONCE };
      case 'allow-session':
        return { allowed: true, scope: PermissionScope.SESSION };
      case 'allow-always':
        return { allowed: true, scope: PermissionScope.ALWAYS };
      case 'deny':
        return { allowed: false, scope: PermissionScope.ONCE };
      default:
        return { allowed: false, scope: PermissionScope.ONCE };
    }
  }

  private async saveRule(command: string, response: PermissionResponse): Promise<void> {
    const rule: PermissionRule = {
      pattern: command,
      allowed: response.allowed,
      scope: response.scope,
      createdAt: Date.now(),
    };

    if (response.scope === PermissionScope.SESSION) {
      this.sessionRules.set(command, rule);
    } else if (response.scope === PermissionScope.ALWAYS) {
      this.config.rules.push(rule);
      await this.persistConfig();
    }
  }

  private async persistConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      this.promptService.error('Failed to save permissions config: ' + (error as Error).message);
    }
  }

  clearSession(): void {
    this.sessionRules.clear();
  }

  async removeRule(pattern: string): Promise<void> {
    this.config.rules = this.config.rules.filter((r) => r.pattern !== pattern);
    await this.persistConfig();
  }

  listRules(): PermissionRule[] {
    return [...this.config.rules];
  }
}
