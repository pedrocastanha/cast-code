import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { GitModule } from './git.module';
import { CommonModule } from '../../common/common.module';
import { CommitGeneratorService } from './services/commit-generator.service';
import { MonorepoDetectorService } from './services/monorepo-detector.service';
import { PrGeneratorService } from './services/pr-generator.service';
import { CodeReviewService } from './services/code-review.service';
import { ReleaseNotesService } from './services/release-notes.service';
import { UnitTestGeneratorService } from './services/unit-test-generator.service';

const declaredServices = [
  CommitGeneratorService,
  MonorepoDetectorService,
  PrGeneratorService,
  CodeReviewService,
  ReleaseNotesService,
  UnitTestGeneratorService,
];

const getModuleMetadata = (key: string) => Reflect.getMetadata(key, GitModule) ?? [];

// Validates that GitModule imports the shared CommonModule and exposes every declared service provider.
test('GitModule registers its CommonModule import and provider list', () => {
  const imports = getModuleMetadata('imports');
  assert(imports.includes(CommonModule), 'CommonModule should be available as an import');

  const providers = getModuleMetadata('providers');
  for (const service of declaredServices) {
    assert(
      providers.includes(service),
      `${service.name} must be registered as a provider for GitModule`,
    );
  }
  assert.strictEqual(providers.length, declaredServices.length, 'No extra providers should be introduced accidentally');

  const exportsList = getModuleMetadata('exports');
  for (const service of declaredServices) {
    assert(
      exportsList.includes(service),
      `${service.name} must be exported from GitModule for reuse`,
    );
  }
});

// Ensures providers and exports remain synchronized to avoid missing exports or unexpected registrations.
test('GitModule keeps providers and exports in lockstep', () => {
  const providers = getModuleMetadata('providers');
  const exportsList = getModuleMetadata('exports');

  assert.strictEqual(providers.length, exportsList.length, 'Providers and exports should contain the same number of services');
  for (const provided of providers) {
    assert(exportsList.includes(provided), `${provided.name} should be exported whenever it is provided`);
  }
});
