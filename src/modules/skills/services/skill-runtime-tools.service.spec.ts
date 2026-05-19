import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SkillRuntimeToolsService } from './skill-runtime-tools.service';

describe('SkillRuntimeToolsService', () => {
  test('exposes list_skill_files and skill_view tools', async () => {
    const service = new SkillRuntimeToolsService({
      listSkillFiles: async () => ({
        ok: true,
        skillName: 'popular-web-designs',
        files: ['templates/stripe.md', 'references/guide.md'],
      }),
      readSkillFile: async () => ({
        ok: true,
        skillName: 'popular-web-designs',
        filePath: 'templates/stripe.md',
        content: '# Stripe\nUse crisp cards.\n',
        truncated: false,
        bytes: 26,
        maxBytes: 40960,
      }),
    } as any);

    const tools = service.getTools();
    const listTool = tools.find((tool) => tool.name === 'list_skill_files');
    const viewTool = tools.find((tool) => tool.name === 'skill_view');

    assert(listTool);
    assert(viewTool);

    const listOutput = String(await listTool.invoke({ skillName: 'popular-web-designs' }));
    assert.match(listOutput, /Skill popular-web-designs support files:/);
    assert.match(listOutput, /templates\/stripe\.md/);

    const viewOutput = String(await viewTool.invoke({
      skillName: 'popular-web-designs',
      filePath: 'templates/stripe.md',
    }));
    assert.match(viewOutput, /^# popular-web-designs: templates\/stripe\.md/);
    assert.match(viewOutput, /Use crisp cards/);
  });

  test('formats empty, truncated, and rejected asset responses', async () => {
    const service = new SkillRuntimeToolsService({
      listSkillFiles: async (skillName: string) => ({
        ok: true,
        skillName,
        files: [],
      }),
      readSkillFile: async (_skillName: string, filePath: string) => {
        if (filePath === 'templates/long.md') {
          return {
            ok: true,
            skillName: 'popular-web-designs',
            filePath,
            content: 'partial',
            truncated: true,
            bytes: 100,
            maxBytes: 7,
          };
        }
        return {
          ok: false,
          skillName: 'popular-web-designs',
          filePath,
          error: 'Path traversal is blocked.',
        };
      },
    } as any);

    const listTool = service.getTools().find((tool) => tool.name === 'list_skill_files');
    const viewTool = service.getTools().find((tool) => tool.name === 'skill_view');
    assert(listTool);
    assert(viewTool);

    const emptyOutput = String(await listTool.invoke({ skillName: 'popular-web-designs' }));
    assert.match(emptyOutput, /No support files found/i);

    const truncatedOutput = String(await viewTool.invoke({
      skillName: 'popular-web-designs',
      filePath: 'templates/long.md',
    }));
    assert.match(truncatedOutput, /truncated/i);
    assert.match(truncatedOutput, /100 bytes/i);

    const rejectedOutput = String(await viewTool.invoke({
      skillName: 'popular-web-designs',
      filePath: '../godmode/SKILL.md',
    }));
    assert.match(rejectedOutput, /Error:/);
    assert.match(rejectedOutput, /Path traversal is blocked/);
  });
});
