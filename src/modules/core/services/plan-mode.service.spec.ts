import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PlanModeService } from './plan-mode.service';

describe('PlanModeService', () => {
  test('does not enter plan mode for clear single-file implementation tasks', async () => {
    let llmInvoked = false;
    const service = new PlanModeService({
      createModel: () => {
        llmInvoked = true;
        throw new Error('planner should not be invoked for clear single-file work');
      },
    } as any);

    const result = await service.shouldEnterPlanMode(
      'Adicione validacao em src/discount.js: applyDiscount deve lancar RangeError quando percent for menor que 0 ou maior que 1. Escreva o teste antes de implementar e rode npm test.',
    );

    assert.equal(result.shouldPlan, false);
    assert.equal(llmInvoked, false);
  });

  test('keeps plan mode for multi-file architecture or refactor requests', async () => {
    const service = new PlanModeService({
      createModel: () => {
        throw new Error('planner should not be needed for obvious complex work');
      },
    } as any);

    const result = await service.shouldEnterPlanMode(
      'Refactor auth/dtos/login.dto.ts and auth/services/auth.service.ts, then update the frontend flow and all tests.',
    );

    assert.equal(result.shouldPlan, true);
  });
});
