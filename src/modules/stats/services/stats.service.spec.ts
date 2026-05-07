import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { StatsService } from './stats.service';

describe('StatsService usage listener', () => {
  test('emits token metadata without prompt or output content', () => {
    const service = new StatsService();
    const events: Array<Record<string, unknown>> = [];
    service.setUsageListener((event) => events.push(event));

    service.trackUsage('openai/gpt-4.1-mini', 100, 50, 40);

    assert.equal(events.length, 1);
    assert.deepEqual(Object.keys(events[0]).sort(), ['cachedInput', 'cost', 'input', 'model', 'output']);
    assert.equal(events[0].input, 100);
    assert.equal(events[0].cachedInput, 40);
    assert.equal(events[0].output, 50);
    assert.equal(events[0].model, 'gpt-4.1-mini');
  });
});
