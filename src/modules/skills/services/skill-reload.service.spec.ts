import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { SkillLoaderService } from './skill-loader.service';
import { SkillReloadService } from './skill-reload.service';
import { SkillScopeResolverService } from './skill-scope-resolver.service';
import { SkillVersionService } from './skill-version.service';
import { SkillValidationService } from './skill-validation.service';

describe('SkillReloadService', () => {
  test('reloads project skills and reports effective version', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cast-skill-reload-'));
    const skillsDir = path.join(root, '.cast', 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, 'api-contracts.md'), [
      '---',
      'name: api-contracts',
      'description: Project API contract guidance',
      'tools: [read_file]',
      '---',
      '',
      '# Guidelines',
      'Design stable HTTP contracts.',
      '',
    ].join('\n'));

    const loader = new SkillLoaderService(new MarkdownParserService());
    const service = new SkillReloadService(
      loader,
      new SkillScopeResolverService(new SkillVersionService()),
      new SkillVersionService(),
      new SkillValidationService(),
    );

    const result = await service.reloadSkill('api-contracts', { projectRoot: root });

    assert.equal(result.ok, true);
    assert.equal(result.records[0].name, 'api-contracts');
    assert.equal(result.records[0].scope, 'project');
    assert.match(result.records[0].version, /^[a-f0-9]{12}$/);
    assert.equal(loader.getSkill('api-contracts')?.description, 'Project API contract guidance');
  });
});
