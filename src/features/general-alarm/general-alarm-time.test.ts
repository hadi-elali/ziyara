import { describe, expect, it } from '@jest/globals';

import {
  maximumGeneralAlarmDepartureMinutes,
  parseGeneralAlarmDepartureMinutes,
} from '@/features/general-alarm/general-alarm-time';

describe('general alarm departure time', () => {
  it.each([
    ['1', 1],
    ['25', 25],
    [' 60 ', 60],
    ['١٥', 15],
    ['۲۵', 25],
    [String(maximumGeneralAlarmDepartureMinutes), maximumGeneralAlarmDepartureMinutes],
  ])('parses %s as %i minutes', (value, expected) => {
    expect(parseGeneralAlarmDepartureMinutes(value)).toBe(expected);
  });

  it.each(['', '0', '-1', '1.5', 'abc', '1441', '10000'])(
    'rejects invalid value %s',
    (value) => {
      expect(parseGeneralAlarmDepartureMinutes(value)).toBeNull();
    },
  );
});
