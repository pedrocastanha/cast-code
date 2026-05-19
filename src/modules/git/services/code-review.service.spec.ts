import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

test('CodeReviewService does not shell through npx for formatting', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/git/services/code-review.service.ts'),
    'utf-8',
  );

  assert.doesNotMatch(source, /npx\s+prettier/);
  assert.match(source, /resolvePrettierFormatter/);
});
