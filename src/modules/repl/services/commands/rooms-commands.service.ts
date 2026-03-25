/**
 * Rooms CLI Command Service
 *
 * Provides CLI commands for Rooms feature including Long Term Memory management.
 *
 * Usage:
 *   cast rooms memory search <query>
 *   cast rooms memory list [instanceId]
 *   cast rooms memory forget <id>
 */

import { Injectable } from '@nestjs/common';
import { LTMService } from '../../../rooms/services/ltm.service';
import { MemoryEntry } from '../../../rooms/types/ltm.types';
import { Colors, colorize, Box, Icons } from '../../utils/theme';

@Injectable()
export class RoomsCommandsService {
  constructor(
    private readonly ltmService: LTMService,
  ) {}

  /**
   * Main entry point for /rooms command
   */
  async cmdRooms(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const sub = args[0];

    if (!sub) {
      this.printRoomsHelp();
      return;
    }

    if (sub === 'memory' || sub === 'mem') {
      await this.cmdMemory(args.slice(1));
      return;
    }

    w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`Unknown subcommand: /rooms ${sub}`, 'error')}\r\n`);
    w(`  ${colorize('Try ', 'muted')}${colorize('/rooms memory', 'cyan')}\r\n\r\n`);
  }

  /**
   * Memory subcommand handler
   */
  async cmdMemory(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const sub = args[0];

    if (!sub) {
      this.printMemoryHelp();
      return;
    }

    switch (sub) {
      case 'search':
      case 's':
        await this.memorySearch(args.slice(1));
        break;

      case 'list':
      case 'ls':
        await this.memoryList(args.slice(1));
        break;

      case 'forget':
      case 'delete':
      case 'rm':
        await this.memoryForget(args.slice(1));
        break;

      case 'stats':
        await this.memoryStats();
        break;

      case 'help':
        this.printMemoryHelp();
        break;

      default:
        w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`Unknown memory command: ${sub}`, 'error')}\r\n`);
        this.printMemoryHelp();
        break;
    }
  }

  /**
   * Search memories: /rooms memory search <query>
   */
  private async memorySearch(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const query = args.join(' ').trim();

    if (!query) {
      w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize('Query is required', 'error')}\r\n`);
      w(`  ${colorize('Usage: ', 'muted')}${colorize('/rooms memory search <query>', 'cyan')}\r\n\r\n`);
      return;
    }

    w('\r\n');
    w(`  ${colorize(`Searching memories for "${query}"`, 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(50), 'subtle')}\r\n`);

    try {
      const memories = this.ltmService.getMemories(query);

      if (memories.length === 0) {
        w('\r\n');
        w(`  ${colorize(Icons.info, 'muted')} ${colorize('No memories found.', 'muted')}\r\n`);
        w('\r\n');
        return;
      }

      w('\r\n');

      for (const memory of memories) {
        const typeColor = this.getMemoryTypeColor(memory.type);
        const timeAgo = this.formatTimeAgo(memory.timestamp);
        const preview = memory.content.length > 100
          ? memory.content.slice(0, 97) + '...'
          : memory.content;

        w(`  ${colorize(Icons.bullet, typeColor)} `);
        w(`${colorize(`[${memory.type}]`, typeColor)} `);
        w(`${colorize(timeAgo, 'muted')} `);
        w(`${colorize(`@${memory.agentId}`, 'subtle')} `);
        w(`${colorize(`imp:${memory.importance.toFixed(1)}`, 'subtle')}\r\n`);
        w(`    ${colorize(preview, 'text')}\r\n`);
        w(`    ${colorize(`ID: ${memory.id}`, 'dim')}\r\n`);
        w('\r\n');
      }

      w(`  ${colorize(`Found ${memories.length} memories`, 'muted')}\r\n`);
      w('\r\n');
    } catch (error) {
      w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`Search failed: ${(error as Error).message}`, 'error')}\r\n\r\n`);
    }
  }

  /**
   * List memories: /rooms memory list [instanceId]
   */
  private async memoryList(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const instanceId = args[0];

    w('\r\n');

    if (instanceId) {
      w(`  ${colorize(`Memories for instance "${instanceId}"`, 'bold')}\r\n`);
    } else {
      w(`  ${colorize('Recent Memories', 'bold')}\r\n`);
    }

    w(`  ${colorize(Box.horizontal.repeat(50), 'subtle')}\r\n`);

    try {
      let memories: MemoryEntry[];

      if (instanceId) {
        memories = this.ltmService.getInstanceHistory(instanceId);
      } else {
        memories = this.ltmService.getMemories('', {});
        memories = memories.slice(0, 20);
      }

      if (memories.length === 0) {
        w('\r\n');
        w(`  ${colorize(Icons.info, 'muted')} ${colorize('No memories found.', 'muted')}\r\n`);
        w('\r\n');
        return;
      }

      w('\r\n');

      for (const memory of memories) {
        const typeColor = this.getMemoryTypeColor(memory.type);
        const timeAgo = this.formatTimeAgo(memory.timestamp);

        w(`  ${colorize(Icons.bullet, typeColor)} `);
        w(`${colorize(memory.id, 'cyan')} `);
        w(`${colorize(`[${memory.type}]`, typeColor)} `);
        w(`${colorize(timeAgo, 'muted')}\r\n`);
        w(`    ${colorize(memory.content.slice(0, 80), 'text')}\r\n`);
      }

      w('\r\n');
      w(`  ${colorize(`Total: ${memories.length} memories`, 'muted')}\r\n`);
      w('\r\n');
    } catch (error) {
      w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`List failed: ${(error as Error).message}`, 'error')}\r\n\r\n`);
    }
  }

  /**
   * Forget memory: /rooms memory forget <id>
   */
  private async memoryForget(args: string[]): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const memoryId = args[0];

    if (!memoryId) {
      w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize('Memory ID is required', 'error')}\r\n`);
      w(`  ${colorize('Usage: ', 'muted')}${colorize('/rooms memory forget <id>', 'cyan')}\r\n\r\n`);
      return;
    }

    try {
      const deleted = this.ltmService.forget(memoryId);

      if (deleted) {
        w('\r\n');
        w(`  ${colorize(Icons.check, 'success')} ${colorize('Memory deleted successfully', 'success')}\r\n`);
        w('\r\n');
      } else {
        w('\r\n');
        w(`  ${colorize(Icons.cross, 'error')} ${colorize(`Memory "${memoryId}" not found`, 'error')}\r\n`);
        w('\r\n');
      }
    } catch (error) {
      w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`Delete failed: ${(error as Error).message}`, 'error')}\r\n\r\n`);
    }
  }

  /**
   * Show memory statistics: /rooms memory stats
   */
  private async memoryStats(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(`  ${colorize('Memory Statistics', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(50), 'subtle')}\r\n`);
    w('\r\n');

    try {
      const count = this.ltmService.getMemoryCount();

      w(`  ${colorize('Total memories:', 'muted')} ${colorize(count.toString(), 'cyan')}\r\n`);
      w('\r\n');
    } catch (error) {
      w(`  ${colorize(Icons.cross, 'error')} ${colorize(`Stats failed: ${(error as Error).message}`, 'error')}\r\n`);
    }

    w('\r\n');
  }

  /**
   * Print rooms help
   */
  private printRoomsHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(`  ${colorize('Rooms Commands', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(40), 'subtle')}\r\n`);
    w('\r\n');
    w(`  ${colorize('/rooms memory', 'cyan')}         Long Term Memory management\r\n`);
    w(`  ${colorize('/rooms mem', 'cyan')}            Alias for memory\r\n`);
    w('\r\n');
  }

  /**
   * Print memory help
   */
  private printMemoryHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(`  ${colorize('Memory Commands', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(40), 'subtle')}\r\n`);
    w('\r\n');
    w(`  ${colorize('/rooms memory search <query>', 'cyan')}   Search memories by content\r\n`);
    w(`  ${colorize('/rooms memory list [id]', 'cyan')}        List memories (optionally by instance)\r\n`);
    w(`  ${colorize('/rooms memory forget <id>', 'cyan')}      Delete a memory by ID\r\n`);
    w(`  ${colorize('/rooms memory stats', 'cyan')}            Show memory statistics\r\n`);
    w('\r\n');
  }

  /**
   * Get color for memory type
   */
  private getMemoryTypeColor(type: string): string {
    switch (type) {
      case 'task_completed':
        return 'success';
      case 'tool_result':
        return 'primary';
      case 'conversation':
        return 'text';
      case 'insight':
        return 'accent';
      case 'error':
        return 'error';
      case 'code_snippet':
        return 'secondary';
      default:
        return 'muted';
    }
  }

  /**
   * Format timestamp as "time ago"
   */
  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  /**
   * Format success message
   */
  private formatSuccess(text: string): string {
    return colorize(text, 'success');
  }

  /**
   * Format info message
   */
  private formatInfo(text: string): string {
    return colorize(text, 'info');
  }
}
