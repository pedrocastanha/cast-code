import { Injectable } from '@nestjs/common';
import { castTool } from '../../../common/interfaces/cast-tool.interface';
import { z } from 'zod';

import { SkillAssetService } from './skill-asset.service';

@Injectable()
export class SkillRuntimeToolsService {
  constructor(private readonly skillAssetService: SkillAssetService) {}

  getTools() {
    return [
      this.createListSkillFilesTool(),
      this.createSkillViewTool(),
    ];
  }

  private createListSkillFilesTool() {
    return castTool(
      async (input) => {
        const skillName = readString(input, 'skillName', 'skill_name', 'name');
        if (!skillName) {
          return 'Error: skillName is required.';
        }

        const result = await this.skillAssetService.listSkillFiles(skillName);
        if (!result.ok) {
          return `Error: ${result.error}`;
        }
        if (result.files.length === 0) {
          return `No support files found for skill ${result.skillName}.`;
        }
        return [
          `Skill ${result.skillName} support files:`,
          ...result.files.map((file) => `- ${file}`),
        ].join('\n');
      },
      {
        name: 'list_skill_files',
        description: 'List support files inside a loaded skill package. Use this after read_skill when a skill mentions references, templates, scripts, assets, or skill_view.',
        schema: z.object({
          skillName: z.string().describe('Loaded skill name, for example popular-web-designs'),
        }),
      },
    );
  }

  private createSkillViewTool() {
    return castTool(
      async (input) => {
        const skillName = readString(input, 'skillName', 'skill_name', 'name');
        const filePath = readString(input, 'filePath', 'file_path', 'path');
        if (!skillName || !filePath) {
          return 'Error: skillName and filePath are required.';
        }

        const result = await this.skillAssetService.readSkillFile(skillName, filePath);
        if (!result.ok) {
          return `Error: ${result.error}`;
        }

        const output = [
          `# ${result.skillName}: ${result.filePath}`,
          '',
          result.content,
        ];

        if (result.truncated) {
          output.push('', `[truncated: showing first ${result.maxBytes} of ${result.bytes} bytes]`);
        }

        return output.join('\n');
      },
      {
        name: 'skill_view',
        description: 'Read a reference, template, script, or asset file from inside a loaded skill package. Paths must be relative to the skill package root.',
        schema: z.object({
          skillName: z.string().describe('Loaded skill name, for example popular-web-designs'),
          filePath: z.string().describe('Support file path relative to the skill package root, for example templates/stripe.md'),
        }),
      },
    );
  }
}

function readString(input: unknown, ...keys: string[]): string {
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}
