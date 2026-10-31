import { describe, expect, it } from '@jest/globals';

import { normalizeRegistrationFamilyMembers } from './registration-family';
import { formatBirthDateInput, getAgeFromBirthDate, getBirthDate } from './birth-date';

describe('registration family names', () => {
  it('trims names and retains distinct surnames and single characters', () => {
    const age = getAgeFromBirthDate('2020-02-29')!;
    expect(normalizeRegistrationFamilyMembers([{ name: ' ع ', surname: ' Andere Familie ', birthDate: '29.02.2020' }])).toEqual([
      { name: 'ع', surname: 'Andere Familie', birth_date: '2020-02-29', age },
    ]);
  });

  it.each([
    [],
    [{ name: ' ', surname: 'Name' }],
    [{ name: 'Kind', surname: '' }],
    [{ name: 'A'.repeat(81), surname: 'Name' }],
    [{ name: 'Kind', surname: 'B'.repeat(81) }],
    Array.from({ length: 50 }, () => ({ name: 'Kind', surname: 'Name' })),
  ].map(members => ({ members: members.map(member => ({ ...member, birthDate: '29.02.2020' })) })))('rejects an incomplete or oversized family list: %j', ({ members }) => {
    expect(normalizeRegistrationFamilyMembers(members)).toBeNull();
  });

  it.each<[string, number | null]>([
    ['2000-10-25', 25], ['2000-10-24', 26], ['2000-10-23', 26],
    ['2026-10-24', 0], ['1906-10-24', 120], ['1905-10-24', null],
    ['2026-10-25', null], ['2020-02-30', null], ['', null],
  ])('checks age in completed years for %s', (birthDate, expected) => {
    expect(getAgeFromBirthDate(birthDate, new Date(2026, 9, 24, 12))).toBe(expected);
  });

  it('increments a leap-day birthday on March 1 in a non-leap year', () => {
    expect(getAgeFromBirthDate('2020-02-29', new Date(2026, 1, 28, 12))).toBe(5);
    expect(getAgeFromBirthDate('2020-02-29', new Date(2026, 2, 1, 12))).toBe(6);
  });
});

describe('birth dates', () => {
  const today = new Date(2026, 9, 24, 12);

  it.each([
    ['29.02.2020', '2020-02-29'],
    ['29.02.2000', '2000-02-29'],
    ['01.01.0099', '0099-01-01'],
    ['24.10.2026', '2026-10-24'],
    [' 24.03.2015 ', '2015-03-24'],
  ])('stores %s as calendar date %s', (value, expected) => {
    expect(getBirthDate(value, today)).toBe(expected);
  });

  it.each(['', '1.1.2020', '2020-02-29', '29.02.1900', '29.02.2021', '31.04.2020', '00.03.2020', '15.00.2020', '15.13.2020', '01.01.0000', '25.10.2026', '01.01.9999'])('rejects invalid or future dates: %s', value => {
    expect(getBirthDate(value, today)).toBeNull();
  });

  it.each([
    ['2', '2'], ['29', '29'], ['290', '29.0'], ['2902', '29.02'],
    ['29022', '29.02.2'], ['29022020', '29.02.2020'], ['29.02.202', '29.02.202'],
    ['٢٩٠٢٢٠٢٠', '29.02.2020'], ['۲۹۰۲۲۰۲۰', '29.02.2020'],
  ])('formats typing and deletion %s as %s', (value, expected) => {
    expect(formatBirthDateInput(value)).toBe(expected);
  });
});
