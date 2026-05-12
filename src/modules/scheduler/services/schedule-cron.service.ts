import { Injectable } from '@nestjs/common';

interface CronFieldSpec {
  name: string;
  min: number;
  max: number;
}

interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

const FIELD_SPECS: CronFieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 7 },
];

@Injectable()
export class ScheduleCronService {
  validate(expression: string): void {
    this.parse(expression);
  }

  nextRunAt(expression: string, from: Date = new Date()): Date {
    const parsed = this.parse(expression);
    const cursor = new Date(from.getTime());
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    const maxIterations = 60 * 24 * 366 * 5;
    for (let i = 0; i < maxIterations; i += 1) {
      if (this.matches(parsed, cursor)) {
        return cursor;
      }
      cursor.setMinutes(cursor.getMinutes() + 1);
    }

    throw new Error(`Cron expression has no next run in five years: ${expression}`);
  }

  due(now: Date, nextRunAt?: string): boolean {
    if (!nextRunAt) {
      return false;
    }
    const dueAt = Date.parse(nextRunAt);
    return Number.isFinite(dueAt) && dueAt <= now.getTime();
  }

  describe(expression: string): string {
    const trimmed = expression.trim();
    if (/^\*\/(\d+) \* \* \* \*$/.test(trimmed)) {
      return `Every ${trimmed.match(/^\*\/(\d+)/)?.[1]} minutes`;
    }
    if (/^0 \* \* \* \*$/.test(trimmed)) {
      return 'Hourly';
    }
    const daily = trimmed.match(/^(\d+) (\d+) \* \* \*$/);
    if (daily) {
      return `Daily at ${daily[2].padStart(2, '0')}:${daily[1].padStart(2, '0')}`;
    }
    const weekly = trimmed.match(/^(\d+) (\d+) \* \* ([0-7])$/);
    if (weekly) {
      return `Weekly on day ${weekly[3]} at ${weekly[2].padStart(2, '0')}:${weekly[1].padStart(2, '0')}`;
    }
    return trimmed;
  }

  private parse(expression: string): ParsedCron {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) {
      throw new Error('Cron expression must contain five fields: minute hour day-of-month month day-of-week.');
    }

    const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields.map((field, index) =>
      this.parseField(field, FIELD_SPECS[index]));

    if (daysOfWeek.has(7)) {
      daysOfWeek.add(0);
      daysOfWeek.delete(7);
    }

    return { minutes, hours, daysOfMonth, months, daysOfWeek };
  }

  private parseField(field: string, spec: CronFieldSpec): Set<number> {
    const values = new Set<number>();
    for (const part of field.split(',')) {
      this.addPart(values, part.trim(), spec);
    }
    if (values.size === 0) {
      throw new Error(`Cron ${spec.name} field cannot be empty.`);
    }
    return values;
  }

  private addPart(values: Set<number>, part: string, spec: CronFieldSpec): void {
    if (!part) {
      throw new Error(`Cron ${spec.name} field contains an empty segment.`);
    }

    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Cron ${spec.name} step must be a positive integer.`);
    }

    const [start, end] = this.range(rangePart, spec);
    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  private range(rangePart: string, spec: CronFieldSpec): [number, number] {
    if (rangePart === '*') {
      return [spec.min, spec.max];
    }

    if (rangePart.includes('-')) {
      const [rawStart, rawEnd] = rangePart.split('-');
      const start = this.parseNumber(rawStart, spec);
      const end = this.parseNumber(rawEnd, spec);
      if (end < start) {
        throw new Error(`Cron ${spec.name} range end must be greater than start.`);
      }
      return [start, end];
    }

    const value = this.parseNumber(rangePart, spec);
    return [value, value];
  }

  private parseNumber(raw: string, spec: CronFieldSpec): number {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
      throw new Error(`Cron ${spec.name} value must be between ${spec.min} and ${spec.max}.`);
    }
    return value;
  }

  private matches(parsed: ParsedCron, date: Date): boolean {
    const dayOfWeek = date.getDay();
    return parsed.minutes.has(date.getMinutes())
      && parsed.hours.has(date.getHours())
      && parsed.daysOfMonth.has(date.getDate())
      && parsed.months.has(date.getMonth() + 1)
      && parsed.daysOfWeek.has(dayOfWeek);
  }
}
