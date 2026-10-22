import { describe, expect, it } from '@jest/globals';

import type { DailyProgram } from '@/domain/database';
import {
  addDaysToISODate,
  dailyProgramDateRange,
  localISODate,
  nextDailyProgramDate,
  parseLocalISODate,
  splitProgramDetails,
  visibleDailyPrograms,
} from '@/features/daily-program/daily-program-state';

function program(id: number, programDate: string): DailyProgram {
  return {
    created_at: '2026-08-28T00:00:00.000Z',
    details: `Programm ${id}`,
    id,
    program_date: programDate,
    published_by_profile_id: 1,
    title: null,
    updated_at: '2026-08-28T00:00:00.000Z',
  };
}

describe('daily program date helpers', () => {
  it('formatiert ein Datum ohne UTC-Verschiebung als lokales ISO-Datum', () => {
    expect(localISODate(new Date(2026, 7, 28, 23, 30))).toBe('2026-08-28');
  });

  it('weist ungültige Kalendertage zurück', () => {
    expect(parseLocalISODate('2026-02-29')).toBeNull();
    expect(parseLocalISODate('28.08.2026')).toBeNull();
    expect(parseLocalISODate('2028-02-29')).not.toBeNull();
  });

  it('erzeugt aufeinanderfolgende Tage auch über Monatsgrenzen', () => {
    expect(dailyProgramDateRange('2026-08-30', 4)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
    expect(addDaysToISODate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('erlaubt mehr als vierzehn Tage und weist ungültige Anzahlen zurück', () => {
    expect(dailyProgramDateRange('2026-08-28', 31)).toHaveLength(31);
    expect(dailyProgramDateRange('2026-08-28', 31).at(-1)).toBe('2026-09-27');
    expect(dailyProgramDateRange('2026-08-28', 0)).toEqual([]);
    expect(dailyProgramDateRange('2026-08-28', 1.5)).toEqual([]);
    expect(dailyProgramDateRange('2026-08-28', Infinity)).toEqual([]);
    expect(dailyProgramDateRange('2026-02-29', 1)).toEqual([]);
  });

  it('zeigt nur heute und kommende Programme chronologisch an', () => {
    expect(
      visibleDailyPrograms(
        [
          program(3, '2026-08-30'),
          program(1, '2026-08-27'),
          program(2, '2026-08-28'),
          program(4, '2026-08-29'),
        ],
        '2026-08-28',
      ).map((item) => item.id),
    ).toEqual([2, 4, 3]);
  });

  it('zeigt auch Programme nach dem vierzehnten Tag an', () => {
    const programs = dailyProgramDateRange('2026-08-28', 31).map((date, index) =>
      program(index + 1, date),
    );
    expect(visibleDailyPrograms(programs, '2026-08-28')).toHaveLength(31);
  });

  it('setzt die Planung nach dem letzten veröffentlichten Tag fort', () => {
    expect(nextDailyProgramDate([], '2026-12-30')).toBe('2026-12-30');
    expect(nextDailyProgramDate([program(1, '2026-12-29')], '2026-12-30')).toBe('2026-12-30');
    expect(
      nextDailyProgramDate(
        [program(2, '2026-12-31'), program(1, '2026-12-30')],
        '2026-12-30',
      ),
    ).toBe('2027-01-01');
  });

  it('teilt mehrzeilige Programme in sichtbare Ablaufpunkte', () => {
    expect(splitProgramDetails('08:00 Frühstück\r\n\n 09:00 Abfahrt ')).toEqual([
      '08:00 Frühstück',
      '09:00 Abfahrt',
    ]);
  });
});
