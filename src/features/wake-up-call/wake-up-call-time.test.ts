import { describe, expect, it } from '@jest/globals';
import { formatWakeUpTime, parseWakeUpDateTime, wakeUpDateTimeFields } from './wake-up-call-time';

describe('planned wake-up calls in the sender’s local time', () => {
  it('resolves midnight using the device time zone', () => {
    expect(parseWakeUpDateTime('2026-10-10', '00:30')).toEqual(new Date(2026, 9, 10, 0, 30));
  });
  it('rejects invalid calendar dates and times instead of rolling over', () => {
    expect(parseWakeUpDateTime('2026-02-29', '06:00')).toBeNull();
    expect(parseWakeUpDateTime('2026-10-10', '24:00')).toBeNull();
    expect(parseWakeUpDateTime('2026-10-10', '06:60')).toBeNull();
    expect(parseWakeUpDateTime('2026-04-31', '06:00')).toBeNull();
    expect(parseWakeUpDateTime('2026-13-10', '06:00')).toBeNull();
    expect(parseWakeUpDateTime('10.10.2026', '06:00')).toBeNull();
    expect(parseWakeUpDateTime('2028-02-29', '06:00')).toEqual(new Date(2028, 1, 29, 6));
  });
  it('restores the local date and time when editing a stored UTC timestamp', () => {
    const stored = new Date(2026, 9, 10, 0, 30).toISOString();
    expect(wakeUpDateTimeFields(new Date(stored))).toEqual({ date: '2026-10-10', time: '00:30' });
    expect(parseWakeUpDateTime('2026-10-10', '00:30')?.toISOString()).toBe(stored);
  });
  it('shows the stored time in the device time zone in every UI language', () => {
    const stored = new Date(2026, 9, 10, 6, 15).toISOString();
    expect(formatWakeUpTime(stored, 'de')).toBe('10.10.2026, 06:15');
    expect(formatWakeUpTime(stored, 'en')).toBe('Oct 10, 2026, 6:15 AM');
    expect(formatWakeUpTime(stored, 'ar')).toMatch(/(?:6:15|٦:١٥)/);
  });

  // Run this suite with TZ=Europe/Berlin to cover both clock changes.
  const berlinTest = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Berlin'
    ? it
    : it.skip;
  berlinTest('uses the offset of the scheduled date across summer and winter', () => {
    expect(parseWakeUpDateTime('2026-07-10', '06:00')?.toISOString()).toBe('2026-07-10T04:00:00.000Z');
    expect(parseWakeUpDateTime('2026-12-10', '06:00')?.toISOString()).toBe('2026-12-10T05:00:00.000Z');
  });
  berlinTest('rejects nonexistent local times during the spring clock change', () => {
    expect(parseWakeUpDateTime('2026-03-29', '02:30')).toBeNull();
    expect(parseWakeUpDateTime('2026-03-29', '03:30')?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });
  berlinTest('chooses the first occurrence of a repeated local time in autumn', () => {
    expect(parseWakeUpDateTime('2026-10-25', '02:30')?.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
});
