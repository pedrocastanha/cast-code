import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BenchmarkSandboxDecisionService } from './benchmark-sandbox-decision.service';

test('write confirmation choices recommend controlled environment', () => {
  const service = new BenchmarkSandboxDecisionService();
  const choices = service.writeConfirmationChoices();
  assert.equal(choices[0].key, 'controlled');
  assert.match(choices[0].label, /controlled/i);
});
