import { Injectable, OnModuleInit } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { FilesystemToolsService } from './filesystem-tools.service';
import { ShellToolsService } from './shell-tools.service';
import { SearchToolsService } from './search-tools.service';
import { DiscoveryToolsService } from './discovery-tools.service';
import { TaskToolsService } from '../../tasks/services/task-tools.service';
import { MemoryToolsService } from '../../memory/services/memory-tools.service';
import { CapabilityRegistryService, ToolCapability } from '../../capabilities';

@Injectable()
export class ToolsRegistryService implements OnModuleInit {
  private tools: Map<string, StructuredTool> = new Map();

  constructor(
    private readonly filesystemTools: FilesystemToolsService,
    private readonly shellTools: ShellToolsService,
    private readonly searchTools: SearchToolsService,
    private readonly discoveryTools: DiscoveryToolsService,
    private readonly taskTools: TaskToolsService,
    private readonly memoryTools: MemoryToolsService,
    private readonly capabilityRegistry: CapabilityRegistryService,
  ) {}

  onModuleInit() {
    const capabilities: ToolCapability[] = [
      {
        name: 'filesystem',
        description: 'File read/write/edit operations',
        getter: () => this.filesystemTools.getTools(),
      },
      {
        name: 'shell',
        description: 'Shell command execution',
        getter: () => this.shellTools.getTools(),
      },
      {
        name: 'search',
        description: 'Grep and glob search',
        getter: () => this.searchTools.getTools(),
      },
      {
        name: 'discovery',
        description: 'Discovery and impact analysis tools',
        getter: () => this.discoveryTools.getTools(),
      },
      {
        name: 'tasks',
        description: 'Task management tools',
        getter: () => this.taskTools.getTools(),
      },
      {
        name: 'memory',
        description: 'Memory tools',
        getter: () => this.memoryTools.getTools(),
      },
    ];
    this.capabilityRegistry.registerToolSource('tools', capabilities);
    this.capabilityRegistry.registerRootDirSetter((dir: string) => {
      this.filesystemTools.setRootDir(dir);
      this.shellTools.setRootDir(dir);
    });

    const allTools = this.getAllTools();
    for (const t of allTools) {
      this.tools.set(t.name, t);
    }
  }

  private resolveAllTools(): StructuredTool[] {
    const tools: StructuredTool[] = [];
    tools.push(...this.filesystemTools.getTools());
    tools.push(...this.shellTools.getTools());
    tools.push(...this.searchTools.getTools());
    tools.push(...this.discoveryTools.getTools());
    tools.push(...this.taskTools.getTools());
    tools.push(...this.memoryTools.getTools());
    return tools;
  }

  getTool(name: string): StructuredTool | undefined {
    return this.tools.get(name);
  }

  getTools(names: string[]): StructuredTool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((t): t is StructuredTool => t !== undefined);
  }

  getIsolatedTools(names: string[]): StructuredTool[] {
    const isolatedMap = new Map<string, StructuredTool>();

    for (const t of this.filesystemTools.getIsolatedTools()) {
      isolatedMap.set(t.name, t);
    }
    for (const t of this.shellTools.getIsolatedTools()) {
      isolatedMap.set(t.name, t);
    }
    for (const t of [
      ...this.searchTools.getTools(),
      ...this.taskTools.getTools(),
      ...this.memoryTools.getTools(),
    ]) {
      isolatedMap.set(t.name, t);
    }

    return names
      .map((name) => isolatedMap.get(name))
      .filter((t): t is StructuredTool => t !== undefined);
  }

  getAllTools(): StructuredTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  registerTool(t: StructuredTool) {
    this.tools.set(t.name, t);
  }

  setRootDir(dir: string): void {
    this.filesystemTools.setRootDir(dir);
    this.shellTools.setRootDir(dir);
  }
}
