import { describe, expect, it } from '@jest/globals';
import { parseWakeUpDateTime, wakeUpDateTimeFields } from './wake-up-call-time';

describe('planned wake-up calls in Iraqi time', () => {
  it('converts Baghdad midnight to the previous UTC date', () => {
    expect(parseWakeUpDateTime('2026-10-10', '00:30')?.toISOString()).toBe('2026-10-09T21:30:00.000Z');
  });
  it('rejects invalid calendar dates and times instead of rolling over', () => {
    expect(parseWakeUpDateTime('2026-02-29', '06:00')).toBeNull();
    expect(parseWakeUpDateTime('2026-10-10', '24:00')).toBeNull();
    expect(parseWakeUpDateTime('2026-10-10', '06:60')).toBeNull();
    expect(parseWakeUpDateTime('2028-02-29', '06:00')?.toISOString()).toBe('2028-02-29T03:00:00.000Z');
  });
  it('restores the same wall time when editing regardless of device time zone', () => {
    expect(wakeUpDateTimeFields(new Date('2026-10-09T21:30:00Z'))).toEqual({ date: '2026-10-10', time: '00:30' });
  });
});
