import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { BenchmarkModelLocatorService } from './benchmark-model-locator.service';

test('locates env, request-body and code-factory model override points', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cast-model-locator-'));
  const file = join(root, 'src/chat.ts');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, '.env.example'), 'OPENAI_MODEL=gpt-4.1-mini\n');
  await writeFile(file, `
    const model = req.body.model ?? process.env.OPENAI_MODEL;
    const llm = new ChatOpenAI({ modelName: model });
  `);

  const locator = new BenchmarkModelLocatorService();
  const points = await locator.locate({
    projectRoot: root,
    filePath: file,
    content: await readFile(file, 'utf-8'),
  });

  assert(points.some((point) => point.kind === 'env' && point.key === 'OPENAI_MODEL'));
  assert(points.some((point) => point.kind === 'request_body' && point.key === 'model'));
  assert(points.some((point) => point.kind === 'code_factory'));
});
