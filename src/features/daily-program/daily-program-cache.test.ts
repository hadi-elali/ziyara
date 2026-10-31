import { describe, expect, it } from '@jest/globals';

import type { DailyProgram } from '@/domain/database';
import { parseDailyProgramCache } from '@/features/daily-program/daily-program-cache';

const program: DailyProgram = {
  created_at: '2026-08-31T08:00:00Z',
  details: '08:00 Frühstück',
  id: 4,
  program_date: '2026-08-31',
  published_by_profile_id: 1,
  items: [{ id: 40, program_id: 4, position: 0, details: '08:00 Frühstück',
    push_scheduled_at: '2026-08-31T06:00:00Z', push_started_at: null }],
  push_scheduled_at: null,
  push_started_at: null,
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
    { programs: [{ ...program, push_scheduled_at: 'invalid' }], userId: 'daily-program-user' },
    { programs: [{ ...program, items: [{ ...program.items[0], program_id: 99 }] }], userId: 'daily-program-user' },
    { programs: [{ ...program, items: [{ ...program.items[0], push_scheduled_at: 'invalid' }] }], userId: 'daily-program-user' },
  ])('verwirft einen ungültigen Cache %#', (value) => {
    expect(parseDailyProgramCache(value)).toBeUndefined();
  });

  it('akzeptiert einen bewusst geleerten Cache', () => {
    expect(parseDailyProgramCache(null)).toBeNull();
  });

  it('ergänzt einen älteren Cache um deaktivierte Push-Einstellungen', () => {
    const legacy = { ...program } as Partial<DailyProgram>;
    delete legacy.push_scheduled_at;
    delete legacy.push_started_at;
    delete legacy.items;
    expect(parseDailyProgramCache({ programs: [legacy], userId: 'daily-program-user' })?.programs)
      .toEqual([{ ...program, items: [] }]);
  });
});
