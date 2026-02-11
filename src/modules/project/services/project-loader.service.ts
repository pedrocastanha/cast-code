import { Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { ProjectConfig, ProjectContextFrontmatter } from '../types';
import { McpConfig } from '../../mcp/types';
import { CAST_DIR } from '../../../common/constants';

@Injectable()
export class ProjectLoaderService {
  constructor(private readonly markdownParser: MarkdownParserService) {}

  async detectProject(startPath: string = process.cwd()): Promise<string | null> {
    let currentPath = startPath;

    while (currentPath !== path.parse(currentPath).root) {
      const configPath = path.join(currentPath, CAST_DIR);

      if (await this.markdownParser.exists(configPath)) {
        return currentPath;
      }

      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  async loadProject(projectPath: string): Promise<ProjectConfig> {
    const configDirPath = path.join(projectPath, CAST_DIR);

    if (!(await this.markdownParser.exists(configDirPath))) {
      return {};
    }

    const config: ProjectConfig = {};

    const contextPath = path.join(configDirPath, 'context.md');
    if (await this.markdownParser.exists(contextPath)) {
      const { frontmatter, content } =
        await this.markdownParser.parse<ProjectContextFrontmatter>(contextPath);

      config.context = {
        name: frontmatter.name || path.basename(projectPath),
        stack: frontmatter.stack || [],
        conventions: frontmatter.conventions || [],
        description: content,
      };
    }

    const mcpPath = path.join(configDirPath, 'mcp');
    if (await this.markdownParser.exists(mcpPath)) {
      config.mcpConfigs = await this.loadMcpConfigs(mcpPath);
    }

    return config;
  }

  private async loadMcpConfigs(mcpPath: string): Promise<Record<string, McpConfig>> {
    const configs: Record<string, McpConfig> = {};

    try {
      const files = await fs.readdir(mcpPath);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(mcpPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        const name = file.replace('.json', '');

        if (parsed.type) {
          configs[name] = parsed as McpConfig;
        } else {
          for (const [serverName, serverConfig] of Object.entries(parsed)) {
            configs[serverName] = serverConfig as McpConfig;
          }
        }
      }
    } catch {
      throw new NotFoundException(`MCP configuration directory not found: ${mcpPath}`);
    }

    return configs;
  }

  getAgentsOverridePath(projectPath: string): string {
    return path.join(projectPath, CAST_DIR, 'agents');
  }

  getSkillsOverridePath(projectPath: string): string {
    return path.join(projectPath, CAST_DIR, 'skills');
  }
}
