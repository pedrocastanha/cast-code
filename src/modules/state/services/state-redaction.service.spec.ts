import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { StateRedactionService } from './state-redaction.service';

describe('StateRedactionService', () => {
  const service = new StateRedactionService();

  test('redacts common secret shapes deterministically', () => {
    const fixtures = [
      'Authorization: Bearer abc.def.ghi',
      'OPENAI_API_KEY=sk-test-value',
      'OPENAI_API_KEY="sk-quoted-value"',
      'CUSTOM_TOKEN="plain-secret-value"',
      'ANTHROPIC_API_KEY=sk-ant-test-value',
      'GITHUB_TOKEN=ghp_testvalue',
      'postgres://user:pass@localhost:5432/db',
    ];

    for (const fixture of fixtures) {
      const redacted = service.redact(fixture);
      assert.notEqual(redacted, fixture);
      assert.doesNotMatch(redacted, /abc\.def\.ghi|sk-test-value|sk-quoted-value|plain-secret-value|sk-ant-test-value|ghp_testvalue|user:pass/);
      assert.match(redacted, /\[REDACTED/);
    }
  });

  test('builds preview from redacted content and caps it at 500 characters', () => {
    const preview = service.contentPreview(`OPENAI_API_KEY=sk-test-value ${'x'.repeat(800)}`);

    assert.equal(preview.length, 500);
    assert.doesNotMatch(preview, /sk-test-value/);
  });

  test('hashes raw content without exposing the raw value', () => {
    const hash = service.contentHash('OPENAI_API_KEY=sk-test-value');

    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.notEqual(hash, service.contentHash('OPENAI_API_KEY=other'));
  });
});
