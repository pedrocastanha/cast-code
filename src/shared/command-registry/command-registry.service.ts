import { Injectable } from '@nestjs/common';

export interface CommandHandler {
  group: string;
  description: string;
  execute(args: string[]): Promise<string> | string;
}

export interface CommandAlias {
  alias: string;
  target: string;
}

@Injectable()
export class CommandRegistryService {
  private commands = new Map<string, CommandHandler>();
  private aliases = new Map<string, string>();

  register(handler: CommandHandler) {
    this.commands.set(handler.group, handler);
  }

  registerAlias(alias: string, target: string) {
    this.aliases.set(alias, target);
  }

  getCommand(group: string): CommandHandler | undefined {
    const resolved = this.aliases.get(group) || group;
    return this.commands.get(resolved);
  }

  getAllCommands(): CommandHandler[] {
    return Array.from(this.commands.values());
  }

  async execute(group: string, args: string[]): Promise<string> {
    const handler = this.getCommand(group);
    if (!handler) {
      return `Command group "${group}" not found. Use "list_commands" to see available commands.`;
    }
    try {
      return await handler.execute(args);
    } catch (error) {
      return `Error executing "${group}": ${(error as Error).message}`;
    }
  }

  getDescriptions(): { group: string; description: string }[] {
    return Array.from(this.commands.values()).map((c) => ({
      group: c.group,
      description: c.description,
    }));
  }
}
