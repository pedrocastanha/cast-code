import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { FilesystemToolsService } from './filesystem-tools.service';
import { ShellToolsService } from './shell-tools.service';
import { SearchToolsService } from './search-tools.service';
import { DiscoveryToolsService } from './discovery-tools.service';
import { TaskToolsService } from '../../tasks/services/task-tools.service';
import { MemoryToolsService } from '../../memory/services/memory-tools.service';

@Injectable()
export class ToolsRegistryService {
  private tools: Map<string, StructuredTool> = new Map();

  constructor(
    private readonly filesystemTools: FilesystemToolsService,
    private readonly shellTools: ShellToolsService,
    private readonly searchTools: SearchToolsService,
    @Inject(forwardRef(() => DiscoveryToolsService))
    private readonly discoveryTools: DiscoveryToolsService,
    @Inject(forwardRef(() => TaskToolsService))
    private readonly taskTools: TaskToolsService,
    @Inject(forwardRef(() => MemoryToolsService))
    private readonly memoryTools: MemoryToolsService,
  ) {
    this.registerBuiltInTools();
  }

  private registerBuiltInTools() {
    const allTools = [
      ...this.filesystemTools.getTools(),
      ...this.shellTools.getTools(),
      ...this.searchTools.getTools(),
      ...this.discoveryTools.getTools(),
      ...this.taskTools.getTools(),
      ...this.memoryTools.getTools(),
    ];

    for (const t of allTools) {
      this.tools.set(t.name, t);
    }
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
    // Stateful services get fresh isolated instances; stateless services reuse shared instances.
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
