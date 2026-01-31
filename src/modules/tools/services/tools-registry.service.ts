import { Injectable } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { FilesystemToolsService } from './filesystem-tools.service';
import { ShellToolsService } from './shell-tools.service';
import { SearchToolsService } from './search-tools.service';

@Injectable()
export class ToolsRegistryService {
  private tools: Map<string, StructuredTool> = new Map();

  constructor(
    private readonly filesystemTools: FilesystemToolsService,
    private readonly shellTools: ShellToolsService,
    private readonly searchTools: SearchToolsService,
  ) {
    this.registerBuiltInTools();
  }

  private registerBuiltInTools() {
    const allTools = [
      ...this.filesystemTools.getTools(),
      ...this.shellTools.getTools(),
      ...this.searchTools.getTools(),
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

  getAllTools(): StructuredTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  registerTool(t: StructuredTool) {
    this.tools.set(t.name, t);
  }
}
