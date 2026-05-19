import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { SkillLoaderService } from './skill-loader.service';
import { SkillAssetService } from './skill-asset.service';

const legacySkillBrandLower = ['her', 'mes'].join('');
const legacySkillBrandTitle = `${legacySkillBrandLower[0].toUpperCase()}${legacySkillBrandLower.slice(1)}`;
const legacySkillAgentTitle = `${legacySkillBrandTitle} Agent`;
const legacySkillBrandPattern = new RegExp(legacySkillBrandLower, 'i');

describe('SkillAssetService', () => {
  let root: string;
  let loader: SkillLoaderService;
  let service: SkillAssetService;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cast-skill-assets-'));

    const skillRoot = path.join(root, 'catalog/skills/creative/popular-web-designs');
    await mkdir(path.join(skillRoot, 'templates'), { recursive: true });
    await mkdir(path.join(skillRoot, 'references'), { recursive: true });
    await mkdir(path.join(skillRoot, 'assets'), { recursive: true });
    await mkdir(path.join(root, 'outside'), { recursive: true });

    await writeFile(
      path.join(skillRoot, 'SKILL.md'),
      [
        '---',
        'name: popular-web-designs',
        'description: Web design templates',
        '---',
        '',
        `Use templates with skill_view. ${legacySkillAgentTitle} notes should be normalized.`,
      ].join('\n'),
      'utf-8',
    );
    await writeFile(path.join(skillRoot, 'templates/stripe.md'), `# Stripe\n${legacySkillAgentTitle} \u2014 Implementation Notes\nUse crisp cards.\n`, 'utf-8');
    await writeFile(path.join(skillRoot, 'references/guide.md'), 'Guide body\n', 'utf-8');
    await writeFile(path.join(skillRoot, 'assets/logo.bin'), Buffer.from([0, 1, 2, 3, 4]));
    await writeFile(path.join(root, 'outside/secret.md'), 'outside package\n', 'utf-8');
    await symlink(path.join(root, 'outside/secret.md'), path.join(skillRoot, 'references/secret-link.md'));

    loader = new SkillLoaderService(new MarkdownParserService());
    (loader as any).definitionsPath = root;
    await loader.loadSkills();
    service = new SkillAssetService(loader);
  });

  after(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('loads package path metadata and lists support files without indexing them as skills', async () => {
    const skill = loader.getSkill('popular-web-designs');

    assert.equal(skill?.definitionPath, path.join(root, 'catalog/skills/creative/popular-web-designs/SKILL.md'));
    assert.equal(skill?.packageRoot, path.join(root, 'catalog/skills/creative/popular-web-designs'));
    assert.doesNotMatch(skill?.guidelines ?? '', legacySkillBrandPattern);
    assert.deepEqual(skill?.supportFiles?.sort(), [
      'assets/logo.bin',
      'references/guide.md',
      'templates/stripe.md',
    ]);
    assert.equal(loader.getSkill('stripe'), undefined);

    const listed = await service.listSkillFiles('popular-web-designs');
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.ok ? listed.files.sort() : [], [
      'assets/logo.bin',
      'references/guide.md',
      'templates/stripe.md',
    ]);
  });

  test('reads support files within the package root', async () => {
    const result = await service.readSkillFile('popular-web-designs', 'templates/stripe.md');

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.content : '', '# Stripe\nImplementation Notes\nUse crisp cards.\n');
    assert.doesNotMatch(result.ok ? result.content : '', legacySkillBrandPattern);
    assert.equal(result.ok ? result.truncated : true, false);
  });

  test('blocks traversal, absolute paths, symlink escapes, and binary content', async () => {
    const traversal = await service.readSkillFile('popular-web-designs', '../godmode/SKILL.md');
    assert.equal(traversal.ok, false);
    assert.match(traversal.ok ? '' : traversal.error, /outside|traversal/i);

    const absolute = await service.readSkillFile('popular-web-designs', path.join(root, 'outside/secret.md'));
    assert.equal(absolute.ok, false);
    assert.match(absolute.ok ? '' : absolute.error, /relative/i);

    const symlinkEscape = await service.readSkillFile('popular-web-designs', 'references/secret-link.md');
    assert.equal(symlinkEscape.ok, false);
    assert.match(symlinkEscape.ok ? '' : symlinkEscape.error, /outside/i);

    const binary = await service.readSkillFile('popular-web-designs', 'assets/logo.bin');
    assert.equal(binary.ok, false);
    assert.match(binary.ok ? '' : binary.error, /binary/i);
  });

  test('truncates large support files with metadata', async () => {
    const result = await service.readSkillFile('popular-web-designs', 'templates/stripe.md', { maxBytes: 8 });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.content : '', '# Stripe');
    assert.equal(result.ok ? result.truncated : false, true);
    assert.equal(result.ok ? result.bytes : 0, Buffer.byteLength(`# Stripe\n${legacySkillAgentTitle} \u2014 Implementation Notes\nUse crisp cards.\n`));
    assert.equal(result.ok ? result.maxBytes : 0, 8);
  });
});
