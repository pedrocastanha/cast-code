import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ScheduleCronService } from './schedule-cron.service';

describe('ScheduleCronService', () => {
  test('computes next run for hourly schedules', () => {
    const cron = new ScheduleCronService();
    const next = cron.nextRunAt('0 * * * *', new Date(2026, 4, 11, 10, 5, 0, 0));

    assert.equal(next.getHours(), 11);
    assert.equal(next.getMinutes(), 0);
  });

  test('supports step fields and weekday aliases through 0/7', () => {
    const cron = new ScheduleCronService();
    const next = cron.nextRunAt('*/15 9 * * 1-5', new Date(2026, 4, 11, 9, 1, 0, 0));

    assert.equal(next.getHours(), 9);
    assert.equal(next.getMinutes(), 15);
    assert.equal(next.getDay(), 1);
    assert.doesNotThrow(() => cron.validate('0 9 * * 7'));
  });

  test('rejects invalid cron expressions', () => {
    const cron = new ScheduleCronService();

    assert.throws(() => cron.validate('* * *'), /five fields/);
    assert.throws(() => cron.validate('99 * * * *'), /minute value/);
  });
});
