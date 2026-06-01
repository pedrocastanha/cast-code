import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SwarmOwnershipService } from './swarm-ownership.service';

describe('SwarmOwnershipService', () => {
  const service = new SwarmOwnershipService();

  test('matches owned paths', () => {
    assert.equal(service.matchesOwnership('src/modules/swarm/index.ts', [{ glob: 'src/**' }]), true);
    assert.equal(service.matchesOwnership('README.md', [{ glob: 'src/**' }]), false);
  });
});
