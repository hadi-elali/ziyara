import { describe, expect, it } from '@jest/globals';

import type { DailyProgram } from '@/domain/database';
import { parseDailyProgramCache } from '@/features/daily-program/daily-program-cache';

const program: DailyProgram = {
  created_at: '2026-08-31T08:00:00Z',
  details: '08:00 Frühstück',
  id: 4,
  program_date: '2026-08-31',
  published_by_profile_id: 1,
  title: 'Karbala',
  updated_at: '2026-08-31T08:00:00Z',
};

describe('parseDailyProgramCache', () => {
  it('übernimmt einen validen benutzergebundenen Programm-Cache', () => {
    const cached = { programs: [program], userId: 'daily-program-user' };
    expect(parseDailyProgramCache(cached)).toEqual(cached);
  });

  it('akzeptiert einen erfolgreichen Stand ohne veröffentlichte Programme', () => {
    expect(
      parseDailyProgramCache({ programs: [], userId: 'daily-program-user' }),
    ).toEqual({ programs: [], userId: 'daily-program-user' });
  });

  it.each([
    undefined,
    [],
    { programs: [program], userId: '' },
    {
      programs: [{ ...program, program_date: '2026-02-30' }],
      userId: 'daily-program-user',
    },
    { programs: [{ ...program, id: '4' }], userId: 'daily-program-user' },
  ])('verwirft einen ungültigen Cache %#', (value) => {
    expect(parseDailyProgramCache(value)).toBeUndefined();
  });

  it('akzeptiert einen bewusst geleerten Cache', () => {
    expect(parseDailyProgramCache(null)).toBeNull();
  });
});
